"""
terrain: a Terrarium-encoded raster-dem pyramid, for MapLibre's native
terrain and hillshade.

Today decho-elevation decodes 3-25 MB GeoTIFFs in the browser and encodes them
into Terrarium tiles on the fly, which is why nothing loads below zoom 9. The
same tiles, made here once, can be served at every zoom from small archives,
and MapLibre draws them with no custom protocol work at all.

The encoding matches decho-elevation's terrarium.ts byte for byte:

    height = (R * 256 + G + B / 256) - 32768

voids are sea level (raster-dem has no "missing"), and heights are clamped,
not wrapped.

HOW THE PYRAMID IS MADE
-----------------------
The deepest zoom is sampled straight from the DEM cells (bilinear, pixel
centres) and rounded to `precision`. Every shallower zoom is the 2x2 mean of the four tiles below it, so
a coastline at z4 is the average of what is at z11 rather than a point sample
that aliases. Tiles that are entirely sea level are not written; MapLibre
treats a missing raster-dem tile as flat.
"""

from __future__ import annotations

import io
import logging
import math
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image
from pmtiles.tile import Compression, TileType

from .grid import (
    MERCATOR_MAX_LAT,
    Bounds,
    cell_bounds,
    cell_for,
    tile_bounds,
    tiles_in_bounds,
)
from .raster import SourceTile, mosaic
from .tiles import TileStore

log = logging.getLogger(__name__)


# ── Terrarium ───────────────────────────────────────────────────────────────


def encode_terrarium(h: np.ndarray) -> np.ndarray:
    value = np.clip(np.where(np.isfinite(h), h, 0.0) + 32768.0, 0.0, 65535.99)
    whole = np.floor(value)
    rgb = np.empty(h.shape + (3,), np.uint8)
    w = whole.astype(np.int64)
    rgb[..., 0] = (w >> 8) & 0xFF
    rgb[..., 1] = w & 0xFF
    rgb[..., 2] = np.minimum(255, np.floor((value - whole) * 256)).astype(np.uint8)
    return rgb


def decode_terrarium(rgb: np.ndarray) -> np.ndarray:
    rgb = rgb.astype(np.float32)
    return rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768


def quantize(h: np.ndarray, precision: float) -> np.ndarray:
    """
    Round heights to `precision` metres. Terrarium's blue channel carries
    1/256 m, which bilinear sampling fills with noise that does not compress:
    measured on GLO-90 over Norway, 0.25 m makes WebP tiles 2-3x smaller than
    full precision. GLO-90's own vertical accuracy is a few metres.
    """
    if precision <= 0:
        return h
    return np.round(h / precision) * precision


def encode_image(rgb: np.ndarray, fmt: str) -> bytes:
    buf = io.BytesIO()
    img = Image.fromarray(rgb, "RGB")
    if fmt == "webp":
        # method 1: measured the same size as 4 on Terrarium tiles, 18x faster.
        img.save(buf, "WEBP", lossless=True, quality=100, method=1)
    else:
        img.save(buf, "PNG", compress_level=6)
    return buf.getvalue()


def decode_image(data: bytes) -> np.ndarray:
    return decode_terrarium(np.asarray(Image.open(io.BytesIO(data)).convert("RGB")))


def tile_type_for(fmt: str) -> TileType:
    return TileType.WEBP if fmt == "webp" else TileType.PNG


# ── Sampling a tile from the DEM ────────────────────────────────────────────


def tile_lonlat(z: int, x: int, y: int, size: int) -> tuple[np.ndarray, np.ndarray]:
    """Lon/lat of every pixel centre of a mercator tile, as (size, size) grids."""
    n = 2**z
    cols = (x + (np.arange(size) + 0.5) / size) / n * 360.0 - 180.0
    ys = (y + (np.arange(size) + 0.5) / size) / n
    rows = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * ys))))
    return np.meshgrid(cols, rows)


def _cell_tiles(col: int, row: int, z: int) -> list[tuple[int, int]]:
    """Tiles at z whose centre falls in this cell — each tile belongs to exactly one cell."""
    cb = cell_bounds(col, row)
    out = []
    for x, y in tiles_in_bounds(cb, z):
        b = tile_bounds(z, x, y)
        lat_c = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 0.5) / 2**z))))
        if cell_for((b.west + b.east) / 2, lat_c) == (col, row):
            out.append((x, y))
    return out


