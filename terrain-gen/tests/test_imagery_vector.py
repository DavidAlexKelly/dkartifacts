"""
imagery and vector products, end to end through the CLI. Offline: the GeoTIFF
is synthetic, the XYZ server is a local http.server thread.
"""

from __future__ import annotations

import gzip
import http.server
import io
import json
import math
import threading

import numpy as np
import pytest
import rasterio
from PIL import Image
from rasterio.enums import ColorInterp
from rasterio.transform import from_origin
from rasterio.warp import transform as warp_transform, transform_bounds

from terrain_gen.cli import main
from terrain_gen.grid import lat_to_y, lon_to_x
from terrain_gen.imagery import zoom_for_resolution
from terrain_gen.tiles import MBTilesSource, PMTilesSource
from test_terrain_gen import resolve

needs_tippecanoe = pytest.mark.skipif(
    __import__("shutil").which("tippecanoe") is None, reason="tippecanoe not installed"
)


class Archives:
    """Reads tiles the way the studio does: manifest → resolver → archive."""

    def __init__(self, out_dir):
        self.out = out_dir
        self.manifest = json.loads((out_dir / "manifest.json").read_text())
        self.open: dict[str, PMTilesSource] = {}

    def get(self, z, x, y):
        rel = resolve(self.manifest, z, x, y)
        if rel is None:
            return None
        src = self.open.setdefault(rel, PMTilesSource(self.out / rel))
        return src.get(z, x, y)

    def pixel(self, z, lon, lat, size=256):
        """RGBA at lon/lat, or None when no tile covers it."""
        gx, gy = lon_to_x(lon, z) * size, lat_to_y(lat, z) * size
        x, y = int(gx // size), int(gy // size)
        data = self.get(z, x, y)
        if data is None:
            return None
        img = np.asarray(Image.open(io.BytesIO(data)).convert("RGBA"))
        return tuple(int(v) for v in img[int(gy) % size, int(gx) % size])

    def close(self):
        for s in self.open.values():
            s.close()


def close(a, b, tol=12):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


# ── imagery from a GeoTIFF in UTM ───────────────────────────────────────────

UTM = "EPSG:32632"
WEST, NORTH, RES, N = 480_000.0, 6_660_000.0, 100.0, 200  # 20 km square near 9°E, 60°N


def write_utm_rgba(path):
    """West half red, east half blue, and the eastmost 20 pixels transparent."""
    data = np.zeros((4, N, N), np.uint8)
    data[0, :, : N // 2] = 255
    data[2, :, N // 2:] = 255
    data[3] = 255
    data[3, :, N - 20:] = 0
    with rasterio.open(path, "w", driver="GTiff", height=N, width=N, count=4, dtype="uint8",
                       crs=UTM, transform=from_origin(WEST, NORTH, RES, RES), photometric="RGB", alpha="YES") as ds:
        ds.write(data)
        ds.colorinterp = [ColorInterp.red, ColorInterp.green, ColorInterp.blue, ColorInterp.alpha]


def utm_to_lonlat(e, n):
    lon, lat = warp_transform(UTM, "EPSG:4326", [e], [n])
    return lon[0], lat[0]


def test_imagery_from_utm_geotiff(tmp_path):
    tif = tmp_path / "ortho.tif"
    write_utm_rgba(tif)
    out = tmp_path / "out"
    main(["imagery", "--files", str(tif), "--work", str(tmp_path / "work"), "--out", str(out),
          "--workers", "1", "--target-mb", "0.001", "--attribution", "test imagery"])

    m = json.loads((out / "imagery" / "manifest.json").read_text())
    assert m["schema"] == "decho-layer/1" and m["kind"] == "raster" and m["id"] == "imagery"
    assert m["encoding"]["tileType"] == "webp" and m["encoding"]["tileSize"] == 256
    assert m["attribution"] == "test imagery"
    # Max zoom from the source: 100 m at 60°N is ~200 mercator metres a pixel.
    max_zoom = m["provenance"]["parameters"]["maxZoom"]
    assert max_zoom == zoom_for_resolution(RES / math.cos(math.radians(60.06)), 256) == 10
    assert m["layers"][0]["minZoom"] == 0 and m["layers"][-1]["maxZoom"] == max_zoom
    assert any(l["type"] == "grid" for l in m["layers"])  # tiny target: cells were cut
    expected = transform_bounds(UTM, "EPSG:4326", WEST, NORTH - N * RES, WEST + N * RES, NORTH, densify_pts=21)
    assert np.allclose(m["bounds"], expected, atol=1e-9)

    # Every stored tile is where the resolver looks.
    from terrain_gen.tiles import TileStore

    store = TileStore(tmp_path / "work" / "imagery.tiles.sqlite")
    arch = Archives(out / "imagery")
    zooms = store.zooms()
    assert zooms == list(range(0, max_zoom + 1))
    for z, x, y, _ in store.index():
        assert arch.get(z, x, y) == store.get(z, x, y), f"{z}/{x}/{y}"

    # Colours land in the right place.
    red = utm_to_lonlat(WEST + 4_000, NORTH - 10_000)
    blue = utm_to_lonlat(WEST + 14_000, NORTH - 10_000)
    clear = utm_to_lonlat(WEST + N * RES - 1_000, NORTH - 10_000)
    outside = utm_to_lonlat(WEST - 5_000, NORTH - 10_000)
    assert close(arch.pixel(max_zoom, *red), (255, 0, 0, 255))
    assert close(arch.pixel(max_zoom, *blue), (0, 0, 255, 255))
    for z in (max_zoom, max_zoom - 1):
        px = arch.pixel(z, *clear)
        assert px is None or px[3] == 0
        px = arch.pixel(z, *outside)
        assert px is None or px[3] == 0
    # Overviews keep the colours (alpha-weighted, so no dark fringe).
    assert close(arch.pixel(max_zoom - 2, *red), (255, 0, 0, 255), tol=20)
    assert close(arch.pixel(max_zoom - 2, *blue)[:3], (0, 0, 255), tol=20)
    # At z0 the whole image is a fraction of one pixel: faint but present.
    z0 = arch.pixel(0, 8.85, 60.0)
    assert z0 is not None and 0 < z0[3] < 64
    arch.close()
    store.close()


# ── imagery from an XYZ service ─────────────────────────────────────────────


class TileHandler(http.server.BaseHTTPRequestHandler):
    requests: list = []
    agents: set = set()
    failed_once: set = set()

    def do_GET(self):  # noqa: N802
        TileHandler.requests.append(self.path)
        TileHandler.agents.add(self.headers.get("User-Agent"))
        z, x, y = (int(p) for p in self.path.strip("/").removesuffix(".png").split("/"))
        if (z, x, y) == (3, 4, 2) and (z, x, y) not in TileHandler.failed_once:
            TileHandler.failed_once.add((z, x, y))
            self.send_response(503)
            self.send_header("Retry-After", "0")
            self.end_headers()
            return
        if (z, x, y) == (3, 5, 3):
            self.send_error(404)
            return
        colour = (0, 255, 0, 255) if x % 2 == 0 else (255, 0, 255, 255)
        buf = io.BytesIO()
        Image.new("RGBA", (256, 256), colour).save(buf, "PNG")
        body = buf.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


@pytest.fixture
def tile_server(monkeypatch):
    for k in ("no_proxy", "NO_PROXY"):
        monkeypatch.setenv(k, "127.0.0.1,localhost")
    TileHandler.requests, TileHandler.agents, TileHandler.failed_once = [], set(), set()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), TileHandler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{srv.server_address[1]}/{{z}}/{{x}}/{{y}}.png"
    srv.shutdown()


@pytest.mark.filterwarnings("ignore:This process.*multi-threaded:DeprecationWarning")  # the test server thread
def test_imagery_from_xyz(tmp_path, tile_server):
    out = tmp_path / "out"
    argv = ["imagery", "--xyz", tile_server, "--bbox", "0,0,90,60", "--max-zoom", "3",
            "--work", str(tmp_path / "work"), "--out", str(out), "--workers", "1", "--xyz-concurrency", "2"]
    main(argv)
    # z3 over 0..90°E, 0..60°N: x 4-5, y 2-3. One 503 retried, one 404.
    assert sorted(TileHandler.requests) == sorted(["/3/4/2.png", "/3/4/2.png", "/3/4/3.png", "/3/5/2.png", "/3/5/3.png"])
    assert TileHandler.agents and all(a.startswith("terrain-gen") for a in TileHandler.agents)

    m = json.loads((out / "imagery" / "manifest.json").read_text())
    assert m["kind"] == "raster" and m["encoding"]["tileType"] == "webp"
    assert m["provenance"]["parameters"]["xyz"] == tile_server
    arch = Archives(out / "imagery")
    assert arch.get(3, 5, 3) is None  # the 404 tile
    assert close(arch.pixel(3, 10, 50), (0, 255, 0, 255))     # x=4: green
    assert close(arch.pixel(3, 60, 50), (255, 0, 255, 255))   # x=5: magenta
    # z2 tile (2,1) averages its children: left half green, right half magenta (top) / clear (bottom-right).
    assert close(arch.pixel(2, 10, 50), (0, 255, 0, 255), tol=20)
    assert close(arch.pixel(2, 60, 50), (255, 0, 255, 255), tol=20)
    assert arch.pixel(2, 60, 10)[3] < 10
    arch.close()

    # A rerun is served from the download cache.
    TileHandler.requests.clear()
    main(argv)
    assert TileHandler.requests == []


# ── vector ──────────────────────────────────────────────────────────────────


def mercator(lon, lat):
    r = 6378137.0
    return r * math.radians(lon), r * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def write_inputs(tmp_path):
    feats = [
        {"type": "Feature", "properties": {"name": "a", "pop": 10, "ok": True, "mix": 1},
         "geometry": {"type": "Point", "coordinates": list(mercator(10.0, 60.0))}},
        {"type": "Feature", "properties": {"name": "road", "pop": 2.5, "mix": "x"},
         "geometry": {"type": "LineString", "coordinates": [list(mercator(10.0, 60.0)), list(mercator(11.0, 61.0))]}},
        {"type": "Feature", "properties": {"name": "lake", "nested": {"k": 1}},
         "geometry": {"type": "MultiPolygon", "coordinates": [[[list(mercator(*p)) for p in
                      [(10.2, 60.2), (10.4, 60.2), (10.4, 60.4), (10.2, 60.2)]]]]}},
        {"type": "Feature", "properties": {"name": "no geometry"}, "geometry": None},
    ]
    gj = tmp_path / "things.geojson"
    gj.write_text(json.dumps({"type": "FeatureCollection",
                              "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::3857"}},
                              "features": feats}))
    csv = tmp_path / "places.csv"
    csv.write_text("id;Latitude;Longitude;name;height\n1;59.5;9.5;x;12\n2;61.5;11.5;y;\n3;60.0;10.5;z;3.5\n")
    return gj, csv


