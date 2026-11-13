"""
Downloads. Everything comes from public, unauthenticated sources:

  DEM       Copernicus DEM GLO-90 (or GLO-30) on the AWS Open Data registry,
            one Cloud-Optimised GeoTIFF per 1-degree tile.
            https://registry.opendata.aws/copernicus-dem/
  basemap   A Protomaps daily planet build, read with `pmtiles extract` so only
            the region and zooms asked for are transferred.
            https://docs.protomaps.com/basemaps/downloads
  assets    The Protomaps basemaps-assets bundle (glyphs and sprites).
            https://github.com/protomaps/basemaps-assets

Downloads are resumable: a finished file is never fetched twice, and a partial
one is written to `.part` and only renamed into place once complete.
"""

from __future__ import annotations

import logging
import math
import shutil
import subprocess
import time
import urllib.error
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from .grid import Bounds

log = logging.getLogger(__name__)

USER_AGENT = "terrain-gen/0.1"

DEM_SOURCES = {
    "glo90": {
        "bucket": "https://copernicus-dem-90m.s3.amazonaws.com",
        "prefix": "Copernicus_DSM_COG_30",
        "arcsec": 3.0,
    },
    "glo30": {
        "bucket": "https://copernicus-dem-30m.s3.amazonaws.com",
        "prefix": "Copernicus_DSM_COG_10",
        "arcsec": 1.0,
    },
}

DEM_ATTRIBUTION = (
    "Copernicus DEM © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 "
    "provided under COPERNICUS by the European Union and ESA; all rights reserved"
)

ASSETS_ZIP = "https://github.com/protomaps/basemaps-assets/archive/refs/heads/main.zip"


def fetch(url: str, dest: Path, *, retries: int = 4, timeout: float = 120) -> bool:
    """Download url to dest. False on 404 (absence is normal), raises on anything else."""
    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp, open(part, "wb") as out:
                shutil.copyfileobj(resp, out, 1 << 20)
            part.replace(dest)
            return True
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return False
            if attempt == retries:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == retries:
                raise
        wait = 2 ** (attempt + 1)
        log.warning("retrying %s in %ss", url, wait)
        time.sleep(wait)
    return False


# ── Copernicus DEM ──────────────────────────────────────────────────────────


def _tile_name(prefix: str, lat: int, lon: int) -> str:
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"{prefix}_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM"


def dem_tile_list(dem: str, cache: Path) -> set[str]:
    """The bucket's own list of tiles that exist — most of the planet is ocean and has none."""
    path = cache / f"{dem}-tileList.txt"
    if not fetch(f"{DEM_SOURCES[dem]['bucket']}/tileList.txt", path):
        raise RuntimeError(f"could not fetch the {dem} tile list")
    return {line.strip() for line in path.read_text().splitlines() if line.strip()}


def download_dem(bbox: Bounds, dem: str, dest: Path, *, workers: int = 8) -> list[Path]:
    """
    Every Copernicus tile overlapping bbox. Tiles are named by their south-west
    corner; one extra ring is requested so a naming surprise can only cost a few
    extra downloads, never a missing edge. Geometry is always read from the
    files themselves, never from the names.
    """
    src = DEM_SOURCES[dem]
    dest.mkdir(parents=True, exist_ok=True)
    existing = dem_tile_list(dem, dest)

    wanted = []
    for lat in range(math.floor(bbox.south) - 1, math.ceil(bbox.north) + 1):
        for lon in range(math.floor(bbox.west) - 1, math.ceil(bbox.east) + 1):
            if not (-90 <= lat < 90 and -180 <= lon < 180):
                continue
            name = _tile_name(src["prefix"], lat, lon)
            if name in existing:
                wanted.append(name)

    log.info("%d %s tiles to fetch for %s", len(wanted), dem, bbox.as_list())
    paths: list[Path] = []
    with ThreadPoolExecutor(workers) as pool:
        futures = {
            pool.submit(fetch, f"{src['bucket']}/{name}/{name}.tif", dest / f"{name}.tif"): name
            for name in wanted
        }
        for i, fut in enumerate(as_completed(futures), 1):
            name = futures[fut]
            if fut.result():
                paths.append(dest / f"{name}.tif")
            if i % 25 == 0 or i == len(futures):
                log.info("  %d/%d", i, len(futures))
    return sorted(paths)


# ── Protomaps basemap ───────────────────────────────────────────────────────


def extract_basemap(source: str, bbox: Bounds, max_zoom: int, dest: Path) -> Path:
    """
    Cut a region out of a Protomaps build with go-pmtiles. It reads the remote
    archive with HTTP range requests, so a country costs megabytes, not the
    planet's ~120 GB.
    """
    exe = shutil.which("pmtiles")
    if not exe:
        raise RuntimeError(
            "the `pmtiles` command is not on PATH. Install go-pmtiles from "
            "https://github.com/protomaps/go-pmtiles/releases"
        )
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        exe, "extract", source, str(dest),
        f"--bbox={bbox.west},{bbox.south},{bbox.east},{bbox.north}",
        f"--maxzoom={max_zoom}",
    ]
    log.info("running %s", " ".join(cmd))
    subprocess.run(cmd, check=True)
    return dest


# ── Glyphs and sprites ──────────────────────────────────────────────────────


def download_assets(work: Path, out: Path) -> Path:
    """
    Lay the bundle out the way decho-basemap's AssetStore reads it:
        fonts/{fontstack}/{range}.pbf
        sprites/{flavor}.json|.png|@2x.json|@2x.png
    The upstream repo versions its sprites (sprites/v4/light.json); the newest
    version is flattened to sprites/, which is the "sprites/light" path the
    apps already pass.
    """
    zpath = work / "basemaps-assets.zip"
    if not fetch(ASSETS_ZIP, zpath):
        raise RuntimeError("could not download the basemaps-assets bundle")
    out.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zpath) as zf:
        names = zf.namelist()
        root = names[0].split("/")[0]
        sprite_versions = sorted(
            {n.split("/")[2] for n in names if n.startswith(f"{root}/sprites/") and n.count("/") >= 3 and n.split("/")[2]},
            key=lambda v: int(v.lstrip("v")) if v.lstrip("v").isdigit() else -1,
        )
        newest = sprite_versions[-1] if sprite_versions else None
        for name in names:
            if name.endswith("/"):
                continue
            rel = name[len(root) + 1:]
            if rel.startswith("fonts/"):
                target = out / rel
            elif newest and rel.startswith(f"sprites/{newest}/"):
                target = out / "sprites" / rel[len(f"sprites/{newest}/"):]
            else:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(name) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)
    log.info("assets written to %s (sprites from %s)", out, newest)
    return out
