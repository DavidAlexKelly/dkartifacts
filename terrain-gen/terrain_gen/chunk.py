"""
Cut a tile pyramid into PMTiles archives that each fit a byte budget.

WHY ARCHIVES HAVE TO BE SMALL
-----------------------------
Foundry's file-content endpoint ignores HTTP Range, so the browser downloads a
whole archive to read one tile from it. The archive is the transfer unit, and
its size is what a user waits for. A fixed 2-degree cut gives 3 MB over the
steppe and 25 MB over the Alps; this picks the cut per zoom so that no archive
exceeds `target_bytes`.

THE LAYOUT IT WRITES
--------------------
    manifest.json
    z0-z5.pmtiles                     every low zoom, one archive
    z6-z8/c012_r004.pmtiles           a band of zooms, cut into cells
    z9/c178_r011.pmtiles              ...finer cells where the data is denser

and a manifest in the GlobeManifest shape decho-basemap already reads:

    { gridOrigin, layers: [ {type: "single", path, bytes, sha256},
                            {type: "grid", cellDeg, pathTemplate,
                             cells: [{col, row, bytes, sha256}]} ] }

Cell sizes are drawn from CELL_DEGS: powers of two times the analysis grid's
2 degrees, so every display cell nests exactly inside or around analysis cells.

HOW THE CUT IS CHOSEN
---------------------
1. The single archive takes zooms from 0 for as long as their total stays
   under the budget.
2. Each remaining zoom gets the COARSEST cell size whose largest cell fits.
3. Adjacent zooms are merged into one band while the merged band still fits,
   so a user zooming in does not fetch a new archive at every step.
A zoom whose tiles do not fit even the finest cell size is still written, at
that size, and reported.
"""

from __future__ import annotations

import logging
import math
import shutil
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

from .grid import ORIGIN_LAT, ORIGIN_LON, tile_bounds
from .manifest import sha256_file
from .tiles import TileSource

log = logging.getLogger(__name__)

CELL_DEGS = [128.0, 64.0, 32.0, 16.0, 8.0, 4.0, 2.0, 1.0, 0.5, 0.25]


@dataclass
class ZoomIndex:
    x: np.ndarray
    y: np.ndarray
    size: np.ndarray

    def total(self) -> int:
        return int(self.size.sum())


@dataclass
class Band:
    min_zoom: int
    max_zoom: int
    cell_deg: float | None  # None: one archive for the whole band
    largest: int = 0
    archives: int = 0
    over_budget: bool = False
    cells: dict = field(default_factory=dict)


def build_index(source: TileSource) -> dict[int, ZoomIndex]:
    xs, ys, ss = defaultdict(list), defaultdict(list), defaultdict(list)
    for z, x, y, size in source.index():
        xs[z].append(x)
        ys[z].append(y)
        ss[z].append(size)
    return {
        z: ZoomIndex(np.asarray(xs[z], np.int64), np.asarray(ys[z], np.int64), np.asarray(ss[z], np.int64))
        for z in sorted(xs)
    }


