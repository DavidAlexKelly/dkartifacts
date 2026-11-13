"""
contours: labelled vector contours as one continuous pyramid.

The current Contours dataset is one PMTiles archive per DEM cell, each tiled
from that cell alone at z10 only. A map tile on a cell boundary can't be
served from one archive, so the client attaches a source per visible cell.

Here the lines are traced per cell (with a one-pixel overlap, then clipped
exactly to the cell so neighbours meet without gaps or duplicates). Then ALL
of them are tiled together by tippecanoe into one pyramid across several
zooms, and the chunker cuts that pyramid into archives like any other. Tiles
on cell boundaries are complete, and the per-cell sources are no longer needed.

Feature properties:
    ELEV   height in metres — what decho-elevation's contour layer reads
    index  true on every `index_every`-th line (labelled, drawn heavier)
Index lines appear from `min_zoom`, the rest from `min_zoom + 2`, via a
tippecanoe zoom filter (-j). NOT via the per-feature `"tippecanoe": {"minzoom"}`
key: measured with tippecanoe 2.49, that key made it drop ~97% of the lines at
every zoom, the deepest included, and report them only as "dropped_by_rate".

Requires the `tippecanoe` command (https://github.com/felt/tippecanoe).
"""

from __future__ import annotations

import json
import logging
import math
import shutil
import subprocess
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import contourpy
import numpy as np
from shapely import clip_by_rect
from shapely.geometry import LineString, mapping

from .grid import cell_bounds, cell_for, cell_key
from .raster import SourceTile, mosaic

log = logging.getLogger(__name__)


def _trace(args) -> tuple[str, int]:
    col, row, sources, interval, index_every, out_path = args
    cb = cell_bounds(col, row)
    own = next(s for s in sources if cell_for(s.bounds.west + 1e-9, s.bounds.north - 1e-9) == (col, row))
    pad_x, pad_y = own.xres, own.yres
    m = mosaic(sources, cb.expand(max(pad_x, pad_y)), own.xres, own.yres)
    if m is None or np.all(np.isnan(m.data)):
        return str(out_path), 0
    data = np.ma.masked_invalid(m.data)
    lo = math.ceil(float(data.min()) / interval) * interval
    hi = math.floor(float(data.max()) / interval) * interval
    gen = contourpy.contour_generator(z=data, line_type=contourpy.LineType.Separate)
    count = 0
    with open(out_path, "w", encoding="utf-8") as out:
        for level in np.arange(lo, hi + interval, interval):
            if level == 0:
                continue  # the coastline; the basemap draws it better
            for line in gen.lines(level):
                if len(line) < 2:
                    continue
                lon = m.west + (line[:, 0] + 0.5) * m.xres
                lat = m.north - (line[:, 1] + 0.5) * m.yres
                geom = clip_by_rect(LineString(np.column_stack([lon, lat])), cb.west, cb.south, cb.east, cb.north)
                if geom.is_empty:
                    continue
                is_index = int(level) % (interval * index_every) == 0
                feature = {
                    "type": "Feature",
                    "properties": {"ELEV": int(level), "index": is_index},
                    "geometry": mapping(geom),
                }
                out.write(json.dumps(feature, separators=(",", ":")))
                out.write("\n")
                count += 1
    return str(out_path), count


def trace_contours(
    sources: list[SourceTile],
    work: Path,
    *,
    interval: int,
    index_every: int,
    workers: int,
) -> Path:
    cells_dir = work / "contour-cells"
    cells_dir.mkdir(parents=True, exist_ok=True)
    jobs = []
    for s in sources:
        col, row = cell_for(s.bounds.west + 1e-9, s.bounds.north - 1e-9)
        nearby = [o for o in sources if o.bounds.intersects(s.bounds.expand(0.01))]
        jobs.append((col, row, nearby, interval, index_every, cells_dir / f"{cell_key(col, row)}.ndjson"))
    total = 0
    with ProcessPoolExecutor(workers) as pool:
        for i, (_, n) in enumerate(pool.map(_trace, jobs), 1):
            total += n
            if i % 10 == 0 or i == len(jobs):
                log.info("  traced %d/%d cells, %d lines", i, len(jobs), total)
    combined = work / "contours.ndjson"
    with open(combined, "wb") as out:
        for *_, path in jobs:
            with open(path, "rb") as src:
                shutil.copyfileobj(src, out)
    return combined


def tile_contours(ndjson: Path, mbtiles: Path, *, min_zoom: int, max_zoom: int) -> Path:
    exe = shutil.which("tippecanoe")
    if not exe:
        raise RuntimeError("the `tippecanoe` command is not on PATH — see https://github.com/felt/tippecanoe")
    cmd = [
        exe, "-o", str(mbtiles), "--force",
        "-l", "contours",
        f"-Z{min_zoom}", f"-z{max_zoom}",
        "-P",                       # read the line-delimited input in parallel
        "--buffer=8",
        "--no-tile-size-limit",     # contours are never dropped to fit a tile
        "--no-feature-limit",
        "-r1",                      # no rate-based thinning; the -j filter thins
        "-j", json.dumps({"contours": ["any", ["==", "index", True], [">=", "$zoom", min_zoom + 2]]}),
        "--simplification=4",
        str(ndjson),
    ]
    log.info("running %s", " ".join(cmd))
    subprocess.run(cmd, check=True)
    return mbtiles
