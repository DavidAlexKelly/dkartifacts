"""
imagery: any raster imagery as a web-mercator raster pyramid (kind "raster").

Two inputs:

  GeoTIFF / COG files in any CRS
      Each file is warped (bilinear; nearest for paletted images) onto the
      EPSG:3857 pixel grid of the deepest zoom through a rasterio WarpedVRT
      sized to whole tiles, so a tile is one exact window read with a single
      resampling. Later files are drawn over earlier ones. Nodata, internal
      masks and alpha bands become transparency. Non-8-bit data is stretched
      to 0-255 (`scale`, or each file's 2nd-98th percentile).

  An XYZ tile service ("https://…/{z}/{x}/{y}.jpg")
      Fetched for a bbox at the deepest zoom (or every zoom), with a
      concurrency limit, retries with backoff, Retry-After honoured, and a
      "terrain-gen" User-Agent. Downloads are cached in the work folder, so a
      rerun fetches nothing twice. YOU must have the right to download and
      redistribute those tiles: most public tile services forbid bulk
      download (the OpenStreetMap tile servers do, for one).

The deepest zoom is rendered (or fetched), then every shallower zoom is the
2x2 average of the four tiles below it, as in terrain.build_overviews.
Averaging is alpha-weighted, so transparent pixels don't darken edges.

Fully transparent tiles are not written. WebP tiles carry alpha where they are
partly transparent; JPEG has no alpha, so partly covered JPEG tiles are black
where there is no data.
"""

from __future__ import annotations

import hashlib
import io
import logging
import math
import time
import urllib.error
import urllib.request
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from pmtiles.tile import Compression, TileType

from . import __version__
from .grid import EARTH_CIRCUMFERENCE_M, Bounds, tiles_in_bounds
from .tiles import TileStore

log = logging.getLogger(__name__)

HALF = EARTH_CIRCUMFERENCE_M / 2  # 20037508.34…: the mercator half-width in metres
USER_AGENT = f"terrain-gen/{__version__}"


def tile_type_for(fmt: str) -> TileType:
    return TileType.WEBP if fmt == "webp" else TileType.JPEG


# ── Encoding ────────────────────────────────────────────────────────────────


def encode_rgba(rgba: np.ndarray, fmt: str, quality: int) -> bytes | None:
    """None for a fully transparent tile. Opaque tiles are written without alpha."""
    alpha = rgba[..., 3]
    if not alpha.any():
        return None
    buf = io.BytesIO()
    if fmt == "jpg":
        rgb = (rgba[..., :3].astype(np.float32) * (alpha[..., None] / 255.0)).round().astype(np.uint8)
        Image.fromarray(rgb, "RGB").save(buf, "JPEG", quality=quality, optimize=True)
    elif alpha.min() == 255:
        Image.fromarray(np.ascontiguousarray(rgba[..., :3]), "RGB").save(buf, "WEBP", quality=quality, method=4)
    else:
        # Overviews average alpha-weighted, so the colour under transparent pixels doesn't
        # matter and libwebp may flatten it (exact=False) to compress better.
        Image.fromarray(rgba, "RGBA").save(buf, "WEBP", quality=quality, method=4)
    return buf.getvalue()


def decode_rgba(data: bytes | None, size: int) -> np.ndarray:
    if not data:
        return np.zeros((size, size, 4), np.uint8)
    img = Image.open(io.BytesIO(data)).convert("RGBA")
    if img.size != (size, size):
        img = img.resize((size, size), Image.BILINEAR)
    return np.asarray(img)


# ── Mercator tile grid ──────────────────────────────────────────────────────


def pixel_res(z: int, size: int) -> float:
    return 2 * HALF / (size * 2**z)


def zoom_for_resolution(res_m: float, size: int) -> int:
    """The shallowest zoom whose pixels are (about) as fine as the source's."""
    z = math.log2(2 * HALF / (size * res_m))
    return max(0, min(22, math.ceil(z - 0.25)))  # within ~20% of the source resolution is good enough


