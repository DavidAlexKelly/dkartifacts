"""
Countries for @acc/decho-countries, built in Foundry from raw downloads.

INPUT: one dataset of raw files, as downloaded (names are matched loosely,
so the version suffixes in them do not matter):

    Natural Earth 1:10m       ne_10m_admin_0_countries.{shp,shx,dbf,prj,cpg}
                              ne_10m_admin_0_countries.VERSION.txt   (optional)
                              ne_10m_populated_places.{shp,shx,dbf,cpg}
    World Bank (CSV export)   API_SP.POP.TOTL_*.csv        population
                              API_AG.LND.TOTL.K2_*.csv     land area
                              API_AG.SRF.TOTL.K2_*.csv     total (surface) area
                              API_NY.GDP.MKTP.CD_*.csv     GDP
                              API_NY.GDP.PCAP.CD_*.csv     GDP per person
                              Metadata_Country_*.csv       region and income group
                                                           (any one; they are identical)

The Metadata_Indicator_*.csv and README files are not needed.

OUTPUTS: two datasets.

    countries_map    files, exactly what the package reads — point
                     countries({ store: { kind: "dataset", datasetRid } }) at it:
                        manifest.json
                        countries.json
                        views/<view>/low.geojson    simplified, from zoom 0
                        views/<view>/high.geojson   full 1:10m, from zoom 4
    countries        a table, one row per country: codes, names, regions,
                     every figure with its year, capital, and the outline as
                     a GeoJSON string — for Contour, the Ontology, or joins.

WHAT IT DOES (the same rules as scripts/build-data.mjs, so either builds the
same dataset):

  - Ids: the ISO alpha-3 code where there is one (ISO_A3_EH, not ISO_A3,
    which is -99 for France and Norway), else Natural Earth's ADM0_A3
    (Kosovo, Somaliland…).
  - Border views: the de facto view plus one per Natural Earth point of view
    (ADM0_A3_US, ADM0_A3_IN…) that assigns any unit differently; units a view
    counts as one country are merged into one outline. Views that come out
    identical share files.
  - Figures: each World Bank series' most recent non-empty year, per country;
    Natural Earth's 2019 estimates where the World Bank has nothing; total
    area computed from the outline where neither has it.
  - Regions: UN region and subregion, continent (Natural Earth), World Bank
    region and income group (World Bank metadata, falling back to Natural
    Earth).

DEPENDENCIES: shapely (2.0 or later, for set_precision), pyshp, pandas. In a
Foundry Python transforms repo, add `shapely` and `pyshp` to the run
requirements in conda_recipe/meta.yaml. pyshp is pure Python, so there is no
GDAL to install.

SET THE PATHS in the @transform decorator at the bottom.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Dict, Iterable, List, Optional, Tuple

import shapefile  # pyshp
from shapely import set_precision
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

MANIFEST_SCHEMA = 1

# Where the full-detail outlines take over from the simplified ones.
HIGH_DETAIL_FROM_ZOOM = 4
# Simplification for the low-detail outlines, in degrees (~5 km), and how
# many decimals each level keeps (2 ≈ 1 km, 4 ≈ 10 m).
LOW_TOLERANCE = 0.05
LOW_DECIMALS = 2
HIGH_DECIMALS = 4

WORLD_BANK_SERIES = {
    "SP.POP.TOTL": "population",
    "AG.LND.TOTL.K2": "landAreaKm2",
    "AG.SRF.TOTL.K2": "totalAreaKm2",
    "NY.GDP.MKTP.CD": "gdpUsd",
    "NY.GDP.PCAP.CD": "gdpPerCapitaUsd",
}

# Where the World Bank's code is not the record's ISO code.
WORLD_BANK_ALIASES = {"KOS": "XKX"}

REGION_SCHEMES = [
    ("un-region", "UN regions", "REGION_UN"),
    ("un-subregion", "UN subregions", "SUBREGION"),
    ("wb-region", "World Bank regions", "REGION_WB"),
    ("continent", "Continents", "CONTINENT"),
    ("income", "Income groups", "INCOME_GRP"),
]

NAME_FIELDS = [
    "AR", "BN", "DE", "EL", "EN", "ES", "FA", "FR", "HE", "HI", "HU", "ID", "IT", "JA", "KO",
    "NL", "PL", "PT", "RU", "SV", "TR", "UK", "UR", "VI", "ZH", "ZHT",
]

VIEW_NAMES = {"KO": "South Korea", "UN": "the United Nations", "WB": "the World Bank"}


# ── Raw files ────────────────────────────────────────────────────────────────


class RawFiles:
    """
    The input's files by name, read on demand. `names` lists them; `read`
    returns bytes. In Foundry this wraps a FileSystem; locally, a folder.
    """

    def __init__(self, names: Iterable[str], read: Callable[[str], bytes]):
        self.names = list(names)
        self.read = read

    def find(self, pattern: str, required: bool = True) -> Optional[str]:
        """The first file whose name (not folder) matches, case-insensitively."""
        regex = re.compile(pattern, re.IGNORECASE)
        for name in sorted(self.names):
            if regex.search(name.rsplit("/", 1)[-1]):
                return name
        if required:
            raise FileNotFoundError(f"no input file matches {pattern!r}; have: {', '.join(self.names)}")
        return None


def missing(value) -> bool:
    """Natural Earth's -99, or empty."""
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() in ("", "-99", "-99.0")
    if isinstance(value, (int, float)):
        return value == -99 or (isinstance(value, float) and math.isnan(value))
    return False


