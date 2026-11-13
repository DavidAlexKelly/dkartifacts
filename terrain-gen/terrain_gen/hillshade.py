"""
hillshade: pre-shaded relief as a transparent raster pyramid.

Optional. MapLibre can shade the terrain pyramid itself with a `hillshade`
layer, and that is the simpler setup. This product exists for clients that want
a plain raster overlay (a static export, a print layout, a non-MapLibre
renderer) and replaces the current Hillshade dataset of 8-bit GeoTIFF cells.

Each tile is shaded from the terrain pyramid AT ITS OWN ZOOM, with a one-pixel
border taken from its eight neighbours so there are no seams. Shadows are black
and highlights white, both with alpha, so the layer can sit over any basemap
style; flat ground is fully transparent.

Algorithm: Horn's slope (as gdaldem), sun at `azimuth`/`altitude`. Low zooms
get vertical exaggeration — a 256-pixel tile of a whole continent is otherwise
too smooth to shade at all:  exaggeration(z) = max(1, 2 ** ((10 - z) / 3)).
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

from .grid import mercator_pixel_m
from .terrain import decode_image
from .tiles import TileStore

log = logging.getLogger(__name__)


def exaggeration(z: int) -> float:
    return max(1.0, 2 ** ((10 - z) / 3))


def shade(elev: np.ndarray, z: int, y: int, size: int, azimuth: float = 315.0, altitude: float = 45.0) -> np.ndarray:
    """`elev` is (size+2, size+2) with a one-pixel border. Returns (size, size) shade in [0, 1]."""
    n = 2**z
    ys = (y + (np.arange(size) + 0.5) / size) / n
    lat = np.arctan(np.sinh(np.pi * (1 - 2 * ys)))
    # Mercator is conformal: a pixel is square on the ground, cos(lat) times its equatorial size.
    cs = (mercator_pixel_m(z, size) * np.cos(lat))[:, None]
    e = elev * exaggeration(z)
    a, b, c = e[:-2, :-2], e[:-2, 1:-1], e[:-2, 2:]
    d, f = e[1:-1, :-2], e[1:-1, 2:]
    g, h, i = e[2:, :-2], e[2:, 1:-1], e[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cs)
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * cs)
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(dzdy, -dzdx)
    zenith = math.radians(90 - altitude)
    az = math.radians(360 - azimuth + 90)
    out = math.cos(zenith) * np.cos(slope) + math.sin(zenith) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(out, 0, 1)


def to_rgba(s: np.ndarray, altitude: float = 45.0, strength: float = 0.8) -> np.ndarray:
    flat = math.cos(math.radians(90 - altitude))
    delta = s - flat
    dark = np.clip(-delta / flat, 0, 1) * strength
    light = np.clip(delta / (1 - flat), 0, 1) * strength * 0.6
    rgba = np.zeros(s.shape + (4,), np.uint8)
    rgba[..., :3] = np.where(light > dark, 255, 0)[..., None]
    rgba[..., 3] = np.round(np.maximum(dark, light) * 255).astype(np.uint8)
    return rgba


def _tile(args):
    z, x, y, size, fmt, quality, neighbours = args
    centre = neighbours.get((0, 0))
    if not centre:
        return None
    grid = np.zeros((size * 3, size * 3), np.float32)
    for (dx, dy), data in neighbours.items():
        if data:
            grid[(dy + 1) * size:(dy + 2) * size, (dx + 1) * size:(dx + 2) * size] = decode_image(data)
    # A missing neighbour is sea, or the edge of what was built. Copying our own
    # tile into its slot keeps the border from reading as a cliff to sea level.
    centre_arr = grid[size:2 * size, size:2 * size].copy()
    for (dx, dy), data in neighbours.items():
        if not data:
            ys = slice((dy + 1) * size, (dy + 2) * size)
            xs = slice((dx + 1) * size, (dx + 2) * size)
            grid[ys, xs] = centre_arr
    elev = grid[size - 1:2 * size + 1, size - 1:2 * size + 1]
    rgba = to_rgba(shade(elev, z, y, size))
    if not rgba[..., 3].any():
        return None
    buf = io.BytesIO()
    img = Image.fromarray(rgba, "RGBA")
    if fmt == "webp":
        img.save(buf, "WEBP", quality=quality, method=4)
    else:
        img.save(buf, "PNG", compress_level=6)
    return (z, x, y, buf.getvalue())


def build_hillshade(
    terrain: TileStore,
    store_path: Path,
    *,
    min_zoom: int,
    max_zoom: int,
    size: int,
    fmt: str,
    quality: int,
    workers: int,
) -> TileStore:
    store = TileStore(store_path, TileType.WEBP if fmt == "webp" else TileType.PNG, Compression.NONE)
    store.set_meta("format", fmt)
    with ProcessPoolExecutor(workers) as pool:
        for z in range(min_zoom, max_zoom + 1):
            store.clear_zoom(z)
            keys = sorted(terrain.keys(z))
            n = 2**z
            for start in range(0, len(keys), 1024):
                jobs = []
                for x, y in keys[start:start + 1024]:
                    nb = {}
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            ny = y + dy
                            nb[(dx, dy)] = terrain.get(z, (x + dx) % n, ny) if 0 <= ny < n else None
                    jobs.append((z, x, y, size, fmt, quality, nb))
                store.put_many([r for r in pool.map(_tile, jobs, chunksize=8) if r])
            log.info("  hillshade z%d: %d tiles", z, len(store.keys(z)))
    return store