@needs_tippecanoe
def test_vector_from_geojson_and_csv(tmp_path):
    gj, csv = write_inputs(tmp_path)
    out = tmp_path / "out"
    main(["vector", str(gj), str(csv), "--layer-name", "things", "--max-zoom", "10",
          "--work", str(tmp_path / "work"), "--out", str(out), "--target-mb", "0.002"])

    m = json.loads((out / "things" / "manifest.json").read_text())
    assert m["kind"] == "vector-tiles" and m["id"] == "things"
    enc = m["encoding"]
    assert enc["tileType"] == "mvt" and enc["compression"] == "gzip"
    assert enc["sourceLayer"] == "things"
    assert enc["geometryTypes"] == ["Point", "LineString", "Polygon"]
    assert enc["featureCount"] == 6  # 3 GeoJSON with geometry + 3 CSV rows
    assert enc["fields"] == {"height": "number", "id": "number", "mix": "mixed", "name": "string",
                             "nested": "string", "ok": "boolean", "pop": "number"}
    w, s, e, n = m["bounds"]
    assert math.isclose(w, 9.5, abs_tol=1e-6) and math.isclose(s, 59.5, abs_tol=1e-6)
    assert math.isclose(e, 11.5, abs_tol=1e-6) and math.isclose(n, 61.5, abs_tol=1e-6)

    src = MBTilesSource(tmp_path / "work" / "things.mbtiles")
    arch = Archives(out / "things")
    zooms = set()
    for z, x, y, _ in src.index():
        data = arch.get(z, x, y)
        assert data is not None and data == src.get(z, x, y), f"{z}/{x}/{y}"
        assert b"things" in gzip.decompress(data)
        zooms.add(z)
    assert min(zooms) == 0 and max(zooms) == 10
    assert m["layers"][0]["minZoom"] == 0 and m["layers"][-1]["maxZoom"] == 10
    assert any(l["type"] == "grid" for l in m["layers"])
    arch.close()
    src.close()