def get(props: Dict, key: str):
    """A Natural Earth field, any case, or None when it has no value."""
    value = props.get(key)
    if value is None:
        value = props.get(key.lower(), props.get(key.upper()))
    return None if missing(value) else value


def tidy(text) -> str:
    return " ".join(str(text).split())


def read_shapefile(files: RawFiles, stem_pattern: str) -> List[Dict]:
    """Features of a shapefile as GeoJSON-like dicts, attributes upper-cased."""
    shp = files.find(stem_pattern + r"\.shp$")
    base = shp[: -len(".shp")]
    shx = files.find(re.escape(base.rsplit("/", 1)[-1]) + r"\.shx$")
    dbf = files.find(re.escape(base.rsplit("/", 1)[-1]) + r"\.dbf$")
    cpg = files.find(re.escape(base.rsplit("/", 1)[-1]) + r"\.cpg$", required=False)
    encoding = files.read(cpg).decode("ascii", "ignore").strip() if cpg else "utf-8"
    reader = shapefile.Reader(
        shp=io.BytesIO(files.read(shp)),
        shx=io.BytesIO(files.read(shx)),
        dbf=io.BytesIO(files.read(dbf)),
        encoding=encoding or "utf-8",
        encodingErrors="replace",
    )
    names = [f[0].upper() for f in reader.fields[1:]]
    out = []
    for record in reader.iterShapeRecords():
        props = dict(zip(names, list(record.record)))
        props = {k: (v.strip() if isinstance(v, str) else v) for k, v in props.items()}
        geometry = record.shape.__geo_interface__ if record.shape.shapeType != shapefile.NULL else None
        out.append({"properties": props, "geometry": geometry})
    return out


def read_world_bank_series(text: str) -> Tuple[Dict[str, Tuple[float, int]], Optional[str]]:
    """
    One World Bank CSV export: code → (most recent non-empty value, its year),
    and the export's "Last Updated Date". The file opens with a few lines of
    metadata before the header row, which starts "Country Name".
    """
    rows = list(csv.reader(io.StringIO(text)))
    updated = None
    for row in rows[:6]:
        if len(row) > 1 and row[0].strip() == "Last Updated Date":
            updated = row[1].strip()
    header_at = next(i for i, row in enumerate(rows) if row and row[0].strip() == "Country Name")
    header = [h.strip() for h in rows[header_at]]
    years = [(i, int(h)) for i, h in enumerate(header) if h.isdigit()]
    code_at = header.index("Country Code")
    out = {}
    for row in rows[header_at + 1:]:
        if len(row) <= code_at:
            continue
        for i, year in reversed(years):
            if i < len(row) and row[i].strip() not in ("", ".."):
                out[row[code_at].strip()] = (float(row[i]), year)
                break
    return out, updated