def _render_cell(args) -> list[tuple[int, int, int, bytes]]:
    col, row, z, size, fmt, precision, sources = args
    tiles = _cell_tiles(col, row, z)
    if not tiles:
        return []
    # Read a margin around the cell so tiles straddling its edge are complete.
    margin = 360.0 / 2**z * 1.25
    region = cell_bounds(col, row).expand(margin)
    region = Bounds(region.west, max(region.south, -MERCATOR_MAX_LAT), region.east, min(region.north, MERCATOR_MAX_LAT))
    m = mosaic(sources, region)
    if m is None:
        return []
    out = []
    for x, y in tiles:
        lon, lat = tile_lonlat(z, x, y, size)
        h = quantize(m.sample(lon, lat), precision)
        if not np.any(h):
            continue
        out.append((z, x, y, encode_image(encode_terrarium(h), fmt)))
    return out


def render_max_zoom(
    sources: list[SourceTile],
    store: TileStore,
    *,
    z: int,
    size: int,
    fmt: str,
    precision: float,
    workers: int,
) -> int:
    store.clear_zoom(z)
    margin = 360.0 / 2**z * 1.25 + 0.01
    jobs = []
    for s in sources:
        col, row = cell_for(s.bounds.west + 1e-9, s.bounds.north - 1e-9)
        nearby = [o for o in sources if o.bounds.intersects(s.bounds.expand(margin))]
        jobs.append((col, row, z, size, fmt, precision, nearby))
    count = 0
    with ProcessPoolExecutor(workers) as pool:
        for i, rows in enumerate(pool.map(_render_cell, jobs), 1):
            store.put_many(rows)
            count += len(rows)
            if i % 10 == 0 or i == len(jobs):
                log.info("  z%d: %d/%d cells, %d tiles", z, i, len(jobs), count)
    return count


# ── Overviews ───────────────────────────────────────────────────────────────


def _downsample(args) -> tuple[int, int, int, bytes] | None:
    z, x, y, size, fmt, precision, children = args
    full = np.zeros((size * 2, size * 2), np.float32)
    for (dx, dy), data in children.items():
        if data:
            full[dy * size:(dy + 1) * size, dx * size:(dx + 1) * size] = decode_image(data)
    h = quantize(full.reshape(size, 2, size, 2).mean(axis=(1, 3)), precision)
    if not np.any(h):
        return None
    return (z, x, y, encode_image(encode_terrarium(h), fmt))


def build_overviews(store: TileStore, *, from_zoom: int, min_zoom: int, size: int, fmt: str, precision: float, workers: int) -> None:
    with ProcessPoolExecutor(workers) as pool:
        for z in range(from_zoom - 1, min_zoom - 1, -1):
            store.clear_zoom(z)
            parents = sorted({(x // 2, y // 2) for x, y in store.keys(z + 1)})

            # In batches: ProcessPoolExecutor.map submits everything it is given
            # at once, and every job carries four tiles' bytes.
            for start in range(0, len(parents), 2048):
                jobs = [
                    (z, px, py, size, fmt, precision, {
                        (dx, dy): store.get(z + 1, px * 2 + dx, py * 2 + dy)
                        for dx in (0, 1) for dy in (0, 1)
                    })
                    for px, py in parents[start:start + 2048]
                ]
                store.put_many([r for r in pool.map(_downsample, jobs, chunksize=16) if r])
            log.info("  z%d: %d tiles", z, len(store.keys(z)))


def build_terrain(
    sources: list[SourceTile],
    store_path: Path,
    *,
    min_zoom: int,
    max_zoom: int,
    size: int,
    fmt: str,
    precision: float,
    workers: int,
) -> TileStore:
    store = TileStore(store_path, tile_type_for(fmt), Compression.NONE)
    store.set_meta("format", fmt)
    log.info("terrain: sampling z%d from %d DEM cells", max_zoom, len(sources))
    render_max_zoom(sources, store, z=max_zoom, size=size, fmt=fmt, precision=precision, workers=workers)
    log.info("terrain: overviews z%d..z%d", min_zoom, max_zoom - 1)
    build_overviews(store, from_zoom=max_zoom, min_zoom=min_zoom, size=size, fmt=fmt, precision=precision, workers=workers)
    return store