@needs_tippecanoe
def test_vector_from_geopackage_with_pyogrio(tmp_path):
    pyogrio = pytest.importorskip("pyogrio")
    from pyogrio.raw import write
    from shapely import to_wkb
    from shapely.geometry import Point

    # Two points in UTM 32N, as a GeoPackage would carry them.
    e, n = warp_transform("EPSG:4326", UTM, [9.0, 9.2], [60.0, 60.1])
    geoms = np.array([to_wkb(Point(a, b)) for a, b in zip(e, n)], dtype=object)
    gpkg = tmp_path / "sites.gpkg"
    write(gpkg, geoms, [np.array(["p", "q"], dtype=object), np.array([1.5, 2.0])], ["label", "value"],
          crs=UTM, geometry_type="Point", driver="GPKG")
    assert pyogrio.read_info(gpkg)["features"] == 2

    out = tmp_path / "out"
    main(["vector", str(gpkg), "--max-zoom", "6", "--work", str(tmp_path / "work"), "--out", str(out)])
    m = json.loads((out / "sites" / "manifest.json").read_text())
    assert m["encoding"]["sourceLayer"] == "sites"
    assert m["encoding"]["geometryTypes"] == ["Point"]
    assert m["encoding"]["fields"] == {"label": "string", "value": "number"}
    assert m["encoding"]["featureCount"] == 2
    w, s, e_, n_ = m["bounds"]
    assert math.isclose(w, 9.0, abs_tol=1e-6) and math.isclose(n_, 60.1, abs_tol=1e-6)


def test_all_refuses_imagery_and_vector_without_inputs(tmp_path):
    with pytest.raises(SystemExit, match="--vector-files"):
        main(["all", "--products", "vector", "--out", str(tmp_path)])
    with pytest.raises(SystemExit, match="--imagery-dir"):
        main(["all", "--products", "imagery", "--out", str(tmp_path)])