def read_world_bank_metadata(text: str) -> Dict[str, Dict[str, str]]:
    """Metadata_Country_*.csv: code → { region, income }. Aggregates have no region and are skipped."""
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        row = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
        code = row.get("Country Code")
        if code and row.get("Region"):
            out[code] = {"region": row["Region"], "income": row.get("IncomeGroup", "")}
    return out


def decode(data: bytes) -> str:
    return data.decode("utf-8-sig", "replace")


# ── Ids, views, capitals ─────────────────────────────────────────────────────


def assign_ids(features: List[Dict]) -> Dict[str, str]:
    """ADM0_A3 → id: ISO_A3_EH where present and not yet taken, else ADM0_A3."""
    out: Dict[str, str] = {}
    taken = set()
    for f in features:
        adm0 = get(f["properties"], "ADM0_A3")
        if adm0 is None or adm0 in out:
            continue
        iso = get(f["properties"], "ISO_A3_EH")
        ident = iso if iso and iso not in taken else adm0
        out[adm0] = ident
        taken.add(ident)
    return out


def view_codes(props: Dict) -> List[str]:
    return [k[len("ADM0_A3_"):] for k in props if re.fullmatch(r"ADM0_A3_[A-Z]{2}", k)]


def assignment_for(features: List[Dict], ids: Dict[str, str], code: Optional[str]) -> List[str]:
    """The id each feature counts under in a view; -99 means unchanged."""
    out = []
    for f in features:
        props = f["properties"]
        own = ids[get(props, "ADM0_A3")]
        if code is None:
            out.append(own)
            continue
        target = get(props, f"ADM0_A3_{code}")
        out.append(own if target is None else ids.get(str(target), str(target)))
    return out


def view_label(code: str, features: List[Dict]) -> str:
    if code in VIEW_NAMES:
        return f"As seen by {VIEW_NAMES[code]}"
    for f in features:
        p = f["properties"]
        if get(p, "ISO_A2_EH") == code or get(p, "ISO_A2") == code:
            return f"As seen by {tidy(p['NAME'])}"
    return f"As seen by {code}"


@dataclass
class View:
    id: str
    label: str
    description: str
    file_key: str
    assignment: List[str]


def plan_views(features: List[Dict], ids: Dict[str, str]) -> List[View]:
    default = assignment_for(features, ids, None)
    views = [View(
        "default",
        "De facto (Natural Earth)",
        "Natural Earth's own lines: borders as they are controlled on the ground, "
        "with disputed areas drawn as units of their own.",
        "default",
        default,
    )]
    keys = {tuple(default): "default"}
    for code in view_codes(features[0]["properties"]):
        assignment = assignment_for(features, ids, code)
        key = tuple(assignment)
        if key == tuple(default):
            continue
        keys.setdefault(key, code.lower())
        views.append(View(
            code.lower(),
            view_label(code, features),
            "Disputed territory drawn as the government of this country recognises it "
            f'(Natural Earth point of view "{code}").',
            keys[key],
            assignment,
        ))
    return views


def capital_rank(p: Dict) -> float:
    kind = str(get(p, "FEATURECLA") or "")
    alternate = get(p, "CAPALT") in (1, "1") or kind == "Admin-0 capital alt"
    if alternate:
        return 2
    if get(p, "ADM0CAP") in (1, "1", 1.0) or kind == "Admin-0 capital":
        return 0
    if kind == "Admin-0 region capital":
        return 1
    return math.inf


