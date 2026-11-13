"""
Tile stores: where tiles sit between being made and being chunked.

Three readers behind one interface, so the chunker does not care where a
pyramid came from:

  TileStore      this tool's own SQLite store (XYZ rows). Terrain and
                 hillshade are written here.
  MBTilesSource  an .mbtiles file (TMS rows, flipped on read). tippecanoe
                 writes contours here.
  PMTilesSource  a single .pmtiles file. `pmtiles extract` writes the basemap
                 region here.

Each yields (z, x, y, size) from `index()` without reading tile bodies, and a
body from `get(z, x, y)`.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Iterator, Protocol

from pmtiles.reader import MmapSource, Reader
from pmtiles.tile import Compression, TileType, deserialize_directory, deserialize_header, tileid_to_zxy


class TileSource(Protocol):
    tile_type: TileType
    compression: Compression

    def index(self) -> Iterator[tuple[int, int, int, int]]: ...
    def get(self, z: int, x: int, y: int) -> bytes | None: ...
    def metadata(self) -> dict: ...
    def close(self) -> None: ...


TILE_TYPES = {"png": TileType.PNG, "webp": TileType.WEBP, "jpg": TileType.JPEG, "mvt": TileType.MVT, "pbf": TileType.MVT}


class TileStore:
    """Writable XYZ store. One file per product, safe to resume into."""

    def __init__(self, path: Path, tile_type: TileType = TileType.PNG, compression: Compression = Compression.NONE):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.tile_type = tile_type
        self.compression = compression
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=NORMAL")
        self.db.execute("CREATE TABLE IF NOT EXISTS tiles (z INTEGER, x INTEGER, y INTEGER, data BLOB, PRIMARY KEY (z, x, y))")
        self.db.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
        self.db.commit()

    def put_many(self, rows: list[tuple[int, int, int, bytes]]) -> None:
        self.db.executemany("INSERT OR REPLACE INTO tiles (z, x, y, data) VALUES (?, ?, ?, ?)", rows)
        self.db.commit()

    def get(self, z: int, x: int, y: int) -> bytes | None:
        row = self.db.execute("SELECT data FROM tiles WHERE z=? AND x=? AND y=?", (z, x, y)).fetchone()
        return row[0] if row else None

    def keys(self, z: int) -> list[tuple[int, int]]:
        return [(x, y) for x, y in self.db.execute("SELECT x, y FROM tiles WHERE z=?", (z,))]

    def zooms(self) -> list[int]:
        return [z for (z,) in self.db.execute("SELECT DISTINCT z FROM tiles ORDER BY z")]

    def clear_zoom(self, z: int) -> None:
        self.db.execute("DELETE FROM tiles WHERE z=?", (z,))
        self.db.commit()

    def index(self) -> Iterator[tuple[int, int, int, int]]:
        yield from self.db.execute("SELECT z, x, y, length(data) FROM tiles")

    def set_meta(self, key: str, value) -> None:
        self.db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (key, json.dumps(value)))
        self.db.commit()

    def metadata(self) -> dict:
        return {k: json.loads(v) for k, v in self.db.execute("SELECT key, value FROM meta")}

    def close(self) -> None:
        self.db.close()


class MBTilesSource:
    def __init__(self, path: Path):
        self.db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        meta = dict(self.db.execute("SELECT name, value FROM metadata"))
        self._meta = meta
        fmt = meta.get("format", "pbf")
        self.tile_type = TILE_TYPES.get(fmt, TileType.UNKNOWN)
        # tippecanoe gzips vector tiles; raster MBTiles are stored as-is.
        self.compression = Compression.GZIP if self.tile_type == TileType.MVT else Compression.NONE

    def index(self):
        for z, x, tms_y, size in self.db.execute("SELECT zoom_level, tile_column, tile_row, length(tile_data) FROM tiles"):
            yield z, x, (1 << z) - 1 - tms_y, size

    def get(self, z, x, y):
        row = self.db.execute(
            "SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",
            (z, x, (1 << z) - 1 - y),
        ).fetchone()
        return row[0] if row else None

    def metadata(self):
        out: dict = {k: v for k, v in self._meta.items() if k != "json"}
        if "json" in self._meta:
            out.update(json.loads(self._meta["json"]))
        return out

    def close(self):
        self.db.close()


class PMTilesSource:
    def __init__(self, path: Path):
        self.f = open(path, "rb")
        self.get_bytes = MmapSource(self.f)  # maps the file itself
        self.reader = Reader(self.get_bytes)
        self.header = deserialize_header(self.get_bytes(0, 127))
        self.tile_type = self.header["tile_type"]
        self.compression = self.header["tile_compression"]

    def _walk(self, offset: int, length: int):
        for entry in deserialize_directory(self.get_bytes(offset, length)):
            if entry.run_length > 0:
                for i in range(entry.run_length):
                    z, x, y = tileid_to_zxy(entry.tile_id + i)
                    yield z, x, y, entry.length
            else:
                yield from self._walk(self.header["leaf_directory_offset"] + entry.offset, entry.length)

    def index(self):
        yield from self._walk(self.header["root_offset"], self.header["root_length"])

    def get(self, z, x, y):
        return self.reader.get(z, x, y)

    def metadata(self):
        return self.reader.metadata()

    def close(self):
        self.f.close()


def open_source(path: Path) -> TileSource:
    suffix = path.suffix.lower()
    if suffix == ".pmtiles":
        return PMTilesSource(path)
    if suffix == ".mbtiles":
        return MBTilesSource(path)
    raise ValueError(f"don't know how to read tiles from {path}")
