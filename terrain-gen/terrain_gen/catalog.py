"""
catalog: one small dataset listing every layer.

Apps are configured with the catalog's RID and nothing else; everything they
need to find a layer — which dataset, which manifest, what kind of thing it is,
what it needs — comes from here. It is also the list a startup check walks to
tell a user exactly which dataset is missing its Resource grant.

Dataset RIDs only exist once the folders are uploaded, so they are filled in
from a small JSON file (`--rids rids.json`, mapping layer id -> RID) and are
`null` until then.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from .manifest import SCHEMA, header, sha256_file, write_manifest

log = logging.getLogger(__name__)

#: Which layers a layer needs to be useful. Hillshade and contours are drawn
#: over a basemap; terrain is the base of everything that asks about heights.
DEPENDS = {
    "terrain": [],
    "hillshade": ["basemap"],
    "contours": ["basemap"],
    "dem-cells": [],
    "basemap": ["assets"],
    "assets": [],
}


def build_catalog(out_root: Path, rids: dict[str, str] | None = None) -> dict:
    rids = rids or {}
    layers = []
    for folder in sorted(p for p in out_root.iterdir() if p.is_dir() and p.name != "catalog"):
        mpath = folder / "manifest.json"
        if not mpath.exists():
            continue
        m = json.loads(mpath.read_text())
        if m.get("schema") != SCHEMA:
            log.warning("skipping %s: not a %s manifest", folder, SCHEMA)
            continue
        files = [p for p in folder.rglob("*") if p.is_file() and not p.name.endswith(".part")]
        layers.append(
            {
                "id": m["id"],
                "kind": m["kind"],
                "title": m["title"],
                "folder": folder.name,
                "datasetRid": rids.get(m["id"]),
                "manifestPath": "manifest.json",
                "manifestSha256": sha256_file(mpath),
                "bounds": m.get("bounds"),
                "encoding": m.get("encoding"),
                "attribution": m.get("attribution"),
                "dependsOn": DEPENDS.get(m["id"], []),
                "files": len(files),
                "bytes": sum(p.stat().st_size for p in files),
            }
        )
    catalog = {
        **header(
            id="catalog",
            kind="catalog",
            title="Offline World layer catalog",
            attribution="",
            bounds=None,
            source="terrain-gen",
        ),
        "layers": layers,
    }
    write_manifest(out_root / "catalog", catalog)
    # The catalog's own file is catalog.json; manifest.json is kept as an alias
    # so every folder in the output has the same entry point.
    (out_root / "catalog" / "catalog.json").write_text(json.dumps(catalog, indent=2) + "\n")
    missing = [layer["id"] for layer in layers if not layer["datasetRid"]]
    if missing:
        log.info("catalog: no RID yet for %s — upload them, then rerun with --rids", ", ".join(missing))
    return catalog