def capitals_from(places: List[Dict], ids: Dict[str, str]) -> Dict[str, Dict]:
    best: Dict[str, Tuple[float, Dict]] = {}
    for place in places:
        p = place["properties"]
        rank = capital_rank(p)
        if rank == math.inf:
            continue
        adm0 = get(p, "ADM0_A3")
        ident = ids.get(adm0, adm0)
        if ident in best and best[ident][0] <= rank:
            continue
        best[ident] = (rank, {
            "name": tidy(get(p, "NAME")),
            "lon": round(float(get(p, "LONGITUDE")), 4),
            "lat": round(float(get(p, "LATITUDE")), 4),
        })
    return {ident: capital for ident, (_, capital) in best.items()}


# ── Geometry ─────────────────────────────────────────────────────────────────

EARTH_RADIUS_KM = 6371.0088


def ring_area(ring) -> float:
    total = 0.0
    for (lon1, lat1), (lon2, lat2) in zip(ring, ring[1:]):
        total += math.radians(lon2 - lon1) * (2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2)))
    return abs(total * EARTH_RADIUS_KM * EARTH_RADIUS_KM / 2)


def polygons_of(geometry: Dict):
    return [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]


def area_km2(geometry: Dict) -> float:
    """Spherical area, the same formula as the package's core (d3/turf's)."""
    total = 0.0
    for polygon in polygons_of(geometry):
        if not polygon:
            continue
        total += ring_area(polygon[0])
        for hole in polygon[1:]:
            total -= ring_area(hole)
    return total


def round_geometry(geometry: Dict, decimals: int) -> Optional[Dict]:
    """Rounded, with points rounding makes duplicate dropped and empty rings removed."""
    polygons = []
    for polygon in polygons_of(geometry):
        rings = []
        for ring in polygon:
            out = []
            for lon, lat in ring:
                point = [round(lon, decimals), round(lat, decimals)]
                if not out or out[-1] != point:
                    out.append(point)
            if out and out[0] != out[-1]:
                out.append(list(out[0]))
            if len(out) >= 4:
                rings.append(out)
        if rings:
            polygons.append(rings)
    if not polygons:
        return None
    if len(polygons) == 1:
        return {"type": "Polygon", "coordinates": polygons[0]}
    return {"type": "MultiPolygon", "coordinates": polygons}


def snapped(geometry, decimals: int) -> Optional[Dict]:
    """
    Coordinates snapped to a grid of `decimals` places. set_precision keeps the
    shape valid while it snaps, where rounding each point on its own does not:
    two nearby edges rounded onto each other cross, and MapLibre draws a
    self-crossing ring as stray slivers across the country.
    """
    grid = set_precision(geometry, 10 ** -decimals)
    if grid.is_empty:
        return None
    return round_geometry(mapping(grid), decimals)


def view_collections(features: List[Dict], assignment: List[str]) -> Tuple[Dict, Dict]:
    """A view's outlines at both levels: units counted as one country merged, then simplified for low."""
    groups: Dict[str, List] = {}
    for feature, ident in zip(features, assignment):
        if feature["geometry"]:
            groups.setdefault(ident, []).append(shape(feature["geometry"]))
    low, high = [], []
    for ident in sorted(groups):
        parts = groups[ident]
        merged = parts[0] if len(parts) == 1 else unary_union(parts)
        if not merged.is_valid:
            merged = merged.buffer(0)
        full = snapped(merged, HIGH_DECIMALS)
        if full:
            high.append({"type": "Feature", "properties": {"id": ident}, "geometry": full})
        simple = merged.simplify(LOW_TOLERANCE, preserve_topology=True)
        # A small island simplified or snapped away keeps a finer copy of its outline.
        rounded = snapped(simple, LOW_DECIMALS) or snapped(merged, LOW_DECIMALS + 1)
        if rounded:
            low.append({"type": "Feature", "properties": {"id": ident}, "geometry": rounded})
    as_collection = lambda feats: {"type": "FeatureCollection", "features": feats}
    return as_collection(low), as_collection(high)


# ── Records ──────────────────────────────────────────────────────────────────


