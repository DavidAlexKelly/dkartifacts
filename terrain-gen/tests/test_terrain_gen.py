"""
Run with:  python -m pytest tests

Everything here is offline: the DEM is synthetic, written by the test itself.
"""

from __future__ import annotations

import io
import json
import math
import random

import numpy as np
import pytest
import rasterio
from PIL import Image
from pmtiles.tile import Compression, TileType
from rasterio.transform import from_origin

from terrain_gen.chunk import chunk, plan_bands, build_index
from terrain_gen.dem import build_dem_cells, dem_sources_from_cells
from terrain_gen.grid import (
    Bounds,
    cell_bounds,
    cell_for,
    cell_key,
    pad3,
    tile_north_west,
    tiles_in_bounds,
)
from terrain_gen.hillshade import shade, to_rgba
from terrain_gen.terrain import build_terrain, decode_terrarium, encode_terrarium, quantize
from terrain_gen.tiles import PMTilesSource, TileStore


# ── Grid: must agree with decho-elevation / decho-pathfinding grid.ts ───────


def test_cell_key_and_bounds_match_the_typescript_grid():
    # grid.ts: "c000_r006 -> W -180 / E -178 / N 73 / S 71"
    assert cell_key(0, 6) == "c000_r006"
    assert cell_bounds(0, 6) == Bounds(-180, 71, -178, 73)
    assert cell_for(-179.5, 72) == (0, 6)
    assert cell_for(2.35, 48.85) == (91, 18)


def test_pad3_reproduces_padStart_for_negative_rows():
    assert pad3(5) == "005"
    assert pad3(-1) == "0-1"  # String(-1).padStart(3, "0")


# ── Terrarium: byte-for-byte what terrarium.ts writes ───────────────────────


def ts_write_terrarium(height: float) -> tuple[int, int, int]:
    value = min(65535.99, max(0, (height if math.isfinite(height) else 0) + 32768))
    whole = math.floor(value)
    return (whole >> 8) & 0xFF, whole & 0xFF, min(255, math.floor((value - whole) * 256))


@pytest.mark.parametrize("h", [0.0, -0.5, 1234.75, 8848.0, -430.25, 40000.0, -40000.0, float("nan")])
def test_terrarium_matches_typescript(h):
    rgb = encode_terrarium(np.array([[h]], np.float64))[0, 0]
    assert tuple(int(c) for c in rgb) == ts_write_terrarium(h)


def test_quantised_terrarium_round_trips_exactly():
    h = quantize(np.random.default_rng(1).uniform(-400, 8800, (64, 64)), 0.25)
    assert np.array_equal(decode_terrarium(encode_terrarium(h)), h.astype(np.float32))


# ── Hillshade ───────────────────────────────────────────────────────────────


def test_flat_ground_is_fully_transparent():
    s = shade(np.full((258, 258), 500.0, np.float32), z=10, y=300, size=256)
    assert not to_rgba(s)[..., 3].any()


def test_a_slope_facing_the_sun_is_lighter_than_one_facing_away():
    # Heights rise to the east: the slope faces west, toward a 315° (north-west) sun.
    ramp = np.tile(np.arange(258, dtype=np.float32) * 50, (258, 1))
    toward = shade(ramp, z=10, y=300, size=256).mean()
    away = shade(ramp[:, ::-1].copy(), z=10, y=300, size=256).mean()
    assert toward > away


# ── Chunking: every tile must be found where manifestResolver looks ─────────


def resolve(manifest: dict, z: int, x: int, y: int) -> str | None:
    """A port of decho-basemap's manifestResolver.pathForTile."""
    layer = next((l for l in manifest["layers"] if l["minZoom"] <= z <= l["maxZoom"]), None)
    if layer is None:
        return None
    if layer["type"] == "single":
        return layer["path"]
    lon, lat = tile_north_west(z, x, y)
    col = math.floor((lon - manifest["gridOrigin"]["lon"]) / layer["cellDeg"])
    row = math.floor((manifest["gridOrigin"]["lat"] - lat) / layer["cellDeg"])
    if not any(c["col"] == col and c["row"] == row for c in layer["cells"]):
        return None
    return layer["pathTemplate"].replace("{col}", pad3(col)).replace("{row}", pad3(row))


def synthetic_store(path, region: Bounds, max_zoom: int, seed: int = 7) -> TileStore:
    rnd = random.Random(seed)
    store = TileStore(path, TileType.PNG, Compression.NONE)
    for z in range(0, max_zoom + 1):
        rows = [(z, x, y, rnd.randbytes(rnd.randint(2_000, 30_000))) for x, y in tiles_in_bounds(region, z)]
        store.put_many(rows)
    return store


