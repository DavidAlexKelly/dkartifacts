"""
Command line. Each step reads what the one before it wrote, so they can be run
one at a time, resumed, or all at once:

    download-dem  →  dem-cells  →  terrain  →  hillshade
                                └→ contours
    basemap, assets            (independent)
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

PRODUCTS = ["dem", "terrain", "hillshade", "contours", "basemap", "assets"]
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


def cmd_catalog(args):
    from .catalog import build_catalog

    rids = json.loads(Path(args.rids).read_text()) if args.rids else None
    build_catalog(Path(args.out), rids)


def cmd_all(args):
    products = [p.strip() for p in args.products.split(",")] if args.products else ["dem", "terrain", "hillshade", "contours", "assets"]
    unknown = set(products) - set(PRODUCTS)
    if unknown:
        sys.exit(f"unknown products: {', '.join(sorted(unknown))}")
    # Each step's own zoom defaults apply; `all` does not share one --max-zoom.
    defaults = vars(build_parser().parse_args(["terrain"]))
    def step(name, fn, **over):
        ns = argparse.Namespace(**{**defaults, **vars(args), **over})
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

    s = sub.add_parser("catalog", parents=[common], help="index every product in --out into catalog/catalog.json")
    s.add_argument("--rids", help="JSON file mapping layer id -> dataset RID, once uploaded")
    s.set_defaults(fn=cmd_catalog)

    s = sub.add_parser("all", parents=[common], help="every step, in order")
    s.add_argument("--products", help=f"comma-separated subset of {','.join(PRODUCTS)} "
                                      "(default: dem,terrain,hillshade,contours,assets)")
    s.add_argument("--source-dir", help="as for dem-cells")
    s.add_argument("--attribution")
    s.add_argument("--dem-dtype", choices=["float32", "int16"], default="float32")
    s.add_argument("--source", help="as for basemap")
    s.add_argument("--interval", type=int, help="contour interval (default 20)")
    s.add_argument("--rids")
    s.add_argument("--download-workers", type=int, default=8)
    s.add_argument("--tile-size", type=int, default=256, choices=[256, 512])
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
