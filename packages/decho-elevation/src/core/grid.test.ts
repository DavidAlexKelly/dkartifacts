import { describe, expect, it } from "vitest";

import {
  cellBounds,
  cellFor,
  cellKey,
  cellsAlongLine,
  cellsInBounds,
  distanceMetres,
  gridMismatch,
  metresPerDegreeLon,
  parseCellKey,
  type CellGrid,
} from "./grid.js";

/** The cut every Offline World dataset shares. */
const GRID: CellGrid = { originLon: -180, originLat: 85, cellDeg: 2 };

describe("the cell grid", () => {
  it("agrees with the pathfinding chunks' own declared bounds", () => {
    // Straight out of pathfinding/c000_r006/meta.json. If this ever fails, the
    // three datasets no longer share a cut and nothing downstream is safe.
    expect(cellBounds(GRID, 0, 6)).toEqual({
      west: -180,
      south: 71,
      east: -178,
      north: 73,
    });
    expect(cellKey(0, 6)).toBe("c000_r006");
  });

  it("round-trips a cell key", () => {
    expect(parseCellKey("c000_r006")).toEqual({ col: 0, row: 6 });
    expect(parseCellKey("c179_r084")).toEqual({ col: 179, row: 84 });
    expect(parseCellKey("nonsense")).toBeNull();
    expect(parseCellKey("")).toBeNull();
  });

  it("puts a point in the cell whose bounds contain it", () => {
    const cell = cellFor(GRID, 9.1, 61.5);
    const bounds = cellBounds(GRID, cell.col, cell.row);
    expect(bounds.west).toBeLessThanOrEqual(9.1);
    expect(bounds.east).toBeGreaterThan(9.1);
    expect(bounds.south).toBeLessThanOrEqual(61.5);
    expect(bounds.north).toBeGreaterThan(61.5);
  });

  it("covers the whole planet without gaps", () => {
    expect(cellFor(GRID, -180, 85)).toEqual({ col: 0, row: 0 });
    // Row 84 runs from -83 to -85, and column 179 ends at the antimeridian:
    // the last cell of the cut, which is where the chunk names top out.
    expect(cellBounds(GRID, 179, 84)).toEqual({
      west: 178,
      east: 180,
      north: -83,
      south: -85,
    });
  });

  it("returns cells for an extent, north edge giving the low row", () => {
    // Rows increase southward. Reading the extent the other way round yields
    // an empty list rather than an error — a silent nothing.
    const cells = cellsInBounds(GRID, {
      west: 8,
      east: 11,
      south: 60,
      north: 62,
    });
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const bounds = cellBounds(GRID, cell.col, cell.row);
      expect(bounds.east).toBeGreaterThan(8);
      expect(bounds.west).toBeLessThan(11);
      expect(bounds.north).toBeGreaterThan(60);
      expect(bounds.south).toBeLessThan(62);
    }
  });

  it("expands an extent by a ring", () => {
    // Kept clear of the cell edges on purpose: 61°N is exactly a boundary on
    // this grid (85 - 12 x 2), so an extent touching it legitimately covers two
    // rows and would make this test about the wrong thing.
    const extent = { west: 9.02, east: 9.08, south: 61.02, north: 61.08 };
    const tight = cellsInBounds(GRID, extent);
    const ringed = cellsInBounds(GRID, extent, 1);
    expect(tight).toHaveLength(1);
    expect(ringed).toHaveLength(9);
  });

  it("finds every cell under a line, once", () => {
    const cells = cellsAlongLine(
      GRID,
      { lon: 9, lat: 61 },
      { lon: 15, lat: 61 },
    );
    const keys = cells.map((c) => cellKey(c.col, c.row));
    expect(new Set(keys).size).toBe(keys.length);
    // 9E to 15E crosses 10, 12 and 14: four cells on a 2° grid.
    expect(cells).toHaveLength(4);
  });

  it("handles a degenerate line", () => {
    expect(
      cellsAlongLine(GRID, { lon: 9, lat: 61 }, { lon: 9, lat: 61 }),
    ).toHaveLength(1);
  });

  it("reports a mismatch between the grid and a chunk's own bounds", () => {
    expect(
      gridMismatch(GRID, { col: 0, row: 6 }, {
        west: -180,
        south: 71,
        east: -178,
        north: 73,
      }),
    ).toBeNull();

    const problem = gridMismatch(GRID, { col: 0, row: 6 }, {
      west: -180,
      south: 69,
      east: -178,
      north: 71,
    });
    expect(problem).toMatch(/grid mismatch: c000_r006/);
  });
});

describe("distance", () => {
  it("shrinks a degree of longitude with latitude", () => {
    expect(metresPerDegreeLon(0)).toBeCloseTo(111195, 0);
    expect(metresPerDegreeLon(60)).toBeCloseTo(metresPerDegreeLon(0) / 2, 0);
    expect(metresPerDegreeLon(90)).toBeCloseTo(0, 6);
  });

  it("measures a degree of latitude", () => {
    expect(
      distanceMetres({ lon: 0, lat: 0 }, { lon: 0, lat: 1 }),
    ).toBeCloseTo(111195, 0);
  });

  it("is zero for a point on itself", () => {
    expect(distanceMetres({ lon: 9, lat: 61 }, { lon: 9, lat: 61 })).toBe(0);
  });
});