def _nw_lon_lat(z: int, x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    # Vectorised tile_north_west, same operation order as decho-basemap's stores.ts.
    n = 2**z
    lon = (x / n) * 360 - 180
    lat = (np.arctan(np.sinh(np.pi * (1 - (2 * y) / n))) * 180) / np.pi
    return lon, lat


def _cells(z: int, idx: ZoomIndex, cell_deg: float) -> tuple[np.ndarray, np.ndarray]:
    lon, lat = _nw_lon_lat(z, idx.x, idx.y)
    return (
        np.floor((lon - ORIGIN_LON) / cell_deg).astype(np.int64),
        np.floor((ORIGIN_LAT - lat) / cell_deg).astype(np.int64),
    )


def _largest_cell(zooms: dict[int, ZoomIndex], band: range, cell_deg: float) -> tuple[int, int]:
    totals: dict[tuple[int, int], int] = defaultdict(int)
    for z in band:
        idx = zooms.get(z)
        if idx is None or len(idx.size) == 0:
            continue
        col, row = _cells(z, idx, cell_deg)
        # Sum per cell with numpy, then fold into the band's totals.
        # Rows can be -1 (tiles north of 85°), so offset them before packing.
        key = col * 100_000 + (row + 1_000)
        uniq, inv = np.unique(key, return_inverse=True)
        sums = np.bincount(inv, weights=idx.size)
        for k, s in zip(uniq.tolist(), sums.tolist()):
            totals[(k // 100_000, k % 100_000 - 1_000)] += int(s)
    return (max(totals.values()) if totals else 0), len(totals)


def plan_bands(zooms: dict[int, ZoomIndex], target_bytes: int) -> list[Band]:
    if not zooms:
        return []
    ordered = sorted(zooms)
    bands: list[Band] = []

    # 1. The single archive.
    running = 0
    single_max = ordered[0]
    for z in ordered:
        if running + zooms[z].total() > target_bytes and z != ordered[0]:
            break
        running += zooms[z].total()
        single_max = z
    bands.append(Band(ordered[0], single_max, None, running, 1, running > target_bytes))

    # 2. Coarsest fitting cell size per remaining zoom.
    rest = [z for z in ordered if z > single_max]
    choice: dict[int, float] = {}
    for z in rest:
        picked = CELL_DEGS[-1]
        for deg in CELL_DEGS:
            largest, _ = _largest_cell(zooms, range(z, z + 1), deg)
            if largest <= target_bytes:
                picked = deg
                break
        choice[z] = picked

    # 3. Merge neighbours while the merged band fits.
    i = 0
    while i < len(rest):
        start = rest[i]
        deg = choice[start]
        end = start
        largest, count = _largest_cell(zooms, range(start, start + 1), deg)
        j = i + 1
        while j < len(rest) and rest[j] == end + 1:
            trial_deg = min(deg, choice[rest[j]])
            trial_largest, trial_count = _largest_cell(zooms, range(start, rest[j] + 1), trial_deg)
            if trial_largest > target_bytes:
                break
            deg, end, largest, count = trial_deg, rest[j], trial_largest, trial_count
            j += 1
        bands.append(Band(start, end, deg, largest, count, largest > target_bytes))
        i = j
    return bands


def _bounds_e7(tiles: list[tuple[int, int, int]]) -> dict:
    w = s = math.inf
    e = n = -math.inf
    for z, x, y in tiles:
        b = tile_bounds(z, x, y)
        w, s, e, n = min(w, b.west), min(s, b.south), max(e, b.east), max(n, b.north)
    return {
        "min_lon_e7": int(w * 1e7),
        "min_lat_e7": int(max(s, -85.0511) * 1e7),
        "max_lon_e7": int(e * 1e7),
        "max_lat_e7": int(min(n, 85.0511) * 1e7),
        "center_lon_e7": int((w + e) / 2 * 1e7),
        "center_lat_e7": int(max(-85.0, min(85.0, (s + n) / 2)) * 1e7),
    }


def write_archive(
    path: Path,
    source: TileSource,
    tiles: list[tuple[int, int, int]],
    metadata: dict,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = sorted(tiles, key=lambda t: zxy_to_tileid(*t))
    tmp = path.with_suffix(".pmtiles.part")
    with open(tmp, "wb") as f:
        writer = Writer(f)
        for z, x, y in ordered:
            data = source.get(z, x, y)
            if data:
                writer.write_tile(zxy_to_tileid(z, x, y), data)
        hdr = {
            "tile_type": source.tile_type,
            "tile_compression": source.compression,
            "center_zoom": ordered[0][0],
            **_bounds_e7(ordered),
        }
        writer.finalize(hdr, metadata)
    tmp.replace(path)


def chunk(
    source: TileSource,
    out_dir: Path,
    *,
    target_bytes: int,
    metadata: dict,
    clean: bool = True,
) -> dict:
    """Write the archives and return the GlobeManifest part of the manifest."""
    if clean and out_dir.exists():
        for child in out_dir.iterdir():
            if child.is_dir() and child.name.startswith("z"):
                shutil.rmtree(child)
            elif child.suffix == ".pmtiles":
                child.unlink()
    out_dir.mkdir(parents=True, exist_ok=True)

    zooms = build_index(source)
    if not zooms:
        raise RuntimeError("the tile source is empty — nothing to chunk")
    bands = plan_bands(zooms, target_bytes)

    layers = []
    for band in bands:
        label = f"z{band.min_zoom}" if band.min_zoom == band.max_zoom else f"z{band.min_zoom}-z{band.max_zoom}"
        if band.cell_deg is None:
            tiles = [
                (z, int(x), int(y))
                for z in range(band.min_zoom, band.max_zoom + 1)
                for x, y in zip(zooms[z].x, zooms[z].y)
            ]
            rel = f"{label}.pmtiles"
            write_archive(out_dir / rel, source, tiles, metadata)
            layers.append(
                {
                    "id": label,
                    "minZoom": band.min_zoom,
                    "maxZoom": band.max_zoom,
                    "type": "single",
                    "path": rel,
                    "bytes": (out_dir / rel).stat().st_size,
                    "sha256": sha256_file(out_dir / rel),
                }
            )
            log.info("%s: 1 archive, %.1f MB", label, (out_dir / rel).stat().st_size / 1e6)
            continue

        by_cell: dict[tuple[int, int], list[tuple[int, int, int]]] = defaultdict(list)
        for z in range(band.min_zoom, band.max_zoom + 1):
            idx = zooms.get(z)
            if idx is None:
                continue
            col, row = _cells(z, idx, band.cell_deg)
            for c, r, x, y in zip(col.tolist(), row.tolist(), idx.x.tolist(), idx.y.tolist()):
                by_cell[(c, r)].append((z, x, y))

        template = f"{label}/c{{col}}_r{{row}}.pmtiles"
        cells = []
        for (c, r), tiles in sorted(by_cell.items()):
            rel = template.replace("{col}", str(c).rjust(3, "0")).replace("{row}", str(r).rjust(3, "0"))
            write_archive(out_dir / rel, source, tiles, metadata)
            cells.append({"col": c, "row": r, "bytes": (out_dir / rel).stat().st_size, "sha256": sha256_file(out_dir / rel)})
        layers.append(
            {
                "id": label,
                "minZoom": band.min_zoom,
                "maxZoom": band.max_zoom,
                "type": "grid",
                "cellDeg": band.cell_deg,
                "pathTemplate": template,
                "cells": cells,
            }
        )
        largest = max(c["bytes"] for c in cells)
        log.info("%s: %d archives at %g°, largest %.1f MB", label, len(cells), band.cell_deg, largest / 1e6)
        if largest > target_bytes:
            log.warning(
                "%s: largest archive %.1f MB is over the %.1f MB target even at %g° cells",
                label, largest / 1e6, target_bytes / 1e6, band.cell_deg,
            )

    return {"version": 2, "gridOrigin": {"lon": ORIGIN_LON, "lat": ORIGIN_LAT}, "layers": layers}


def tile_type_name(t: TileType) -> str:
    return {TileType.PNG: "png", TileType.WEBP: "webp", TileType.JPEG: "jpg", TileType.MVT: "mvt"}.get(t, "unknown")


def compression_name(c: Compression) -> str:
    return {Compression.NONE: "none", Compression.GZIP: "gzip", Compression.BROTLI: "brotli", Compression.ZSTD: "zstd"}.get(c, "unknown")
