"""
Command line. Each step reads what the one before it wrote, so they can be run
one at a time, resumed, or all at once:

    download-dem  →  dem-cells  →  terrain  →  hillshade
                                └→ contours
    basemap, assets            (independent)
    imagery, vector            (independent: your own rasters / XYZ tiles / vector files)
    catalog                    (last: indexes whatever is in --out)

    python -m terrain_gen all --bbox 4,57,32,72

See README.md for the full list of options and PLAN.md for why.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from . import __version__
from .chunk import chunk, compression_name, tile_type_name
from .grid import WORLD, Bounds
from .manifest import header, write_manifest

log = logging.getLogger("terrain_gen")

PRODUCTS = ["dem", "terrain", "hillshade", "contours", "basemap", "assets", "imagery", "vector"]

XYZ_RIGHTS = ("Only fetch tiles you have the right to download AND redistribute: most public tile "
              "services (the OpenStreetMap tile servers among them) forbid bulk downloads.")
# The zoom whose pixels are about the DEM's own posting at mid-latitudes. One
# deeper quadruples the tiles for detail the source does not have; MapLibre
# overzooms terrain smoothly.
DEFAULT_MAX_ZOOM = {"glo90": 10, "glo30": 12}


def _bbox(args) -> Bounds:
    return Bounds.parse(args.bbox) if args.bbox else WORLD


def _sources_dir(args) -> Path:
    return Path(args.work) / "sources" / f"copernicus-{args.dem}"


def _dem_dir(args) -> Path:
    return Path(args.out) / "dem-cells"


def _require_dem_cells(args):
    from .dem import dem_sources_from_cells

    if not (_dem_dir(args) / "manifest.json").exists():
        sys.exit("no dem-cells yet — run `dem-cells` first")
    return dem_sources_from_cells(_dem_dir(args))


def _write_pyramid(args, source, *, id: str, kind: str, title: str, attribution: str, src_name: str,
                   encoding: dict, parameters: dict, metadata: dict, bounds: list[float] | None) -> None:
    out_dir = Path(args.out) / id
    target = int(args.target_mb * 1e6)
    pyramid = chunk(source, out_dir, target_bytes=target, metadata=metadata)
    manifest = {
        **header(
            id=id, kind=kind, title=title, attribution=attribution, bounds=bounds,
            encoding={
                "tileType": tile_type_name(source.tile_type),
                "compression": compression_name(source.compression),
                **encoding,
            },
            source=src_name,
            parameters={**parameters, "targetBytes": target},
        ),
        **pyramid,
    }
    write_manifest(out_dir, manifest)
    count = sum(len(layer["cells"]) if layer["type"] == "grid" else 1 for layer in pyramid["layers"])
    log.info("%s: %d archives in %s", id, count, out_dir)


# ── Steps ───────────────────────────────────────────────────────────────────


def cmd_download_dem(args):
    from .download import download_dem

    download_dem(_bbox(args), args.dem, _sources_dir(args), workers=args.download_workers)


def cmd_dem_cells(args):
    from .dem import build_dem_cells
    from .download import DEM_ATTRIBUTION

    src_dir = Path(args.source_dir) if args.source_dir else _sources_dir(args)
    paths = sorted(p for p in src_dir.glob("*.tif"))
    build_dem_cells(
        paths, _bbox(args), _dem_dir(args),
        dem_name=args.dem if not args.source_dir else src_dir.name,
        attribution=DEM_ATTRIBUTION if not args.source_dir else args.attribution or "",
        dtype=args.dem_dtype, workers=args.workers, work_dir=Path(args.work),
    )


def cmd_terrain(args):
    from .download import DEM_ATTRIBUTION
    from .manifest import read_manifest
    from .terrain import build_terrain

    sources = _require_dem_cells(args)
    max_zoom = args.max_zoom or DEFAULT_MAX_ZOOM[args.dem]
    store = build_terrain(
        sources, Path(args.work) / "terrain.tiles.sqlite",
        min_zoom=args.min_zoom, max_zoom=max_zoom, size=args.tile_size, fmt=args.format,
        precision=args.precision, workers=args.workers,
    )
    dem_manifest = read_manifest(_dem_dir(args))
    _write_pyramid(
        args, store, id="terrain", kind="raster-dem",
        title="Terrain (Terrarium)", attribution=dem_manifest.get("attribution") or DEM_ATTRIBUTION,
        src_name="dem-cells",
        encoding={"rasterDem": "terrarium", "tileSize": args.tile_size},
        parameters={"minZoom": args.min_zoom, "maxZoom": max_zoom, "precisionM": args.precision},
        metadata={"name": "terrain", "type": "overlay", "format": args.format, "encoding": "terrarium",
                  "attribution": dem_manifest.get("attribution", "")},
        bounds=dem_manifest.get("bounds"),
    )
    store.close()


def cmd_hillshade(args):
    from .hillshade import build_hillshade
    from .manifest import read_manifest
    from .tiles import TileStore

    terrain_path = Path(args.work) / "terrain.tiles.sqlite"
    if not terrain_path.exists():
        sys.exit("no terrain tiles yet — run `terrain` first")
    terrain = TileStore(terrain_path)
    zooms = terrain.zooms()
    max_zoom = args.max_zoom or max(zooms)
    store = build_hillshade(
        terrain, Path(args.work) / "hillshade.tiles.sqlite",
        min_zoom=args.min_zoom, max_zoom=max_zoom, size=args.tile_size,
        fmt=args.format, quality=args.quality, workers=args.workers,
    )
    dem_manifest = read_manifest(_dem_dir(args))
    _write_pyramid(
        args, store, id="hillshade", kind="raster",
        title="Hillshade", attribution=dem_manifest.get("attribution", ""), src_name="terrain",
        encoding={"tileSize": args.tile_size, "transparent": True},
        parameters={"minZoom": args.min_zoom, "maxZoom": max_zoom, "azimuth": 315, "altitude": 45},
        metadata={"name": "hillshade", "type": "overlay", "format": args.format},
        bounds=dem_manifest.get("bounds"),
    )
    store.close()
    terrain.close()


def cmd_contours(args):
    from .contours import tile_contours, trace_contours
    from .manifest import read_manifest
    from .tiles import MBTilesSource

    sources = _require_dem_cells(args)
    work = Path(args.work)
    ndjson = trace_contours(
        sources, work, interval=args.interval, index_every=args.index_every, workers=args.workers,
    )
    mbtiles = tile_contours(ndjson, work / "contours.mbtiles", min_zoom=args.min_zoom, max_zoom=args.max_zoom)
    src = MBTilesSource(mbtiles)
    dem_manifest = read_manifest(_dem_dir(args))
    _write_pyramid(
        args, src, id="contours", kind="vector-tiles",
        title=f"Contours ({args.interval} m)", attribution=dem_manifest.get("attribution", ""), src_name="dem-cells",
        encoding={"sourceLayer": "contours", "elevationProperty": "ELEV", "indexProperty": "index"},
        parameters={"interval": args.interval, "indexEvery": args.index_every,
                    "minZoom": args.min_zoom, "maxZoom": args.max_zoom},
        metadata=src.metadata(),
        bounds=dem_manifest.get("bounds"),
    )
    src.close()


def cmd_basemap(args):
    from .download import extract_basemap
    from .tiles import PMTilesSource

    if not args.source:
        sys.exit("--source is required: a Protomaps build URL (https://build.protomaps.com/YYYYMMDD.pmtiles) or a local .pmtiles")
    bbox = _bbox(args)
    local = Path(args.source)
    if local.exists() and bbox == WORLD and args.max_zoom is None:
        extract = local  # already the region wanted; just chunk it
    else:
        extract = extract_basemap(args.source, bbox, args.max_zoom or 15, Path(args.work) / "basemap-extract.pmtiles")
    src = PMTilesSource(extract)
    meta = src.metadata()
    _write_pyramid(
        args, src, id="basemap", kind="vector-tiles",
        title="Basemap (Protomaps)",
        attribution=meta.get("attribution", "© OpenStreetMap contributors, Protomaps"),
        src_name=args.source,
        encoding={"schema": "protomaps"},
        parameters={"maxZoom": args.max_zoom, "bbox": bbox.as_list()},
        metadata=meta,
        bounds=bbox.as_list(),
    )
    src.close()


def cmd_assets(args):
    from .download import download_assets

    out = Path(args.out) / "assets"
    download_assets(Path(args.work), out)
    write_manifest(out, {
        **header(id="assets", kind="assets", title="Glyphs and sprites", attribution="Protomaps, Noto fonts (OFL)",
                 bounds=None, source="protomaps/basemaps-assets"),
        "fontsPrefix": "fonts",
        "sprites": sorted({p.stem.replace("@2x", "") for p in (out / "sprites").glob("*.json")}),
    })


def _raster_paths(args) -> list[Path]:
    paths = [Path(p) for p in (args.files or [])]
    if args.source_dir:
        d = Path(args.source_dir)
        paths += sorted(p for p in d.rglob("*") if p.suffix.lower() in (".tif", ".tiff", ".vrt", ".jp2"))
    return paths


def cmd_imagery(args):
    from .imagery import build_imagery_from_rasters, build_imagery_from_xyz

    paths = _raster_paths(args)
    if bool(paths) == bool(args.xyz):
        sys.exit("imagery needs exactly one input: --source-dir/--files (GeoTIFFs), or --xyz URL")
    work = Path(args.work)
    store_path = work / f"{args.id}.tiles.sqlite"
    scale = tuple(float(v) for v in args.scale.split(",")) if args.scale else None
    if paths:
        missing = [str(p) for p in paths if not p.exists()]
        if missing:
            sys.exit(f"not found: {', '.join(missing)}")
        bbox = Bounds.parse(args.bbox) if args.bbox else None
        store, specs, max_zoom = build_imagery_from_rasters(
            paths, store_path, min_zoom=args.min_zoom, max_zoom=args.max_zoom, size=args.tile_size,
            fmt=args.format, quality=args.quality, workers=args.workers, bbox=bbox, scale=scale,
        )
        b = [min(s.bounds_4326[0] for s in specs), min(s.bounds_4326[1] for s in specs),
             max(s.bounds_4326[2] for s in specs), max(s.bounds_4326[3] for s in specs)]
        if bbox:
            b = [max(b[0], bbox.west), max(b[1], bbox.south), min(b[2], bbox.east), min(b[3], bbox.north)]
        src_name = ", ".join(p.name for p in paths[:5]) + (f" (+{len(paths) - 5} more)" if len(paths) > 5 else "")
    else:
        if not args.bbox:
            sys.exit("--xyz needs --bbox: tiles are fetched for that area only")
        if args.max_zoom is None:
            sys.exit("--xyz needs --max-zoom: the deepest zoom to fetch")
        log.warning("imagery: %s", XYZ_RIGHTS)
        bbox = Bounds.parse(args.bbox)
        store = build_imagery_from_xyz(
            args.xyz, bbox, store_path, work / "xyz-cache", min_zoom=args.min_zoom, max_zoom=args.max_zoom,
            size=args.tile_size, fmt=args.format, quality=args.quality, workers=args.workers,
            concurrency=args.xyz_concurrency, all_zooms=args.xyz_all_zooms, max_tiles=args.xyz_max_tiles,
        )
        max_zoom, b, src_name = args.max_zoom, bbox.as_list(), args.xyz
    _write_pyramid(
        args, store, id=args.id, kind="raster", title=args.title or "Imagery",
        attribution=args.attribution or "", src_name=src_name,
        encoding={"tileSize": args.tile_size},
        parameters={"minZoom": args.min_zoom, "maxZoom": max_zoom, "format": args.format, "quality": args.quality,
                    **({"xyz": args.xyz, "xyzAllZooms": args.xyz_all_zooms} if args.xyz else {}),
                    **({"scale": list(scale)} if scale else {})},
        metadata={"name": args.id, "type": "overlay", "format": args.format, "attribution": args.attribution or ""},
        bounds=b,
    )
    store.close()


def cmd_vector(args):
    from .tiles import MBTilesSource
    from .vector import layer_name_for, tile_vector, write_ndjson

    files = [Path(p) for p in args.files]
    missing = [str(p) for p in files if not p.exists()]
    if missing:
        sys.exit(f"not found: {', '.join(missing)}")
    layer = args.layer_name or layer_name_for(files[0])
    id = args.id or layer
    work = Path(args.work)
    ndjson = work / f"{id}.ndjson"
    schema = write_ndjson(files, ndjson, crs=args.crs, layer=args.input_layer,
                          lat_field=args.lat_field, lon_field=args.lon_field, wkt_field=args.wkt_field)
    log.info("vector: %d features, %s, %d fields", schema.count, "/".join(sorted(schema.geometry_types)), len(schema.fields))
    max_zoom = None if args.max_zoom in (None, "g") else int(args.max_zoom)
    mbtiles = tile_vector(ndjson, work / f"{id}.mbtiles", layer_name=layer, min_zoom=args.min_zoom,
                          max_zoom=max_zoom, keep_all=args.keep_all, attribution=args.attribution or "", name=id)
    src = MBTilesSource(mbtiles)
    zooms = sorted({z for z, *_ in src.index()})
    _write_pyramid(
        args, src, id=id, kind="vector-tiles", title=args.title or layer,
        attribution=args.attribution or "", src_name=", ".join(p.name for p in files),
        encoding=schema.encoding(layer),
        parameters={"minZoom": zooms[0], "maxZoom": zooms[-1], "requestedMaxZoom": args.max_zoom or "g",
                    "keepAll": args.keep_all, "crs": args.crs},
        metadata=src.metadata(),
        bounds=schema.bounds(),
    )
    src.close()


def cmd_catalog(args):
    from .catalog import build_catalog

    rids = json.loads(Path(args.rids).read_text()) if args.rids else None
    build_catalog(Path(args.out), rids)


def cmd_all(args):
    products = [p.strip() for p in args.products.split(",")] if args.products else ["dem", "terrain", "hillshade", "contours", "assets"]
    unknown = set(products) - set(PRODUCTS)
    if unknown:
        sys.exit(f"unknown products: {', '.join(sorted(unknown))}")
    # Inputs first: imagery and vector have no default source.
    if "imagery" in products and not (args.imagery_dir or args.imagery_files or args.xyz):
        sys.exit("imagery in --products needs --imagery-dir, --imagery-files or --xyz")
    if "imagery" in products and args.xyz and (not args.bbox or args.imagery_max_zoom is None):
        sys.exit("--xyz needs --bbox and --imagery-max-zoom")
    if "vector" in products and not args.vector_files:
        sys.exit("vector in --products needs --vector-files")
    # Check external tools before the slow steps, not after them.
    import shutil

    tippecanoe = ("tippecanoe", "brew install tippecanoe / apt install tippecanoe")
    needed = {"contours": tippecanoe, "vector": tippecanoe,
              "basemap": ("pmtiles", "https://github.com/protomaps/go-pmtiles/releases")}
    missing = [f"  {tool} (for {p}): {how}" for p, (tool, how) in needed.items() if p in products and not shutil.which(tool)]
    if "vector" in products:
        from .vector import gdal_reader, needs_gdal

        if any(needs_gdal(Path(f)) for f in args.vector_files) and not gdal_reader():
            missing.append("  pyogrio or ogr2ogr (for vector GeoPackage/Shapefile/FlatGeobuf input): pip install pyogrio")
    if missing:
        sys.exit("Missing tools — install them, or leave those products out with --products:\n" + "\n".join(missing))
    if "basemap" in products and not args.source:
        sys.exit("--source is required for the basemap: https://build.protomaps.com/YYYYMMDD.pmtiles or a local .pmtiles")
    # Each step's own zoom defaults apply; `all` does not share one --max-zoom.
    parser = build_parser()
    defaults = vars(parser.parse_args(["terrain"]))
    def step(name, fn, defaults_argv=None, **over):
        base = vars(parser.parse_args(defaults_argv)) if defaults_argv else defaults
        ns = argparse.Namespace(**{**base, **vars(args), **over})
        log.info("── %s ──", name)
        fn(ns)
    if "dem" in products:
        if not args.source_dir:
            step("download-dem", cmd_download_dem)
        step("dem-cells", cmd_dem_cells)
    if "terrain" in products:
        step("terrain", cmd_terrain, min_zoom=0, max_zoom=None, format="webp", precision=0.25)
    if "hillshade" in products:
        step("hillshade", cmd_hillshade, min_zoom=0, max_zoom=None, format="webp", quality=80)
    if "contours" in products:
        step("contours", cmd_contours, min_zoom=8, max_zoom=12, interval=args.interval or 20, index_every=5)
    if "basemap" in products:
        step("basemap", cmd_basemap, max_zoom=None)
    if "assets" in products:
        step("assets", cmd_assets)
    if "imagery" in products:
        step("imagery", cmd_imagery, ["imagery"], source_dir=args.imagery_dir, files=args.imagery_files,
             min_zoom=0, max_zoom=args.imagery_max_zoom, attribution=args.imagery_attribution, id="imagery", title=None)
    if "vector" in products:
        step("vector", cmd_vector, ["vector", "x"], files=args.vector_files, layer_name=args.vector_layer_name,
             min_zoom=0, max_zoom=None, attribution=args.vector_attribution, id=None, title=None)
    step("catalog", cmd_catalog)


# ── Parser ──────────────────────────────────────────────────────────────────


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--bbox", help="west,south,east,north in degrees (default: the whole grid, -180,-85,180,85)")
    common.add_argument("--work", default="work", help="downloads and intermediate files (default: ./work)")
    common.add_argument("--out", default="out", help="one folder per Foundry dataset (default: ./out)")
    common.add_argument("--dem", choices=["glo90", "glo30"], default="glo90", help="Copernicus DEM product")
    common.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    common.add_argument("--target-mb", type=float, default=4.0, help="largest archive the chunker aims for (default 4 MB)")
    common.add_argument("-v", "--verbose", action="store_true")

    p = argparse.ArgumentParser(prog="terrain_gen", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--version", action="version", version=__version__)
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("download-dem", parents=[common], help="fetch Copernicus DEM tiles for the bbox")
    s.add_argument("--download-workers", type=int, default=8)
    s.set_defaults(fn=cmd_download_dem)

    s = sub.add_parser("dem-cells", parents=[common], help="2° analysis GeoTIFFs + manifest (decho-elevation's DemStore)")
    s.add_argument("--source-dir", help="use your own EPSG:4326 GeoTIFFs instead of the Copernicus download")
    s.add_argument("--attribution", help="attribution for --source-dir data")
    s.add_argument("--dem-dtype", choices=["float32", "int16"], default="float32",
                   help="int16 rounds to whole metres and roughly halves the files (default float32, as today)")
    s.set_defaults(fn=cmd_dem_cells)

    s = sub.add_parser("terrain", parents=[common], help="Terrarium raster-dem pyramid, chunked")
    s.add_argument("--min-zoom", type=int, default=0)
    s.add_argument("--max-zoom", type=int, help="default 10 for glo90, 12 for glo30")
    s.add_argument("--format", choices=["png", "webp"], default="webp", help="both lossless; webp is ~40%% smaller")
    s.add_argument("--precision", type=float, default=0.25,
                   help="round heights to this many metres (default 0.25; 0 keeps Terrarium's full 1/256 m)")
    s.add_argument("--tile-size", type=int, default=256, choices=[256, 512])
    s.set_defaults(fn=cmd_terrain)

    s = sub.add_parser("hillshade", parents=[common], help="transparent shaded-relief pyramid from the terrain tiles")
    s.add_argument("--min-zoom", type=int, default=0)
    s.add_argument("--max-zoom", type=int, help="default: the terrain's max zoom")
    s.add_argument("--format", choices=["png", "webp"], default="webp")
    s.add_argument("--quality", type=int, default=80, help="webp quality (default 80)")
    s.add_argument("--tile-size", type=int, default=256, choices=[256, 512])
    s.set_defaults(fn=cmd_hillshade)

    s = sub.add_parser("contours", parents=[common], help="labelled vector contours, one pyramid (needs tippecanoe)")
    s.add_argument("--interval", type=int, default=20, help="metres between lines (default 20)")
    s.add_argument("--index-every", type=int, default=5, help="every Nth line is an index line (default 5)")
    s.add_argument("--min-zoom", type=int, default=8)
    s.add_argument("--max-zoom", type=int, default=12)
    s.set_defaults(fn=cmd_contours)

    s = sub.add_parser("basemap", parents=[common], help="extract and chunk a Protomaps basemap (needs pmtiles CLI)")
    s.add_argument("--source", help="https://build.protomaps.com/YYYYMMDD.pmtiles, or a local .pmtiles")
    s.add_argument("--max-zoom", type=int, help="deepest zoom to keep (default 15, the build's own)")
    s.set_defaults(fn=cmd_basemap)

    s = sub.add_parser("assets", parents=[common], help="Protomaps glyphs and sprites")
    s.set_defaults(fn=cmd_assets)

    s = sub.add_parser(
        "imagery", parents=[common], formatter_class=argparse.RawDescriptionHelpFormatter,
        help="raster imagery pyramid from GeoTIFFs (any CRS) or an XYZ tile URL",
        description="Raster imagery → web-mercator raster pyramid (kind 'raster'), chunked.\n\n"
                    "Inputs: --source-dir / --files (GeoTIFF/COG in any CRS, warped bilinear to EPSG:3857), or\n"
                    "--xyz URL with --bbox and --max-zoom.\n\n"
                    "!! XYZ: " + XYZ_RIGHTS + " There is no default URL.",
    )
    s.add_argument("--source-dir", help="folder of GeoTIFF/COG files (searched recursively)")
    s.add_argument("--files", nargs="+", help="GeoTIFF/COG files; later files are drawn over earlier ones")
    s.add_argument("--xyz", metavar="URL", help="tile URL template with {z} {x} {y} (or {-y} for TMS, {s} for a/b/c). "
                                                "You must have the right to download and redistribute these tiles.")
    s.add_argument("--xyz-concurrency", type=int, default=4, help="parallel requests to the tile server (default 4)")
    s.add_argument("--xyz-max-tiles", type=int, default=50_000, help="refuse to fetch more tiles than this (default 50000)")
    s.add_argument("--xyz-all-zooms", action="store_true",
                   help="fetch every zoom from the server instead of averaging overviews from the deepest "
                        "(better for cartographic tiles with labels; about a third more requests)")
    s.add_argument("--min-zoom", type=int, default=0)
    s.add_argument("--max-zoom", type=int, help="default: from the finest source resolution (required with --xyz)")
    s.add_argument("--format", choices=["webp", "jpg"], default="webp",
                   help="webp (default; alpha where partly transparent) or jpg (no alpha: no-data is black)")
    s.add_argument("--quality", type=int, default=80, help="lossy quality (default 80)")
    s.add_argument("--tile-size", type=int, default=256, choices=[256, 512])
    s.add_argument("--scale", metavar="MIN,MAX", help="for non-8-bit rasters: values mapped to 0..255 "
                                                       "(default: each file's 2nd..98th percentile)")
    s.add_argument("--attribution", help="attribution text written into the manifest (default none)")
    s.add_argument("--id", default="imagery", help="output folder and layer id (default imagery)")
    s.add_argument("--title", help="layer title (default Imagery)")
    s.set_defaults(fn=cmd_imagery)

    s = sub.add_parser(
        "vector", parents=[common], formatter_class=argparse.RawDescriptionHelpFormatter,
        help="any vector data → one vector-tile pyramid (needs tippecanoe)",
        description="GeoJSON, NDJSON, CSV (lat/lon or WKT) and — through pyogrio or ogr2ogr — GeoPackage,\n"
                    "Shapefile, FlatGeobuf and other GDAL formats → one source layer of vector tiles, chunked.\n"
                    "Low-zoom tiles over 500 KB are thinned (--drop-densest-as-needed, mostly points); zooms are\n"
                    "added past --max-zoom if needed so every feature is in the deepest zoom. --keep-all disables\n"
                    "all thinning.",
    )
    s.add_argument("files", nargs="+", help="input files, all into one layer")
    s.add_argument("--layer-name", help="source-layer name (default: from the first file name)")
    s.add_argument("--input-layer", help="layer inside a multi-layer file such as a GeoPackage (default: the first)")
    s.add_argument("--crs", help="CRS of the input coordinates when the file doesn't say (or says wrong), e.g. EPSG:25832")
    s.add_argument("--lat-field", help="CSV latitude column (default: lat, latitude or y)")
    s.add_argument("--lon-field", help="CSV longitude column (default: lon, lng, long, longitude or x)")
    s.add_argument("--wkt-field", help="CSV WKT geometry column (default: wkt, geometry, geom or the_geom)")
    s.add_argument("--min-zoom", type=int, default=0)
    s.add_argument("--max-zoom", help="deepest zoom, or g to let tippecanoe guess from feature spacing, at least 10 (default g)")
    s.add_argument("--keep-all", action="store_true", help="no size limits and no thinning at any zoom (big tiles)")
    s.add_argument("--attribution", help="attribution text (default none)")
    s.add_argument("--id", help="output folder and layer id (default: the layer name)")
    s.add_argument("--title", help="layer title (default: the layer name)")
    s.set_defaults(fn=cmd_vector)

    s = sub.add_parser("catalog", parents=[common], help="index every product in --out into catalog/catalog.json")
    s.add_argument("--rids", help="JSON file mapping layer id -> dataset RID, once uploaded")
    s.set_defaults(fn=cmd_catalog)

    s = sub.add_parser("all", parents=[common], help="every step, in order")
    s.add_argument("--products", help=f"comma-separated subset of {','.join(PRODUCTS)} "
                                      "(default: dem,terrain,hillshade,contours,assets; "
                                      "imagery and vector only with their inputs)")
    s.add_argument("--source-dir", help="as for dem-cells")
    s.add_argument("--attribution")
    s.add_argument("--dem-dtype", choices=["float32", "int16"], default="float32")
    s.add_argument("--source", help="as for basemap")
    s.add_argument("--interval", type=int, help="contour interval (default 20)")
    s.add_argument("--rids")
    s.add_argument("--download-workers", type=int, default=8)
    s.add_argument("--tile-size", type=int, default=256, choices=[256, 512])
    s.add_argument("--imagery-dir", help="imagery: folder of GeoTIFFs")
    s.add_argument("--imagery-files", nargs="+", help="imagery: GeoTIFF files")
    s.add_argument("--xyz", help="imagery: XYZ tile URL (needs --bbox, --imagery-max-zoom). " + XYZ_RIGHTS)
    s.add_argument("--xyz-concurrency", type=int, default=4)
    s.add_argument("--imagery-max-zoom", type=int, help="imagery: deepest zoom (default from source resolution)")
    s.add_argument("--imagery-attribution")
    s.add_argument("--vector-files", nargs="+", help="vector: input files")
    s.add_argument("--vector-layer-name")
    s.add_argument("--vector-attribution")
    s.set_defaults(fn=cmd_all)
    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    args.fn(args)