def region_name(value) -> Optional[str]:
    """ "5. Low income" → "Low income". """
    if missing(value):
        return None
    text = tidy(value)
    match = re.match(r"^\d+\. (.+)$", text)
    return match.group(1) if match else text


def year_of(value) -> Dict:
    try:
        year = int(value)
    except (TypeError, ValueError):
        return {}
    return {"year": year} if year > 1900 else {}


def record_from(p: Dict, ident: str, capital: Optional[Dict], sovereign: Optional[str]) -> Dict:
    names = {}
    for code in NAME_FIELDS:
        name = get(p, f"NAME_{code}")
        if isinstance(name, str) and name and name != p.get("NAME"):
            names[code.lower()] = tidy(name)
    regions = {}
    for scheme_id, _, field_name in REGION_SCHEMES:
        name = region_name(p.get(field_name))
        if name:
            regions[scheme_id] = name
    figures = {}
    population = get(p, "POP_EST")
    if isinstance(population, (int, float)) and population > 0:
        figures["population"] = {"value": float(population), **year_of(get(p, "POP_YEAR")), "source": "Natural Earth"}
    gdp = get(p, "GDP_MD")
    if isinstance(gdp, (int, float)) and gdp > 0:
        figures["gdpUsd"] = {"value": float(gdp) * 1e6, **year_of(get(p, "GDP_YEAR")), "source": "Natural Earth"}
    record = {"id": ident, "name": tidy(p["NAME"]), "regions": regions, "figures": figures}
    long_name = get(p, "FORMAL_EN") or get(p, "NAME_LONG")
    if long_name and tidy(long_name) != record["name"]:
        record["longName"] = tidy(long_name)
    if names:
        record["names"] = names
    for key, field_name in (("iso2", "ISO_A2_EH"), ("iso3", "ISO_A3_EH")):
        value = get(p, field_name)
        if value:
            record[key] = str(value)
    numeric = get(p, "ISO_N3_EH")
    if numeric:
        record["isoNumeric"] = str(int(float(numeric))).zfill(3)
    if get(p, "TYPE"):
        record["kind"] = tidy(p["TYPE"])
    if sovereign and sovereign != ident:
        record["sovereign"] = sovereign
    if capital:
        record["capital"] = capital
    lx, ly = get(p, "LABEL_X"), get(p, "LABEL_Y")
    if isinstance(lx, (int, float)) and isinstance(ly, (int, float)):
        record["label"] = [round(lx, 4), round(ly, 4)]
    if get(p, "WIKIDATAID"):
        record["wikidata"] = p["WIKIDATAID"]
    return record


def build_records(features: List[Dict], ids: Dict[str, str], views: List[View], capitals: Dict) -> List[Dict]:
    """A record for every id any view draws; a view-made id borrows its first unit's properties."""
    by_sovereign_name = {tidy(f["properties"]["ADMIN"]): ids[get(f["properties"], "ADM0_A3")] for f in features}
    own_ids = set(ids.values())
    records: Dict[str, Dict] = {}
    for index, feature in enumerate(features):
        p = feature["properties"]
        for view in views:
            ident = view.assignment[index]
            if ident in records:
                continue
            if ident != ids[get(p, "ADM0_A3")] and ident in own_ids:
                continue
            sovereign = by_sovereign_name.get(tidy(p.get("SOVEREIGNT", "")))
            records[ident] = record_from(p, ident, capitals.get(ident), sovereign)
    return sorted(records.values(), key=lambda r: r["name"])


def join_world_bank(records: List[Dict], series: Dict[str, Dict], metadata: Dict[str, Dict]) -> List[str]:
    """Fold World Bank figures and regions in; return sovereign countries it had nothing for."""
    unmatched = []
    for record in records:
        code = WORLD_BANK_ALIASES.get(record["id"], record.get("iso3", record["id"]))
        found = False
        for key, values in series.items():
            if code in values:
                value, year = values[code]
                record["figures"][key] = {"value": value, "year": year, "source": "World Bank"}
                found = True
        meta = metadata.get(code)
        if meta:
            record["regions"]["wb-region"] = meta["region"]
            if meta["income"]:
                record["regions"]["income"] = meta["income"]
        if not found and record.get("kind") == "Sovereign country":
            unmatched.append(record["id"])
    return unmatched


