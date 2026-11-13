"""Reading DEM GeoTIFFs into arrays, and sampling them — the raster plumbing every step shares."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.merge import merge
from rasterio.transform import from_origin

from .grid import Bounds

log = logging.getLogger(__name__)

NODATA = -32768.0


@dataclass
class SourceTile:
    path: Path
    bounds: Bounds
    xres: float
    yres: float


@dataclass
class Mosaic:
    """A lat/lon grid of heights. NaN where nothing covers it."""

    data: np.ndarray  # float32 (rows, cols), row 0 at the north
    west: float
    north: float
    xres: float
    yres: float

    def sample(self, lon: np.ndarray, lat: np.ndarray, void: float = 0.0) -> np.ndarray:
        """Bilinear sample at pixel-centre coordinates. Voids read as `void` (sea level)."""
        data = np.where(np.isnan(self.data), void, self.data)
        h, w = data.shape
        px = (lon - self.west) / self.xres - 0.5
        py = (self.north - lat) / self.yres - 0.5
        px = np.clip(px, 0, w - 1)
        py = np.clip(py, 0, h - 1)
        x0 = np.floor(px).astype(np.int64)
        y0 = np.floor(py).astype(np.int64)
        x1 = np.minimum(x0 + 1, w - 1)
        y1 = np.minimum(y0 + 1, h - 1)
        fx = px - x0
        fy = py - y0
        top = data[y0, x0] * (1 - fx) + data[y0, x1] * fx
        bottom = data[y1, x0] * (1 - fx) + data[y1, x1] * fx
        return (top * (1 - fy) + bottom * fy).astype(np.float32)


def index_sources(paths: list[Path], cache: Path | None = None) -> list[SourceTile]:
    """Bounds and resolution of each GeoTIFF, read from the files (and cached)."""
    known: dict[str, dict] = {}
    if cache and cache.exists():
        known = json.loads(cache.read_text())
    out = []
    for p in paths:
        key = str(p.resolve())
        entry = known.get(key)
        if entry is None or entry.get("mtime") != p.stat().st_mtime:
            with rasterio.open(p) as ds:
                if ds.crs is None or ds.crs.to_epsg() != 4326:
                    raise ValueError(f"{p} is in {ds.crs}, not EPSG:4326 — reproject it first")
                b = ds.bounds
                entry = {
                    "mtime": p.stat().st_mtime,
                    "bounds": [b.left, b.bottom, b.right, b.top],
                    "res": [abs(ds.res[0]), abs(ds.res[1])],
                }
            known[key] = entry
        out.append(SourceTile(p, Bounds(*entry["bounds"]), entry["res"][0], entry["res"][1]))
    if cache:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(known))
    return out


def mosaic(
    sources: list[SourceTile],
    bounds: Bounds,
    xres: float | None = None,
    yres: float | None = None,
) -> Mosaic | None:
    """
    Heights over `bounds` from whichever sources overlap it, at the finest
    resolution among them unless one is given. None when nothing overlaps.

    Copernicus tiles north of 50° are narrower in longitude than in latitude;
    taking the finest x resolution keeps a cell straddling a zone boundary at
    the better of the two rather than throwing detail away.
    """
    hits = [s for s in sources if s.bounds.intersects(bounds)]
    if not hits:
        return None
    xres = xres or min(s.xres for s in hits)
    yres = yres or min(s.yres for s in hits)
    datasets = [rasterio.open(s.path) for s in hits]
    try:
        arr, transform = merge(
            datasets,
            bounds=(bounds.west, bounds.south, bounds.east, bounds.north),
            res=(xres, yres),
            nodata=NODATA,
            dtype="float32",
            resampling=Resampling.bilinear,
        )
    finally:
        for ds in datasets:
            ds.close()
    data = arr[0].astype(np.float32)
    # Each source's own nodata was mapped to NODATA by merge; GLO's voids use it too.
    data[data <= NODATA + 1] = np.nan
    return Mosaic(data, transform.c, transform.f, transform.a, -transform.e)


def write_dem_cell(path: Path, m: Mosaic, dtype: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = m.data
    if dtype == "int16":
        out = np.where(np.isnan(data), NODATA, np.round(data)).astype(np.int16)
        predictor = 2
    else:
        out = np.where(np.isnan(data), NODATA, data).astype(np.float32)
        # decho-elevation's decoder implements predictor 2 but not 3 (the
        # floating-point one), and predictor 2 on floats buys nothing.
        predictor = 1
    h, w = out.shape
    transform = from_origin(m.west, m.north, m.xres, m.yres)
    tmp = path.with_suffix(".tif.part")
    with rasterio.open(
        tmp, "w", driver="GTiff", height=h, width=w, count=1, dtype=out.dtype,
        crs="EPSG:4326", transform=transform, nodata=NODATA,
        compress="deflate", predictor=predictor, tiled=True, blockxsize=256, blockysize=256,
        BIGTIFF="NO",
    ) as ds:
        ds.write(out, 1)
    tmp.replace(path)
