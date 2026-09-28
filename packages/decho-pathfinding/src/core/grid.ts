/**
 * The cell grid the pathfinding chunks are cut on.
 *
 * IT IS THE SAME GRID AS THE BASEMAP'S z12 LAYER
 * ----------------------------------------------
 * `[MAP] Chunked PMtiles` declares gridOrigin { lon: -180, lat: 85 } and cuts
 * its highest zoom into 2° cells; the pathfinding dataset names its chunks with
 * the identical convention, and the bboxes in their meta.json agree cell for
 * cell (c000_r006 -> W -180 / E -178 / N 73 / S 71 under this arithmetic).
 *
 * That is not a coincidence to be relied on quietly. `assertGridMatchesMeta`
 * below checks it against every cell's own declared bbox on load, so if either
 * cut is ever regenerated on a different origin the failure is a loud,
 * specific error rather than routes that are silently 2° adrift.
 *
 * Rows increase SOUTHWARD from the origin latitude, columns increase EAST.
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

/** Which side of a cell a node sits against. Order matters: see OPPOSITE. */
export const SIDE_WEST = 0;
export const SIDE_EAST = 1;
export const SIDE_SOUTH = 2;
export const SIDE_NORTH = 3;

export type Side =
  | typeof SIDE_WEST
  | typeof SIDE_EAST
  | typeof SIDE_SOUTH
  | typeof SIDE_NORTH;

export const SIDES: readonly Side[] = [
  SIDE_WEST,
  SIDE_EAST,
  SIDE_SOUTH,
  SIDE_NORTH,
];

/** The side of the neighbour that faces this side. */
export const OPPOSITE: Record<Side, Side> = {
  [SIDE_WEST]: SIDE_EAST,
  [SIDE_EAST]: SIDE_WEST,
  [SIDE_SOUTH]: SIDE_NORTH,
  [SIDE_NORTH]: SIDE_SOUTH,
};

/** The cell adjacent across `side`. */
export function neighbourCell(cell: CellCoord, side: Side): CellCoord {
  switch (side) {
    case SIDE_WEST:
      return { col: cell.col - 1, row: cell.row };
    case SIDE_EAST:
      return { col: cell.col + 1, row: cell.row };
    case SIDE_SOUTH:
      return { col: cell.col, row: cell.row + 1 };
    case SIDE_NORTH:
      return { col: cell.col, row: cell.row - 1 };
  }
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/** "c000_r006" — the directory name in the dataset, and the cache key. */
export function cellKey(col: number, row: number): string {
  return `c${pad3(col)}_r${pad3(row)}`;
}

export function parseCellKey(key: string): CellCoord | null {
  // Deliberately not a RegExp on a hot-ish path, and one fewer ReDoS finding
  // for the scanner to argue about.
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
 * Cells a straight line from -> to passes through, dilated by `pad` cells.
 *
 * This is the corridor prefetch: the search will almost certainly need these,
 * and warming them while the user is still letting go of the mouse turns the
 * awaits inside the A* loop into cache hits. Sampling rather than a DDA walk —
 * a quarter-cell step cannot skip a 2° cell, and the whole function runs once
 * per route.
 */
export function cellsAlongLine(
  grid: CellGrid,
  from: { lon: number; lat: number },
  to: { lon: number; lat: number },
  pad = 0,
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
  const push = (col: number, row: number) => {
    const key = cellKey(col, row);
    if (seen.has(key)) {return;}
    seen.add(key);
    out.push({ col, row });
  };

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { col, row } = cellFor(
      grid,
      from.lon + (to.lon - from.lon) * t,
      from.lat + (to.lat - from.lat) * t,
    );
    for (let dc = -pad; dc <= pad; dc++) {
      for (let dr = -pad; dr <= pad; dr++) {
        push(col + dc, row + dr);
      }
    }
  }
  return out;
}

/**
 * Cells overlapping an extent, expanded by `ring` cells in every direction.
 *
 * Used by viewport prefetch. Rows increase southward, so the north edge gives
 * the low row index — getting that backwards yields an empty range rather than
 * an error, which is exactly the sort of silent nothing this package tries to
 * avoid, so it has a test.
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
 * Fail loudly if a cell's own declared bbox disagrees with where this grid
 * says the cell is. See the header: the two datasets share a cut by
 * convention, and a convention that is never checked is a convention that
 * eventually is not true.
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
      `but the cell declares W${declared.west} S${declared.south} ` +
      `E${declared.east} N${declared.north}`
    );
  }
  return null;
}
