"""
dem-cells: the ANALYSIS product. One GeoTIFF per 2-degree cell, heights in
metres, readable by decho-elevation's own decoder (classic TIFF, Deflate,
predictor 1 or 2, Float32 or Int16, nodata -32768).

It replaces the current Elevation dataset file for file — same names
(`c091_r012.tif`), same grid — and adds the manifest.json that dataset never
had, so the package gets an allow-list, sizes, height ranges and hashes.
Set `manifestPath: "manifest.json"` in its DemStore to use it.

Everything downstream (terrain, hillshade, contours) is built from these
cells, not from the raw downloads, so every product agrees with the heights
the analysis code reads.
"""

from __future__ import annotations

import logging
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import rasterio

from .grid import CELL_DEG, ORIGIN_LAT, ORIGIN_LON, Bounds, cell_bounds, cell_key, cells_in_bounds
from .manifest import header, read_manifest, sha256_file, write_manifest
from .raster import NODATA, SourceTile, index_sources, mosaic, write_dem_cell

log = logging.getLogger(__name__)


def _build_cell(col: int, row: int, sources: list[SourceTile], out_dir: Path, dtype: str) -> dict | None:
    b = cell_bounds(col, row)
    m = mosaic(sources, b)
    if m is None or np.all(np.isnan(m.data)):
        return None
    path = out_dir / f"{cell_key(col, row)}.tif"
    write_dem_cell(path, m, dtype)
    valid = m.data[~np.isnan(m.data)]
    return {
        "col": col,
        "row": row,
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "min": round(float(valid.min()), 1),
        "max": round(float(valid.max()), 1),
        "bounds": b.as_dict(),
    }


def build_dem_cells(
    source_paths: list[Path],
    bbox: Bounds,
    out_dir: Path,
    *,
    dem_name: str,
    attribution: str,
    dtype: str = "float32",
    workers: int = 4,
    work_dir: Path,
) -> dict:
    sources = index_sources(source_paths, work_dir / "source-index.json")
    if not sources:
        raise RuntimeError("no DEM source tiles — run `download-dem` first, or pass --source-dir")
    covered = Bounds(
        min(s.bounds.west for s in sources), min(s.bounds.south for s in sources),
        max(s.bounds.east for s in sources), max(s.bounds.north for s in sources),
    )
    cells = [
        (c, r) for c, r in cells_in_bounds(bbox)
        if cell_bounds(c, r).intersects(covered)
    ]
    log.info("building %d DEM cells from %d source tiles", len(cells), len(sources))

    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    with ProcessPoolExecutor(workers) as pool:
        futures = [
            pool.submit(_build_cell, c, r, [s for s in sources if s.bounds.intersects(cell_bounds(c, r))], out_dir, dtype)
            for c, r in cells
        ]
        for i, fut in enumerate(as_completed(futures), 1):
            res = fut.result()
            if res:
                results.append(res)
            if i % 10 == 0 or i == len(futures):
                log.info("  %d/%d cells", i, len(futures))

    # Merge with cells from earlier runs over other regions, so a dataset can
    # be grown one region at a time without losing what is already there.
    previous = []
    if (out_dir / "manifest.json").exists():
        previous = read_manifest(out_dir).get("cells", [])
    by_key = {(c["col"], c["row"]): c for c in previous}
    by_key.update({(c["col"], c["row"]): c for c in results})
    all_cells = sorted(by_key.values(), key=lambda c: (c["row"], c["col"]))
    if not all_cells:
        raise RuntimeError("no land in that bbox — every cell came out empty")

    extent = [
        min(c["bounds"]["west"] for c in all_cells), min(c["bounds"]["south"] for c in all_cells),
        max(c["bounds"]["east"] for c in all_cells), max(c["bounds"]["north"] for c in all_cells),
    ]
    manifest = {
        **header(
            id="dem-cells",
            kind="dem-cells",
            title=f"Elevation ({dem_name}), 2° analysis cells",
            attribution=attribution,
            bounds=extent,
            encoding={"format": "geotiff", "dtype": dtype, "compression": "deflate", "units": "m"},
            source=dem_name,
            parameters={"dtype": dtype},
        ),
        "version": 1,
        "gridOrigin": {"lon": ORIGIN_LON, "lat": ORIGIN_LAT},
        "cellDeg": CELL_DEG,
        "pathTemplate": "{cell}.tif",
        "cells": all_cells,
        "dem": {"source": dem_name, "verticalDatum": "EGM2008", "nodata": NODATA},
    }
    write_manifest(out_dir, manifest)
    total = sum(c["bytes"] for c in all_cells)
    log.info("dem-cells: %d cells, %.1f MB, largest %.1f MB", len(all_cells), total / 1e6, max(c["bytes"] for c in all_cells) / 1e6)
    return manifest


def dem_sources_from_cells(dem_dir: Path) -> list[SourceTile]:
    """The dem-cells output as a source list, for the products built from it."""
    m = read_manifest(dem_dir)
    deg = m.get("cellDeg", CELL_DEG)
    out = []
    for c in m["cells"]:
        b = Bounds(**c["bounds"]) if "bounds" in c else cell_bounds(c["col"], c["row"], deg)
        out.append(SourceTile(dem_dir / m["pathTemplate"].replace("{cell}", cell_key(c["col"], c["row"])), b, 0.0, 0.0))
    # Resolution differs between Copernicus longitude zones; mosaic() takes the
    # finest of whatever it is given.
    for s in out:
        with rasterio.open(s.path) as ds:
            s.xres, s.yres = abs(ds.res[0]), abs(ds.res[1])
    return out