def add_outline_areas(records: List[Dict], high_default: Dict) -> None:
    areas: Dict[str, float] = {}
    for feature in high_default["features"]:
        ident = feature["properties"]["id"]
        areas[ident] = areas.get(ident, 0.0) + area_km2(feature["geometry"])
    for record in records:
        if record["id"] in areas and "totalAreaKm2" not in record["figures"]:
            record["figures"]["totalAreaKm2"] = {
                "value": float(round(areas[record["id"]])),
                "source": "Natural Earth",
                "note": "computed from the 1:10m outline",
            }


# ── Build ────────────────────────────────────────────────────────────────────


@dataclass
class Result:
    files: Dict[str, object] = field(default_factory=dict)  # path → JSON-able
    table: List[Dict] = field(default_factory=list)
    unmatched: List[str] = field(default_factory=list)
    views: List[str] = field(default_factory=list)


def build(files: RawFiles, log: Callable[[str], None] = print) -> Result:
    log("Reading Natural Earth")
    features = read_shapefile(files, r"ne_10m_admin_0_countries")
    places = read_shapefile(files, r"ne_10m_populated_places")
    version_file = files.find(r"ne_10m_admin_0_countries\.VERSION\.txt$", required=False)
    ne_version = decode(files.read(version_file)).strip() if version_file else None

    ids = assign_ids(features)
    views = plan_views(features, ids)
    records = build_records(features, ids, views, capitals_from(places, ids))

    log("Reading the World Bank")
    series: Dict[str, Dict] = {}
    updated = None
    for code, key in WORLD_BANK_SERIES.items():
        name = files.find(rf"^API_{re.escape(code)}_.*\.csv$", required=False)
        if not name:
            log(f"  no CSV for {code}; that figure falls back to Natural Earth or is left out")
            continue
        series[key], series_updated = read_world_bank_series(decode(files.read(name)))
        updated = updated or series_updated
    meta_name = files.find(r"^Metadata_Country_.*\.csv$", required=False)
    metadata = read_world_bank_metadata(decode(files.read(meta_name))) if meta_name else {}
    unmatched = join_world_bank(records, series, metadata) if series else []
    if unmatched:
        log(f"  no World Bank figures for {len(unmatched)} sovereign countries: {', '.join(unmatched)}")

    log("Building outlines")
    result = Result(unmatched=unmatched, views=[v.id for v in views])
    outlines: Dict[str, Tuple[Dict, Dict]] = {}
    for view in views:
        if view.file_key in outlines:
            continue
        low, high = view_collections(features, view.assignment)
        outlines[view.file_key] = (low, high)
        result.files[f"views/{view.file_key}/low.geojson"] = low
        result.files[f"views/{view.file_key}/high.geojson"] = high
    add_outline_areas(records, outlines["default"][1])

    sources = [{
        "name": "Natural Earth",
        "url": "https://www.naturalearthdata.com/",
        "licence": "Public domain",
        "provides": "borders, points of view, regions, names, capitals",
        **({"version": ne_version} if ne_version else {}),
    }]
    if series:
        sources.append({
            "name": "World Bank",
            "url": "https://data.worldbank.org/",
            "licence": "CC BY 4.0",
            "provides": "population, areas, GDP, regions, income groups",
            **({"version": updated} if updated else {}),
        })
    result.files["manifest.json"] = {
        "schema": MANIFEST_SCHEMA,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "countries": "countries.json",
        "views": [
            {
                "id": v.id,
                "label": v.label,
                "description": v.description,
                "files": [
                    {"path": f"views/{v.file_key}/low.geojson", "minZoom": 0},
                    {"path": f"views/{v.file_key}/high.geojson", "minZoom": HIGH_DETAIL_FROM_ZOOM},
                ],
            }
            for v in views
        ],
        "defaultView": "default",
        "regionSchemes": [{"id": i, "label": label} for i, label, _ in REGION_SCHEMES],
        "defaultRegionScheme": "un-region",
        "sources": sources,
    }
    result.files["countries.json"] = {"countries": records}
    result.table = table_rows(records, outlines["default"][0])
    log(f"Built {len(records)} countries, {len(views)} views ({len(outlines)} distinct outline sets)")
    return result


