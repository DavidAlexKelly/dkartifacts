"""
vector: any vector data as one vector-tile pyramid (kind "vector-tiles").

Every input is read into ONE line-delimited GeoJSON file in WGS84, then
tippecanoe tiles it into a single source layer and the chunker cuts the
pyramid like any other. While reading, the schema is collected so the
manifest can tell the studio what is in the tiles without it reading any:

    encoding: { sourceLayer, geometryTypes: ["Point", "LineString", "Polygon"],
                fields: {name: "string" | "number" | "boolean" | "mixed"},
                featureCount }

Geometry types are reported as MapLibre's filter types: Multi* counts as its
single form.

READERS
-------
  .geojson .json                FeatureCollection, Feature or bare geometry (pure Python)
  .ndjson .geojsonl .geojsons .jsonl
                                one Feature / geometry per line, RS-separated GeoJSONSeq too
  .csv .tsv                     lat/lon columns (lat, latitude, y / lon, lng, long, longitude, x)
                                or a WKT column (wkt, geometry, geom, the_geom); numeric and
                                true/false columns become numbers and booleans
  anything else (.gpkg .shp .fgb .gml .kml …)
                                pyogrio (GDAL in its wheels, `pip install pyogrio`); without it
                                the `ogr2ogr` command when it is on PATH

Reprojection: GeoJSON's legacy `crs` member, the CRS GDAL reports for other
formats, or `--crs` (which wins, and is how CSV x/y in a projected CRS is
declared) are transformed to WGS84 with rasterio.warp.transform_geom.

TILING
------
tippecanoe with general-purpose defaults:
  -zg (guess max zoom from feature spacing, but at least z10) unless
    --max-zoom is given;
  --drop-densest-as-needed: when a LOW-zoom tile is over 500 KB, the densest
    features (in practice points) are thinned there;
  --extend-zooms-if-still-dropping: if even the deepest zoom would drop
    features, more zooms are added until none are, so every feature is in the
    tiles at the deepest zoom.
  `keep_all` turns off every size limit and drop instead (big tiles).

Requires the `tippecanoe` command (https://github.com/felt/tippecanoe).
"""

from __future__ import annotations

import csv
import json
import logging
import math
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

log = logging.getLogger(__name__)

GEOJSON_EXT = {".geojson", ".json"}
NDJSON_EXT = {".ndjson", ".geojsonl", ".geojsons", ".geojsonseq", ".jsonl"}
CSV_EXT = {".csv", ".tsv"}
BASE_TYPE = {
    "Point": "Point", "MultiPoint": "Point",
    "LineString": "LineString", "MultiLineString": "LineString",
    "Polygon": "Polygon", "MultiPolygon": "Polygon",
}
TYPE_ORDER = ["Point", "LineString", "Polygon"]
GUESS_FLOOR = 10  # lowest max zoom -zg may pick: z10 tiles hold ~10 m of precision
LAT_NAMES = ["lat", "latitude", "y"]
LON_NAMES = ["lon", "lng", "long", "longitude", "x"]
WKT_NAMES = ["wkt", "geometry", "geom", "the_geom"]


def layer_name_for(path: Path) -> str:
    name = re.sub(r"[^A-Za-z0-9_-]+", "_", path.stem).strip("_")
    return name or "features"


def needs_gdal(path: Path) -> bool:
    s = path.suffix.lower()
    return s not in GEOJSON_EXT | NDJSON_EXT | CSV_EXT


def gdal_reader() -> str | None:
    """'pyogrio', 'ogr2ogr', or None: what reads non-GeoJSON/CSV formats here."""
    try:
        import pyogrio  # noqa: F401

        return "pyogrio"
    except ImportError:
        pass
    return "ogr2ogr" if shutil.which("ogr2ogr") else None


# ── Schema collected while reading ──────────────────────────────────────────


