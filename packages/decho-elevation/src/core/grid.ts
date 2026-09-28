/**
 * The cell grid the DEM chunks are cut on.
 *
 * IT IS THE SAME GRID AS THE BASEMAP'S FINEST LAYER
 * -------------------------------------------------
 * `[MAP] Chunked PMtiles` declares gridOrigin { lon: -180, lat: 85 } and cuts
 * its highest zoom into 2° cells. The Elevation dataset names its chunks with
 * the identical convention — one `c{col}_r{row}.tif` per basemap cell — and the
 * pathfinding chunks cut on the same grid declare bboxes that agree cell for
 * cell (`c000_r006` -> W -180 / E -178 / N 73 / S 71 under this arithmetic).
 *
 * That agreement is the reason this package is small: it does not need its own
 * spatial index, and a DEM cell, a graph cell and a tile cell are the same
 * cell. It is also a convention, and a convention that is never checked is one
 * that is eventually not true — so `gridMismatch` exists and is called against
 * any bounds a chunk declares for itself.
 *
 * Rows increase SOUTHWARD from the origin latitude; columns increase EAST.
 *
 * DUPLICATION, DELIBERATELY
 * -------------------------
 * `@acc/decho-pathfinding` has the same arithmetic in its own `core/grid.ts`.
 * Sixty lines are duplicated rather than published as a fifth package, because
 * neither add-on should have to depend on the other to know where a cell is,
 * and a `@acc/decho-cell-grid` package earns its keep at three consumers, not
 * two. When the third arrives, this file and its sibling are what moves.
 */

export interface CellGrid {
  /** Longitude of column 0's western edge. */
  originLon: number;
  /** Latitude of row 0's northern edge. */
  originLat: number;
  /** Cell size in degrees, both axes. */
  cellDeg: number;
}

export interface CellCoord {
  col: number;
  row: number;
}

export interface CellBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/** "c000_r006" — the chunk's name in the dataset, and the cache key. */
export function cellKey(col: number, row: number): string {
  return `c${pad3(col)}_r${pad3(row)}`;
}

export function parseCellKey(key: string): CellCoord | null {
  // Deliberately not a RegExp: one fewer ReDoS finding for the scanner to
  // argue about, and this runs per tile request.
  if (key.length < 9 || key[0] !== "c" || key[4] !== "_" || key[5] !== "r") {
    return null;
  }
  const col = Number(key.slice(1, 4));
  const row = Number(key.slice(6));
  if (!Number.isInteger(col) || !Number.isInteger(row)) {return null;}
  return { col, row };
}

export function cellFor(grid: CellGrid, lon: number, lat: number): CellCoord {
  return {
    col: Math.floor((lon - grid.originLon) / grid.cellDeg),
    row: Math.floor((grid.originLat - lat) / grid.cellDeg),
  };
}

export function cellBounds(
  grid: CellGrid,
  col: number,
  row: number,
): CellBounds {
  const west = grid.originLon + col * grid.cellDeg;
  const north = grid.originLat - row * grid.cellDeg;
  return {
    west,
    east: west + grid.cellDeg,
    north,
    south: north - grid.cellDeg,
  };
}

/**
 * Cells overlapping an extent, expanded by `ring` cells in every direction.
 *
 * Rows increase southward, so the NORTH edge gives the low row index. Getting
 * that backwards yields an empty range rather than an error — a silent nothing,
 * which is why it has a test.
 */
export function cellsInBounds(
  grid: CellGrid,
  bounds: CellBounds,
  ring = 0,
): CellCoord[] {
  const first = cellFor(grid, bounds.west, bounds.north);
  const last = cellFor(grid, bounds.east, bounds.south);

  const out: CellCoord[] = [];
  for (let col = first.col - ring; col <= last.col + ring; col++) {
    for (let row = first.row - ring; row <= last.row + ring; row++) {
      out.push({ col, row });
    }
  }
  return out;
}

/**
 * Cells a straight line from -> to passes through.
 *
 * A profile or a line of sight needs every cell under the line before it can
 * answer, and warming them concurrently turns a series of awaits inside the
 * sampling loop into cache hits. Sampled rather than walked: a quarter-cell
 * step cannot skip a cell, and this runs once per query.
 */
export function cellsAlongLine(
  grid: CellGrid,
  from: { lon: number; lat: number },
  to: { lon: number; lat: number },
): CellCoord[] {
  const steps = Math.max(
    1,
    Math.ceil(
      (Math.abs(to.lon - from.lon) + Math.abs(to.lat - from.lat)) /
        (grid.cellDeg / 4),
    ),
  );

  const seen = new Set<string>();
  const out: CellCoord[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { col, row } = cellFor(
      grid,
      from.lon + (to.lon - from.lon) * t,
      from.lat + (to.lat - from.lat) * t,
    );
    const key = cellKey(col, row);
    if (seen.has(key)) {continue;}
    seen.add(key);
    out.push({ col, row });
  }
  return out;
}

/**
 * Fail loudly if a chunk's own declared bounds disagree with where this grid
 * says the chunk is. See the header.
 */
export function gridMismatch(
  grid: CellGrid,
  cell: CellCoord,
  declared: CellBounds,
): string | null {
  const expected = cellBounds(grid, cell.col, cell.row);
  const tolerance = 1e-6;
  const off = (a: number, b: number) => Math.abs(a - b) > tolerance;
  if (
    off(expected.west, declared.west) ||
    off(expected.east, declared.east) ||
    off(expected.north, declared.north) ||
    off(expected.south, declared.south)
  ) {
    return (
      `grid mismatch: ${cellKey(cell.col, cell.row)} is at ` +
      `W${expected.west} S${expected.south} E${expected.east} N${expected.north} ` +
      `under gridOrigin(${grid.originLon}, ${grid.originLat})/cellDeg ${grid.cellDeg}, ` +
      `but the chunk declares W${declared.west} S${declared.south} ` +
      `E${declared.east} N${declared.north}`
    );
  }
  return null;
}

// ── Metres and degrees ──────────────────────────────────────────────────────

/** Mean Earth radius, metres. Spherical is ample for slope and sight lines. */
export const EARTH_RADIUS_M = 6371008.8;

export const METRES_PER_DEGREE_LAT = (Math.PI / 180) * EARTH_RADIUS_M;

export function metresPerDegreeLon(lat: number): number {
  return METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Great-circle distance in metres. */
export function distanceMetres(
  from: { lon: number; lat: number },
  to: { lon: number; lat: number },
): number {
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const dφ = φ2 - φ1;
  const dλ = ((to.lon - from.lon) * Math.PI) / 180;
  const a =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}