def table_rows(records: List[Dict], low_default: Dict) -> List[Dict]:
    """One flat row per country, with the default view's simplified outline as GeoJSON."""
    outline = {f["properties"]["id"]: f["geometry"] for f in low_default["features"]}
    rows = []
    for r in records:
        row = {
            "id": r["id"],
            "name": r["name"],
            "long_name": r.get("longName"),
            "iso2": r.get("iso2"),
            "iso3": r.get("iso3"),
            "iso_numeric": r.get("isoNumeric"),
            "kind": r.get("kind"),
            "sovereign": r.get("sovereign"),
            "capital": r.get("capital", {}).get("name"),
            "capital_lat": r.get("capital", {}).get("lat"),
            "capital_lon": r.get("capital", {}).get("lon"),
            "label_lat": r["label"][1] if r.get("label") else None,
            "label_lon": r["label"][0] if r.get("label") else None,
            "wikidata": r.get("wikidata"),
            "geometry_geojson": json.dumps(outline[r["id"]]) if r["id"] in outline else None,
        }
        for scheme_id, _, _ in REGION_SCHEMES:
            row[scheme_id.replace("-", "_")] = r["regions"].get(scheme_id)
        for key, column in (
            ("population", "population"),
            ("landAreaKm2", "land_area_km2"),
            ("totalAreaKm2", "total_area_km2"),
            ("gdpUsd", "gdp_usd"),
            ("gdpPerCapitaUsd", "gdp_per_capita_usd"),
        ):
            figure = r["figures"].get(key)
            row[column] = figure["value"] if figure else None
            row[f"{column}_year"] = figure.get("year") if figure else None
            row[f"{column}_source"] = figure.get("source") if figure else None
        rows.append(row)
    return rows


# ── Foundry ──────────────────────────────────────────────────────────────────

try:
    from transforms.api import Input, Output, transform
except ImportError:  # running locally
    transform = None

if transform is not None:
    import pandas as pd

    @transform(
        countries_map=Output("/CHANGE_ME/countries/countries_map"),
        countries=Output("/CHANGE_ME/countries/countries"),
        raw=Input("/CHANGE_ME/countries/countries_raw"),
    )
    def compute(countries_map, countries, raw):
        fs = raw.filesystem()
        names = [status.path for status in fs.ls()]

        def read(name: str) -> bytes:
            with fs.open(name, "rb") as handle:
                return handle.read()

        result = build(RawFiles(names, read))

        out = countries_map.filesystem()
        for path, value in result.files.items():
            with out.open(path, "w") as handle:
                # Compact: the outlines are most of the bytes.
                json.dump(value, handle, ensure_ascii=False, separators=(",", ":"))

        countries.write_pandas(pd.DataFrame(result.table))


# ── Locally ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    import sys

    if len(sys.argv) != 3:
        sys.exit("usage: python countries_transform.py <folder of raw files> <output folder>")
    source, target = sys.argv[1], sys.argv[2]
    local = RawFiles(
        [os.path.relpath(os.path.join(d, f), source) for d, _, fs in os.walk(source) for f in fs],
        lambda name: open(os.path.join(source, name), "rb").read(),
    )
    built = build(local)
    for path, value in built.files.items():
        destination = os.path.join(target, path)
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        with open(destination, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(target, "countries_table.json"), "w", encoding="utf-8") as handle:
        json.dump(built.table, handle, ensure_ascii=False)
    print(f"Wrote {target}")
