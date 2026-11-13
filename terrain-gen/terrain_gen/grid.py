"""
The cell grid and web-mercator tile arithmetic, shared by every step.

THE ANALYSIS GRID
-----------------
2-degree cells, column 0's western edge at -180, row 0's northern edge at 85.
It is the grid the existing DEM chunks, hillshade, contours and pathfinding
graphs are cut on (`decho-elevation/src/core/grid.ts`,
`decho-pathfinding/src/core/grid.ts`), so cells written here drop into those
datasets unchanged:

    col = floor((lon - originLon) / cellDeg)
    row = floor((originLat - lat) / cellDeg)
    key = "c{col:03}_r{row:03}"

DISPLAY PYRAMIDS
----------------
Tiled products are assigned to archives by the NORTH-WEST corner of each tile,
because that is what `manifestResolver.pathForTile` in decho-basemap does. The
formulas below are written in the same order as that TypeScript so a tile lands
in the same archive in both. Only latitude 0 ever falls exactly on a boundary,
and both languages compute it as exactly 0.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterator

ORIGIN_LON = -180.0
ORIGIN_LAT = 85.0
CELL_DEG = 2.0

#: Web mercator's latitude limit. Nothing north or south of it can be drawn.
MERCATOR_MAX_LAT = 85.0511287798066
EARTH_CIRCUMFERENCE_M = 40075016.68557849


@dataclass(frozen=True)
class Bounds:
    west: float
    south: float
    east: float
    north: float

    @staticmethod
    def parse(text: str) -> "Bounds":
        """'west,south,east,north' in degrees."""
        parts = [float(p) for p in text.split(",")]
        if len(parts) != 4:
            raise ValueError(f"bbox needs four numbers, got {text!r}")
        w, s, e, n = parts
        if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
            raise ValueError(f"bbox {text!r} is not west,south,east,north")
        return Bounds(w, s, e, n)

    def intersects(self, other: "Bounds") -> bool:
        return (
            self.west < other.east
            and other.west < self.east
            and self.south < other.north
            and other.south < self.north
        )

    def expand(self, d: float) -> "Bounds":
        return Bounds(self.west - d, self.south - d, self.east + d, self.north + d)

    def as_list(self) -> list[float]:
        return [self.west, self.south, self.east, self.north]

    def as_dict(self) -> dict:
        return {"west": self.west, "south": self.south, "east": self.east, "north": self.north}


WORLD = Bounds(-180.0, -85.0, 180.0, 85.0)


def pad3(n: int) -> str:
    """JavaScript's String(n).padStart(3, "0"), including its quirk for -1 ("0-1")."""
    return str(n).rjust(3, "0")


def cell_key(col: int, row: int) -> str:
    return f"c{pad3(col)}_r{pad3(row)}"


def cell_for(lon: float, lat: float, cell_deg: float = CELL_DEG) -> tuple[int, int]:
    return (
        math.floor((lon - ORIGIN_LON) / cell_deg),
        math.floor((ORIGIN_LAT - lat) / cell_deg),
    )


def cell_bounds(col: int, row: int, cell_deg: float = CELL_DEG) -> Bounds:
    west = ORIGIN_LON + col * cell_deg
    north = ORIGIN_LAT - row * cell_deg
    return Bounds(west, north - cell_deg, west + cell_deg, north)


def cells_in_bounds(b: Bounds, cell_deg: float = CELL_DEG) -> Iterator[tuple[int, int]]:
    """Every analysis cell overlapping `b`, clipped to the grid's own extent."""
    south = max(b.south, ORIGIN_LAT - 170.0)
    north = min(b.north, ORIGIN_LAT)
    if south >= north:
        return
    col0 = math.floor((b.west - ORIGIN_LON) / cell_deg)
    col1 = math.ceil((b.east - ORIGIN_LON) / cell_deg) - 1
    row0 = math.floor((ORIGIN_LAT - north) / cell_deg)
    row1 = math.ceil((ORIGIN_LAT - south) / cell_deg) - 1
    for row in range(row0, row1 + 1):
        for col in range(col0, col1 + 1):
            yield col, row


# ── Web mercator tiles ──────────────────────────────────────────────────────


def tile_north_west(z: int, x: int, y: int) -> tuple[float, float]:
    """(lon, lat) of a tile's north-west corner. Same operation order as stores.ts."""
    n = 2**z
    lon = (x / n) * 360 - 180
    lat = (math.atan(math.sinh(math.pi * (1 - (2 * y) / n))) * 180) / math.pi
    return lon, lat


def tile_bounds(z: int, x: int, y: int) -> Bounds:
    w, n = tile_north_west(z, x, y)
    e, s = tile_north_west(z, x + 1, y + 1)
    return Bounds(w, s, e, n)


def lon_to_x(lon: float, z: int) -> float:
    return (lon + 180.0) / 360.0 * 2**z


def lat_to_y(lat: float, z: int) -> float:
    lat = max(-MERCATOR_MAX_LAT, min(MERCATOR_MAX_LAT, lat))
    r = math.radians(lat)
    return (1.0 - math.asinh(math.tan(r)) / math.pi) / 2.0 * 2**z


def tiles_in_bounds(b: Bounds, z: int) -> Iterator[tuple[int, int]]:
    n = 2**z
    x0 = max(0, math.floor(lon_to_x(b.west, z)))
    x1 = min(n - 1, math.ceil(lon_to_x(b.east, z)) - 1)
    y0 = max(0, math.floor(lat_to_y(b.north, z)))
    y1 = min(n - 1, math.ceil(lat_to_y(b.south, z)) - 1)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            yield x, y


def tile_center(z: int, x: int, y: int) -> tuple[float, float]:
    b = tile_bounds(z, x, y)
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 0.5) / 2**z))))
    return (b.west + b.east) / 2, lat


def mercator_pixel_m(z: int, tile_size: int) -> float:
    """Size of one pixel in mercator metres (ground metres at the equator)."""
    return EARTH_CIRCUMFERENCE_M / (tile_size * 2**z)


def archive_cell(z: int, x: int, y: int, cell_deg: float) -> tuple[int, int]:
    """The archive cell a tile belongs to, by its NW corner — as manifestResolver does."""
    lon, lat = tile_north_west(z, x, y)
    return (
        math.floor((lon - ORIGIN_LON) / cell_deg),
        math.floor((ORIGIN_LAT - lat) / cell_deg),
    )