def test_every_tile_lands_in_the_archive_the_resolver_picks(tmp_path):
    region = Bounds(5.0, 58.0, 13.0, 66.0)
    store = synthetic_store(tmp_path / "s.sqlite", region, max_zoom=10)
    out = tmp_path / "out"
    manifest = chunk(store, out, target_bytes=1_000_000, metadata={"name": "t"})

    assert manifest["layers"][0]["type"] == "single"
    assert any(l["type"] == "grid" for l in manifest["layers"])
    opened: dict[str, PMTilesSource] = {}
    checked = 0
    for z, x, y, _ in store.index():
        rel = resolve(manifest, z, x, y)
        assert rel is not None, f"no archive for {z}/{x}/{y}"
        src = opened.setdefault(rel, PMTilesSource(out / rel))
        assert src.get(z, x, y) == store.get(z, x, y), f"{z}/{x}/{y} missing from {rel}"
        checked += 1
    assert checked > 1000

    # Sizes and hashes are declared for every archive.
    for layer in manifest["layers"]:
        entries = [layer] if layer["type"] == "single" else layer["cells"]
        for e in entries:
            assert e["bytes"] > 0 and len(e["sha256"]) == 64


def test_bands_respect_the_target(tmp_path):
    region = Bounds(5.0, 58.0, 13.0, 66.0)
    store = synthetic_store(tmp_path / "s.sqlite", region, max_zoom=10)
    target = 1_000_000
    for band in plan_bands(build_index(store), target):
        assert not band.over_budget, band


# ── End to end on a synthetic DEM ───────────────────────────────────────────


def write_source_tile(path, west: int, south: int, res: float = 1 / 120):
    """A 1° GeoTIFF shaped like Copernicus: a hill, sea in one corner."""
    n = round(1 / res)
    lon = west + (np.arange(n) + 0.5) * res
    lat = south + 1 - (np.arange(n) + 0.5) * res
    LON, LAT = np.meshgrid(lon, lat)
    h = 1500 * np.exp(-((LON - (west + 0.5)) ** 2 + (LAT - (south + 0.5)) ** 2) / 0.05)
    h[(LON - west < 0.2) & (LAT - south < 0.2)] = 0.0
    with rasterio.open(
        path, "w", driver="GTiff", height=n, width=n, count=1, dtype="float32",
        crs="EPSG:4326", transform=from_origin(west, south + 1, res, res),
    ) as ds:
        ds.write(h.astype(np.float32), 1)


def test_dem_cells_then_terrain(tmp_path):
    src = tmp_path / "src"
    src.mkdir()
    for lon in (8, 9):
        for lat in (61, 62):
            write_source_tile(src / f"t_{lat}_{lon}.tif", lon, lat)

    out = tmp_path / "out"
    manifest = build_dem_cells(
        sorted(src.glob("*.tif")), Bounds(8, 61, 10, 63), out / "dem-cells",
        dem_name="synthetic", attribution="test", workers=1, work_dir=tmp_path / "work",
    )
    assert [cell_key(c["col"], c["row"]) for c in manifest["cells"]] == ["c094_r011"]
    cell = manifest["cells"][0]
    assert 1400 < cell["max"] <= 1500 and cell["min"] == 0.0
    assert json.loads((out / "dem-cells" / "manifest.json").read_text())["pathTemplate"] == "{cell}.tif"

    # The cell is a classic (not Big) TIFF with Deflate — what geotiff.ts decodes.
    with open(out / "dem-cells" / "c094_r011.tif", "rb") as f:
        assert f.read(4) == b"II*\x00"
    with rasterio.open(out / "dem-cells" / "c094_r011.tif") as ds:
        assert ds.profile["compress"] == "deflate" and ds.nodata == -32768

    sources = dem_sources_from_cells(out / "dem-cells")
    store = build_terrain(
        sources, tmp_path / "work" / "terrain.sqlite",
        min_zoom=0, max_zoom=8, size=256, fmt="webp", precision=0.25, workers=1,
    )
    assert store.zooms() == list(range(0, 9))
    peak = max(
        decode_terrarium(np.asarray(Image.open(io.BytesIO(store.get(8, x, y))).convert("RGB"))).max()
        for x, y in store.keys(8)
    )
    assert 1300 < peak <= 1500
