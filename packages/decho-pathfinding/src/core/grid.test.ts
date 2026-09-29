import { describe, expect, it } from "vitest";

import {
  SIDE_EAST,
  SIDE_NORTH,
  SIDE_SOUTH,
  SIDE_WEST,
  cellBounds,
  cellFor,
  cellKey,
  cellsAlongLine,
  cellsInBounds,
  gridMismatch,
  neighbourCell,
  parseCellKey,
  type CellGrid,
} from "./grid.js";

/** The cut both the pathfinding chunks and the basemap's z12 layer use. */
const GRID: CellGrid = { originLon: -180, originLat: 85, cellDeg: 2 };

describe("the grid", () => {
  /**
   * The load-bearing test in this file. These numbers are copied verbatim from
   * pathfinding/c000_r006/meta.json in the real dataset — if this arithmetic is
   * wrong, every route is displaced by whole cells, and nothing else here would
   * notice.
   */
  it("reproduces the bbox the real dataset declares for c000_r006", () => {
    expect(cellBounds(GRID, 0, 6)).toEqual({
      west: -180,
      east: -178,
      north: 73,
      south: 71,
    });
  });

  it("names cells the way the dataset's directories are named", () => {
    expect(cellKey(0, 6)).toBe("c000_r006");
    expect(cellKey(12, 234)).toBe("c012_r234");
    expect(parseCellKey("c000_r006")).toEqual({ col: 0, row: 6 });
    expect(parseCellKey("nonsense")).toBeNull();
  });

  it("round-trips a point through its cell", () => {
    const point = { lon: 24.94, lat: 60.17 }; // Helsinki
    const cell = cellFor(GRID, point.lon, point.lat);
    const bounds = cellBounds(GRID, cell.col, cell.row);
    expect(point.lon).toBeGreaterThanOrEqual(bounds.west);
    expect(point.lon).toBeLessThan(bounds.east);
    expect(point.lat).toBeGreaterThan(bounds.south);
    expect(point.lat).toBeLessThanOrEqual(bounds.north);
  });

  it("increases rows southward and columns eastward", () => {
    const cell = cellFor(GRID, 24.94, 60.17);
    expect(cellFor(GRID, 24.94, 58.17).row).toBe(cell.row + 1);
    expect(cellFor(GRID, 26.94, 60.17).col).toBe(cell.col + 1);

    expect(neighbourCell(cell, SIDE_NORTH)).toEqual({
      col: cell.col,
      row: cell.row - 1,
    });
    expect(neighbourCell(cell, SIDE_SOUTH)).toEqual({
      col: cell.col,
      row: cell.row + 1,
    });
    expect(neighbourCell(cell, SIDE_WEST)).toEqual({
      col: cell.col - 1,
      row: cell.row,
    });
    expect(neighbourCell(cell, SIDE_EAST)).toEqual({
      col: cell.col + 1,
      row: cell.row,
    });
  });

  it("walks a corridor without skipping a cell", () => {
    const cells = cellsAlongLine(
      GRID,
      { lon: 24.94, lat: 60.17 },
      { lon: 30.94, lat: 60.17 },
    );
    const cols = cells.map((c) => c.col).sort((a, b) => a - b);
    // Four cells wide, contiguous, no gaps.
    expect(cols.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < cols.length; i++) {
      expect(cols[i] - cols[i - 1]).toBeLessThanOrEqual(1);
    }
  });

  it("dilates the corridor when asked", () => {
    const bare = cellsAlongLine(GRID, { lon: 20, lat: 60 }, { lon: 22, lat: 60 });
    const padded = cellsAlongLine(
      GRID,
      { lon: 20, lat: 60 },
      { lon: 22, lat: 60 },
      1,
    );
    expect(padded.length).toBeGreaterThan(bare.length);
  });

  /**
   * Rows increase southward, so a bounds walk that reads north as the high row
   * index produces an EMPTY list rather than an error — silently no prefetch,
   * forever, with nothing in the logs.
   */
  it("covers a viewport, north-west corner first", () => {
    const cells = cellsInBounds(GRID, {
      west: 24,
      east: 27,
      south: 59,
      north: 61,
    });

    expect(cells.length).toBeGreaterThan(0);
    // lon 24..27 spans cols 102-103; lat 59..61 spans rows 12-13.
    expect(cells).toContainEqual({ col: 102, row: 12 });
    expect(cells).toContainEqual({ col: 103, row: 13 });
    for (const cell of cells) {
      expect(cell.col).toBeGreaterThanOrEqual(102);
      expect(cell.col).toBeLessThanOrEqual(103);
      expect(cell.row).toBeGreaterThanOrEqual(12);
      expect(cell.row).toBeLessThanOrEqual(13);
    }
  });

  it("dilates a viewport by the ring", () => {
    const bounds = { west: 24.1, east: 24.2, south: 60.1, north: 60.2 };
    expect(cellsInBounds(GRID, bounds)).toHaveLength(1);
    expect(cellsInBounds(GRID, bounds, 1)).toHaveLength(9);
  });

  it("catches a cell that disagrees about where it is", () => {
    expect(gridMismatch(GRID, { col: 0, row: 6 }, cellBounds(GRID, 0, 6))).toBeNull();
    expect(
      gridMismatch(GRID, { col: 0, row: 6 }, {
        west: -180,
        east: -178,
        north: 75, // a grid origin of 87 rather than 85
        south: 73,
      }),
    ).toContain("grid mismatch");
  });
});
