"""
The common manifest header every output dataset carries.

Each product folder in the output becomes one Foundry dataset, and each has a
`manifest.json` at its root. The file is a SUPERSET of what the packages read
today, so nothing has to change on the TypeScript side to consume it:

  pyramid products (terrain, hillshade, contours, basemap)
      `gridOrigin` + `layers[]` — the GlobeManifest shape that
      decho-basemap's manifestResolver reads.

  dem-cells
      `gridOrigin`, `cellDeg`, `pathTemplate`, `cells[]`, `dem` — the
      DemManifest shape that decho-elevation's store reads.

On top of that, every manifest carries the same header (`schema`, `id`, `kind`,
`title`, `attribution`, `bounds`, `encoding`, `provenance`) and every file it
lists carries a `sha256`. The hash is what lets the browser cache key a file by
its content instead of by the dataset's latest transaction — see PLAN.md.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from . import __version__

SCHEMA = "decho-layer/1"


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            block = f.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def header(
    *,
    id: str,
    kind: str,
    title: str,
    attribution: str,
    bounds: list[float] | None,
    encoding: dict[str, Any] | None = None,
    source: str,
    parameters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "id": id,
        "kind": kind,
        "title": title,
        "attribution": attribution,
        "bounds": bounds,
        "encoding": encoding or {},
        "provenance": {
            "source": source,
            "generator": f"terrain-gen {__version__}",
            "generatedAt": _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat(),
            "parameters": parameters or {},
        },
    }


def write_manifest(folder: Path, manifest: dict[str, Any]) -> Path:
    """Write atomically, so an interrupted run never leaves half a manifest."""
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "manifest.json"
    tmp = path.with_suffix(".json.part")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)
    return path


def read_manifest(folder: Path) -> dict[str, Any]:
    with open(folder / "manifest.json", encoding="utf-8") as f:
        return json.load(f)