@dataclass
class RasterSource:
    path: str
    stretch: tuple[float, float] | None  # (lo, hi) to map to 0..255, None for 8-bit data
    bounds_3857: tuple[float, float, float, float]
    bounds_4326: tuple[float, float, float, float]
    res_3857: float  # mercator metres per source pixel


def index_rasters(paths: list[Path], scale: tuple[float, float] | None = None) -> list[RasterSource]:
    import rasterio
    from rasterio.warp import calculate_default_transform, transform_bounds

    out = []
    for p in paths:
        with rasterio.open(p) as ds:
            if ds.crs is None:
                raise ValueError(f"{p} has no CRS — georeference it first")
            b = ds.bounds
            mb = transform_bounds(ds.crs, "EPSG:3857", *b, densify_pts=21)
            mb = (mb[0], max(mb[1], -HALF), mb[2], min(mb[3], HALF))
            gb = transform_bounds(ds.crs, "EPSG:4326", *b, densify_pts=21)
            t, _, _ = calculate_default_transform(ds.crs, "EPSG:3857", ds.width, ds.height, *b)
            stretch = None
            if ds.dtypes[0] != "uint8" and not _palette(ds):
                if scale:
                    stretch = scale
                else:
                    bands = _colour_bands(ds)
                    f = max(1, max(ds.width, ds.height) // 1024)
                    sample = ds.read(bands, out_shape=(len(bands), max(1, ds.height // f), max(1, ds.width // f)), masked=True)
                    vals = sample.compressed().astype(np.float64)
                    vals = vals[np.isfinite(vals)]
                    lo, hi = (np.percentile(vals, [2, 98]) if vals.size else (0.0, 255.0))
                    stretch = (float(lo), float(hi) if hi > lo else float(lo) + 1)
                log.info("%s: %s data, stretching %g..%g to 0..255", p.name, ds.dtypes[0], *stretch)
        out.append(RasterSource(str(p), stretch, tuple(mb), tuple(gb), abs(t.a)))
    return out


def _palette(ds) -> bool:
    from rasterio.enums import ColorInterp

    return ds.count == 1 and ds.colorinterp[0] == ColorInterp.palette


def _colour_bands(ds) -> list[int]:
    from rasterio.enums import ColorInterp

    bands = [i + 1 for i, ci in enumerate(ds.colorinterp) if ci != ColorInterp.alpha]
    return bands[:3] if len(bands) >= 3 else bands[:1]


def _tile_range(bounds_3857, z: int, size: int) -> tuple[int, int, int, int]:
    span = pixel_res(z, size) * size
    n = 2**z
    x0 = max(0, math.floor((bounds_3857[0] + HALF) / span))
    x1 = min(n - 1, math.ceil((bounds_3857[2] + HALF) / span) - 1)
    y0 = max(0, math.floor((HALF - bounds_3857[3]) / span))
    y1 = min(n - 1, math.ceil((HALF - bounds_3857[1]) / span) - 1)
    return x0, y0, x1, y1


# ── Rendering the deepest zoom from rasters ─────────────────────────────────

_open: dict = {}  # per worker process: (path, z, size) -> (src, vrt, layout)


def _vrt(src_spec: RasterSource, z: int, size: int):
    key = (src_spec.path, z, size)
    if key in _open:
        return _open[key]
    import rasterio
    from rasterio.enums import ColorInterp, Resampling
    from rasterio.transform import Affine
    from rasterio.vrt import WarpedVRT

    src = rasterio.open(src_spec.path)
    x0, y0, x1, y1 = _tile_range(src_spec.bounds_3857, z, size)
    res = pixel_res(z, size)
    transform = Affine(res, 0, -HALF + x0 * size * res, 0, -res, HALF - y0 * size * res)
    has_alpha = ColorInterp.alpha in src.colorinterp
    palette = _palette(src)
    vrt = WarpedVRT(
        src, crs="EPSG:3857", transform=transform,
        width=(x1 - x0 + 1) * size, height=(y1 - y0 + 1) * size,
        resampling=Resampling.nearest if palette else Resampling.bilinear,
        add_alpha=not has_alpha,
        init_dest=0,  # outside the source is transparent anyway (alpha 0)
    )
    alpha_band = next(i + 1 for i, ci in enumerate(vrt.colorinterp) if ci == ColorInterp.alpha)
    lut = None
    if palette:
        cmap = src.colormap(1)
        lut = np.zeros((256, 4), np.uint8)
        for k, v in cmap.items():
            if 0 <= k < 256:
                lut[k] = v
    alpha_max = {"uint8": 255.0, "uint16": 65535.0}.get(vrt.dtypes[alpha_band - 1])
    layout = {"x0": x0, "y0": y0, "bands": _colour_bands(src), "alpha": alpha_band, "alpha_max": alpha_max, "lut": lut}
    _open[key] = (src, vrt, layout)
    return _open[key]


def _read_tile(spec: RasterSource, z: int, x: int, y: int, size: int) -> tuple[np.ndarray, np.ndarray] | None:
    """(rgb float32 (size,size,3) 0..255, alpha float32 (size,size) 0..1) from one source."""
    from rasterio.windows import Window

    _, vrt, lay = _vrt(spec, z, size)
    win = Window((x - lay["x0"]) * size, (y - lay["y0"]) * size, size, size)
    alpha = vrt.read(lay["alpha"], window=win).astype(np.float32)
    alpha = alpha / (lay["alpha_max"] or (65535.0 if alpha.max() > 255 else 255.0))
    if not alpha.any():
        return None
    data = vrt.read(lay["bands"], window=win)
    if lay["lut"] is not None:
        rgba = lay["lut"][data[0]]
        return rgba[..., :3].astype(np.float32), alpha * (rgba[..., 3] / 255.0)
    data = data.astype(np.float32)
    if spec.stretch:
        lo, hi = spec.stretch
        data = np.clip((data - lo) / (hi - lo) * 255.0, 0, 255)
    rgb = np.repeat(data, 3, axis=0) if data.shape[0] == 1 else data[:3]
    return np.moveaxis(rgb, 0, -1), alpha


def _render_batch(args) -> list[tuple[int, int, int, bytes]]:
    z, size, fmt, quality, specs, tiles = args
    out = []
    for x, y in tiles:
        premult = np.zeros((size, size, 3), np.float32)
        acc_a = np.zeros((size, size), np.float32)
        for spec in specs:
            x0, y0, x1, y1 = _tile_range(spec.bounds_3857, z, size)
            if not (x0 <= x <= x1 and y0 <= y <= y1):
                continue
            got = _read_tile(spec, z, x, y, size)
            if got is None:
                continue
            rgb, a = got
            # Porter-Duff "over", premultiplied: later sources on top.
            premult = rgb * a[..., None] + premult * (1 - a[..., None])
            acc_a = a + acc_a * (1 - a)
        data = encode_rgba(_unpremultiply(premult, acc_a), fmt, quality)
        if data:
            out.append((z, x, y, data))
    return out


def _unpremultiply(premult: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    rgba = np.zeros(alpha.shape + (4,), np.uint8)
    safe = np.where(alpha > 0, alpha, 1)[..., None]
    rgba[..., :3] = np.clip(np.round(premult / safe), 0, 255).astype(np.uint8)
    rgba[..., 3] = np.clip(np.round(alpha * 255), 0, 255).astype(np.uint8)
    return rgba


def render_rasters(specs: list[RasterSource], store: TileStore, *, z: int, size: int, fmt: str,
                   quality: int, workers: int, bbox: Bounds | None = None) -> int:
    store.clear_zoom(z)
    tiles = set()
    for s in specs:
        x0, y0, x1, y1 = _tile_range(s.bounds_3857, z, size)
        tiles.update((x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1))
    if bbox is not None:
        tiles &= set(tiles_in_bounds(bbox, z))
    ordered = sorted(tiles)
    log.info("imagery: rendering %d tiles at z%d from %d files", len(ordered), z, len(specs))
    batch = 64
    jobs = [(z, size, fmt, quality, specs, ordered[i:i + batch]) for i in range(0, len(ordered), batch)]
    count = 0
    with ProcessPoolExecutor(workers) as pool:
        for i, rows in enumerate(pool.map(_render_batch, jobs), 1):
            store.put_many(rows)
            count += len(rows)
            if i % 20 == 0 or i == len(jobs):
                log.info("  z%d: %d/%d batches, %d tiles", z, i, len(jobs), count)
    return count


# ── Overviews ───────────────────────────────────────────────────────────────


def _downsample(args) -> tuple[int, int, int, bytes] | None:
    z, x, y, size, fmt, quality, children = args
    full = np.zeros((size * 2, size * 2, 4), np.float32)
    for (dx, dy), data in children.items():
        if data:
            full[dy * size:(dy + 1) * size, dx * size:(dx + 1) * size] = decode_rgba(data, size)
    a = full[..., 3] / 255.0
    premult = (full[..., :3] * a[..., None]).reshape(size, 2, size, 2, 3).mean(axis=(1, 3))
    alpha = a.reshape(size, 2, size, 2).mean(axis=(1, 3))
    data = encode_rgba(_unpremultiply(premult, alpha), fmt, quality)
    return (z, x, y, data) if data else None


def build_overviews(store: TileStore, *, from_zoom: int, min_zoom: int, size: int, fmt: str,
                    quality: int, workers: int) -> None:
    with ProcessPoolExecutor(workers) as pool:
        for z in range(from_zoom - 1, min_zoom - 1, -1):
            store.clear_zoom(z)
            parents = sorted({(x // 2, y // 2) for x, y in store.keys(z + 1)})
            for start in range(0, len(parents), 2048):
                jobs = [
                    (z, px, py, size, fmt, quality, {
                        (dx, dy): store.get(z + 1, px * 2 + dx, py * 2 + dy)
                        for dx in (0, 1) for dy in (0, 1)
                    })
                    for px, py in parents[start:start + 2048]
                ]
                store.put_many([r for r in pool.map(_downsample, jobs, chunksize=16) if r])
            log.info("  z%d: %d tiles", z, len(store.keys(z)))


def build_imagery_from_rasters(paths: list[Path], store_path: Path, *, min_zoom: int, max_zoom: int | None,
                               size: int, fmt: str, quality: int, workers: int,
                               bbox: Bounds | None = None, scale: tuple[float, float] | None = None
                               ) -> tuple[TileStore, list[RasterSource], int]:
    specs = index_rasters(paths, scale)
    if max_zoom is None:
        max_zoom = max(zoom_for_resolution(s.res_3857, size) for s in specs)
        log.info("imagery: max zoom %d from the finest source resolution (%.2f m)", max_zoom, min(s.res_3857 for s in specs))
    store = TileStore(store_path, tile_type_for(fmt), Compression.NONE)
    store.set_meta("format", fmt)
    render_rasters(specs, store, z=max_zoom, size=size, fmt=fmt, quality=quality, workers=workers, bbox=bbox)
    log.info("imagery: overviews z%d..z%d", min_zoom, max_zoom - 1)
    build_overviews(store, from_zoom=max_zoom, min_zoom=min_zoom, size=size, fmt=fmt, quality=quality, workers=workers)
    return store, specs, max_zoom


# ── XYZ tile services ───────────────────────────────────────────────────────


def xyz_url(template: str, z: int, x: int, y: int) -> str:
    sub = "abc"[(x + y) % 3]
    return (template.replace("{z}", str(z)).replace("{x}", str(x))
            .replace("{-y}", str((1 << z) - 1 - y)).replace("{y}", str(y)).replace("{s}", sub))


def _fetch_one(url: str, retries: int, timeout: float) -> bytes:
    """Tile bytes, or b"" when the server has no tile there (404/204)."""
    delay = 1.0
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return b"" if resp.status == 204 else resp.read()
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return b""
            if e.code not in (408, 425, 429, 500, 502, 503, 504) or attempt == retries:
                raise
            after = e.headers.get("Retry-After") if e.headers else None
            wait = float(after) if after and after.isdigit() else delay
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == retries:
                raise
            wait = delay
        time.sleep(min(wait, 60))
        delay *= 2
    raise RuntimeError("unreachable")


def fetch_xyz(template: str, bbox: Bounds, zooms: list[int], cache: TileStore, *, concurrency: int,
              retries: int = 3, timeout: float = 30.0, max_tiles: int = 50_000) -> int:
    wanted = [(z, x, y) for z in zooms for x, y in tiles_in_bounds(bbox, z)]
    if len(wanted) > max_tiles:
        raise RuntimeError(
            f"{len(wanted)} tiles to fetch is over --xyz-max-tiles ({max_tiles}). Shrink the bbox or "
            "zoom range, or raise the limit if the tile provider allows bulk downloads.")
    have = {z: set(cache.keys(z)) for z in zooms}
    todo = [t for t in wanted if (t[1], t[2]) not in have[t[0]]]
    log.info("xyz: %d tiles wanted, %d already cached, fetching %d with %d connections",
             len(wanted), len(wanted) - len(todo), len(todo), concurrency)
    done = 0
    rows: list[tuple[int, int, int, bytes]] = []
    with ThreadPoolExecutor(max(1, concurrency)) as pool:
        futures = {pool.submit(_fetch_one, xyz_url(template, *t), retries, timeout): t for t in todo}
        for fut in as_completed(futures):
            z, x, y = futures[fut]
            rows.append((z, x, y, fut.result()))
            done += 1
            if len(rows) >= 200:
                cache.put_many(rows)
                rows = []
            if done % 500 == 0:
                log.info("  fetched %d/%d", done, len(todo))
    cache.put_many(rows)
    return len(todo)


def build_imagery_from_xyz(template: str, bbox: Bounds, store_path: Path, cache_dir: Path, *, min_zoom: int,
                           max_zoom: int, size: int, fmt: str, quality: int, workers: int, concurrency: int,
                           all_zooms: bool = False, max_tiles: int = 50_000) -> TileStore:
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(template.encode()).hexdigest()[:16]
    cache = TileStore(cache_dir / f"xyz-{key}.sqlite", TileType.UNKNOWN, Compression.NONE)
    cache.set_meta("template", template)
    zooms = list(range(min_zoom, max_zoom + 1)) if all_zooms else [max_zoom]
    fetch_xyz(template, bbox, zooms, cache, concurrency=concurrency, max_tiles=max_tiles)

    store = TileStore(store_path, tile_type_for(fmt), Compression.NONE)
    store.set_meta("format", fmt)
    want_magic = {"webp": b"RIFF", "jpg": b"\xff\xd8"}[fmt]
    for z in zooms:
        store.clear_zoom(z)
        inside = set(tiles_in_bounds(bbox, z))
        rows = []
        for x, y in cache.keys(z):
            if (x, y) not in inside:
                continue
            raw = cache.get(z, x, y)
            if not raw:
                continue
            try:
                img = Image.open(io.BytesIO(raw))
                same = img.size == (size, size) and raw.startswith(want_magic)
                rgba = decode_rgba(raw, size)
            except Exception as e:  # noqa: BLE001 — a broken tile should not stop the run
                log.warning("xyz: %d/%d/%d is not an image (%s); skipped", z, x, y, e)
                continue
            if not rgba[..., 3].any():
                continue
            # Keep the provider's bytes when they are already what we would write.
            data = raw if same else encode_rgba(rgba, fmt, quality)
            if data:
                rows.append((z, x, y, data))
        store.put_many(rows)
        log.info("  xyz z%d: %d tiles", z, len(rows))
    cache.close()
    if not all_zooms:
        build_overviews(store, from_zoom=max_zoom, min_zoom=min_zoom, size=size, fmt=fmt, quality=quality, workers=workers)
    return store