@dataclass
class Schema:
    count: int = 0
    skipped: int = 0
    geometry_types: set = field(default_factory=set)
    fields: dict = field(default_factory=dict)
    west: float = math.inf
    south: float = math.inf
    east: float = -math.inf
    north: float = -math.inf

    def add(self, geom: dict, props: dict) -> None:
        self.count += 1
        self._types(geom)
        for k, v in props.items():
            t = value_type(v)
            if t is None:
                continue
            old = self.fields.get(k)
            self.fields[k] = t if old in (None, t) else "mixed"
        self._extent(geom.get("coordinates") if geom.get("type") != "GeometryCollection" else
                     [g.get("coordinates") for g in geom.get("geometries", [])])

    def _types(self, geom: dict) -> None:
        if geom.get("type") == "GeometryCollection":
            for g in geom.get("geometries", []):
                self._types(g)
        elif geom.get("type") in BASE_TYPE:
            self.geometry_types.add(BASE_TYPE[geom["type"]])

    def _extent(self, coords) -> None:
        if not coords:
            return
        if isinstance(coords[0], (int, float)):
            lon, lat = coords[0], coords[1]
            self.west, self.east = min(self.west, lon), max(self.east, lon)
            self.south, self.north = min(self.south, lat), max(self.north, lat)
            return
        for c in coords:
            self._extent(c)

    def bounds(self) -> list[float] | None:
        if self.count == 0 or not math.isfinite(self.west):
            return None
        return [self.west, self.south, self.east, self.north]

    def encoding(self, source_layer: str) -> dict:
        return {
            "sourceLayer": source_layer,
            "geometryTypes": [t for t in TYPE_ORDER if t in self.geometry_types],
            "fields": dict(sorted(self.fields.items())),
            "featureCount": self.count,
        }


def value_type(v) -> str | None:
    if v is None or (isinstance(v, float) and not math.isfinite(v)):
        return None
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        return "number"
    return "string"  # strings, and objects/arrays (tippecanoe writes those as JSON strings)


# ── Readers: each yields (geometry, properties) in the file's own CRS ───────


Feature = tuple[dict, dict]


def _as_feature(obj: dict) -> Feature | None:
    if not isinstance(obj, dict):
        return None
    if obj.get("type") == "Feature":
        geom = obj.get("geometry")
        props = obj.get("properties") or {}
    elif obj.get("type") in BASE_TYPE or obj.get("type") == "GeometryCollection":
        geom, props = obj, {}
    else:
        return None
    if not geom or not geom.get("type"):
        return None
    return geom, props


def _crs_from_geojson(obj: dict) -> str | None:
    name = ((obj.get("crs") or {}).get("properties") or {}).get("name")
    if not name or "CRS84" in name.upper():
        return None
    return name


def read_geojson(path: Path) -> tuple[str | None, Iterator[Feature]]:
    with open(path, encoding="utf-8-sig") as f:
        try:
            obj = json.load(f)
        except json.JSONDecodeError:
            # A .json/.geojson that is really one feature per line.
            return read_ndjson(path)
    crs = _crs_from_geojson(obj) if isinstance(obj, dict) else None

    def gen():
        if isinstance(obj, dict) and obj.get("type") == "FeatureCollection":
            items = obj.get("features") or []
        elif isinstance(obj, list):
            items = obj
        else:
            items = [obj]
        for item in items:
            feat = _as_feature(item)
            yield feat if feat else (None, None)
    return crs, gen()


def read_ndjson(path: Path) -> tuple[str | None, Iterator[Feature]]:
    def gen():
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip().lstrip("\x1e")
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    yield None, None
                    continue
                if isinstance(obj, dict) and obj.get("type") == "FeatureCollection":
                    for item in obj.get("features") or []:
                        feat = _as_feature(item)
                        yield feat if feat else (None, None)
                    continue
                feat = _as_feature(obj)
                yield feat if feat else (None, None)
    return None, gen()


def _parse_scalar(v: str, kind: str):
    if v == "":
        return None
    if kind == "number":
        f = float(v)
        return int(f) if f.is_integer() and re.fullmatch(r"[+-]?\d+", v.strip()) else f
    if kind == "boolean":
        return v.strip().lower() == "true"
    return v


def _value_kind(v: str) -> str | None:
    s = v.strip()
    if not s:
        return None
    if s.lower() in ("true", "false"):
        return "boolean"
    if s.lower() in ("nan", "inf", "-inf", "+inf", "infinity", "-infinity"):
        return "string"
    try:
        float(s)
        return "number"
    except ValueError:
        return "string"


def read_csv(path: Path, *, lat_field: str | None = None, lon_field: str | None = None,
             wkt_field: str | None = None) -> tuple[str | None, Iterator[Feature]]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        sample = f.read(64 * 1024)
    if path.suffix.lower() == ".tsv":
        dialect = csv.excel_tab
    else:
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, dialect=dialect)
        columns = reader.fieldnames or []
        lower = {c.lower().strip(): c for c in columns}

        def pick(given, names):
            if given:
                if given not in columns:
                    raise ValueError(f"{path}: no column {given!r} (columns: {', '.join(columns)})")
                return given
            return next((lower[n] for n in names if n in lower), None)

        wkt = pick(wkt_field, WKT_NAMES) if not (lat_field or lon_field) else None
        lat = lon = None
        if not wkt:
            lat, lon = pick(lat_field, LAT_NAMES), pick(lon_field, LON_NAMES)
            if not (lat and lon):
                raise ValueError(f"{path}: no lat/lon or WKT column found (columns: {', '.join(columns)}); "
                                 "name them with --lat-field/--lon-field or --wkt-field")
        geo_cols = {c for c in (wkt, lat, lon) if c}
        props_cols = [c for c in columns if c not in geo_cols]
        # First pass: one type per column, so "12" and "12.5" are numbers in every feature.
        seen: dict[str, set] = {c: set() for c in props_cols}
        for row in reader:
            for c in props_cols:
                k = _value_kind(row.get(c) or "")
                if k:
                    seen[c].add(k)
        kinds = {c: (ks.pop() if len(ks) == 1 else "string") for c, ks in seen.items()}

    def gen():
        from shapely import wkt as shapely_wkt
        from shapely.geometry import mapping

        with open(path, newline="", encoding="utf-8-sig") as f:
            for row in csv.DictReader(f, dialect=dialect):
                try:
                    if wkt:
                        geom = mapping(shapely_wkt.loads(row[wkt]))
                    else:
                        geom = {"type": "Point", "coordinates": [float(row[lon]), float(row[lat])]}
                except Exception:  # noqa: BLE001 — a bad row is skipped and counted
                    yield None, None
                    continue
                props = {}
                for c in props_cols:
                    v = _parse_scalar(row.get(c) or "", kinds[c])
                    if v is not None:
                        props[c] = v
                yield geom, props
    return None, gen()


def _py(v):
    import numpy as np

    if isinstance(v, np.generic):
        v = v.item()
    if isinstance(v, bytes):
        return v.hex()
    if isinstance(v, float) and not math.isfinite(v):
        return None
    return v


def read_pyogrio(path: Path, layer: str | None = None, batch: int = 50_000) -> tuple[str | None, Iterator[Feature]]:
    import pyogrio
    from pyogrio.raw import read
    from shapely import from_wkb
    from shapely.geometry import mapping

    info = pyogrio.read_info(path, layer=layer)
    crs = info.get("crs")
    total = info.get("features") or 0

    def gen():
        start = 0
        while start < total or (total < 0 and start == 0):
            # A driver that can't count its features (total -1) is read in one go.
            meta, _, geoms, data = read(path, layer=layer, skip_features=start,
                                        max_features=batch if total >= 0 else None,
                                        datetime_as_string=True)
            names = list(meta["fields"])
            n = len(geoms) if geoms is not None else 0
            if n == 0:
                break
            shapes = from_wkb(geoms)
            for i in range(n):
                if shapes[i] is None or shapes[i].is_empty:
                    yield None, None
                    continue
                props = {}
                for name, col in zip(names, data):
                    v = _py(col[i])
                    if v is not None:
                        props[name] = v
                yield mapping(shapes[i]), props
            start += n
    return crs, gen()


def read_ogr2ogr(path: Path, layer: str | None, work: Path) -> tuple[str | None, Iterator[Feature]]:
    exe = shutil.which("ogr2ogr")
    if not exe:
        raise RuntimeError(f"reading {path.suffix} needs pyogrio (`pip install pyogrio`) or the `ogr2ogr` command")
    out = work / f"{path.stem}.ogr.geojsons"
    cmd = [exe, "-f", "GeoJSONSeq", "-t_srs", "EPSG:4326", "-overwrite", str(out), str(path)]
    if layer:
        cmd.append(layer)
    subprocess.run(cmd, check=True)
    return None, read_ndjson(out)[1]


def open_features(path: Path, *, layer: str | None, lat_field, lon_field, wkt_field, work: Path):
    s = path.suffix.lower()
    if s in GEOJSON_EXT:
        return read_geojson(path)
    if s in NDJSON_EXT:
        return read_ndjson(path)
    if s in CSV_EXT:
        return read_csv(path, lat_field=lat_field, lon_field=lon_field, wkt_field=wkt_field)
    reader = gdal_reader()
    if reader == "pyogrio":
        return read_pyogrio(path, layer)
    return read_ogr2ogr(path, layer, work)


# ── Normalising to WGS84 NDJSON ─────────────────────────────────────────────


def _is_wgs84(crs) -> bool:
    if crs is None:
        return True
    from rasterio.crs import CRS

    c = CRS.from_user_input(crs)
    return c.to_epsg() == 4326 or "CRS84" in c.to_string().upper()


def write_ndjson(files: list[Path], out: Path, *, crs: str | None = None, layer: str | None = None,
                 lat_field: str | None = None, lon_field: str | None = None, wkt_field: str | None = None,
                 batch: int = 2000) -> Schema:
    from rasterio.warp import transform_geom

    schema = Schema()
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=out.parent) as tmp, open(out, "w", encoding="utf-8") as f:
        for path in files:
            src_crs, features = open_features(Path(path), layer=layer, lat_field=lat_field, lon_field=lon_field,
                                              wkt_field=wkt_field, work=Path(tmp))
            src_crs = crs or src_crs
            reproject = not _is_wgs84(src_crs)
            if reproject:
                log.info("%s: reprojecting from %s to WGS84", path, src_crs)
            pending: list[Feature] = []

            def flush():
                geoms = [g for g, _ in pending]
                if reproject and geoms:
                    geoms = transform_geom(src_crs, "EPSG:4326", geoms)
                for g, (_, props) in zip(geoms, pending):
                    g = json.loads(json.dumps(g))  # tuples -> lists, numpy -> plain
                    schema.add(g, props)
                    f.write(json.dumps({"type": "Feature", "properties": props, "geometry": g},
                                       separators=(",", ":"), ensure_ascii=False, default=str))
                    f.write("\n")
                pending.clear()

            before = schema.count
            for geom, props in features:
                if geom is None:
                    schema.skipped += 1
                    continue
                pending.append((geom, props))
                if len(pending) >= batch:
                    flush()
            flush()
            log.info("%s: %d features", path, schema.count - before)
    if schema.skipped:
        log.warning("vector: skipped %d features with no or unreadable geometry", schema.skipped)
    if schema.count == 0:
        raise RuntimeError("no features with geometry in the input")
    return schema


def tile_vector(ndjson: Path, mbtiles: Path, *, layer_name: str, min_zoom: int, max_zoom: int | None,
                keep_all: bool = False, attribution: str = "", name: str = "") -> Path:
    exe = shutil.which("tippecanoe")
    if not exe:
        raise RuntimeError("the `tippecanoe` command is not on PATH — see https://github.com/felt/tippecanoe")
    cmd = [
        exe, "-o", str(mbtiles), "--force", "--quiet",
        "-l", layer_name,
        f"-Z{min_zoom}", "-P",
    ]
    # -zg guesses from feature spacing, and guesses z0 for a handful of features,
    # which leaves ~10 km of precision; a floor keeps small datasets usable.
    cmd += [f"-z{max_zoom}"] if max_zoom is not None else ["-zg", f"--smallest-maximum-zoom-guess={GUESS_FLOOR}"]
    if keep_all:
        cmd += ["--no-tile-size-limit", "--no-feature-limit", "-r1"]
    else:
        cmd += ["--drop-densest-as-needed", "--extend-zooms-if-still-dropping"]
    if attribution:
        cmd += ["--attribution", attribution]
    if name:
        cmd += ["-n", name]
    cmd.append(str(ndjson))
    log.info("running %s", " ".join(cmd))
    subprocess.run(cmd, check=True)
    return mbtiles
