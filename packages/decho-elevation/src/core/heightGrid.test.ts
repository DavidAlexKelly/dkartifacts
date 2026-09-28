import { describe, expect, it } from "vitest";

import type { CellBounds } from "./grid";
import {
  gridStats,
  gridStepMetres,
  nearestHeight,
  sampleHeight,
  slopeAt,
  type HeightArray,
  type HeightGrid,
} from "./heightGrid";

/** One degree square at the equator keeps the metre arithmetic easy to check. */
const BOUNDS: CellBounds = { west: 0, south: 0, east: 1, north: 1 };

function makeGrid(
  values: HeightArray,
  width: number,
  height: number,
  nodata = NaN,
  bounds: CellBounds = BOUNDS,
): HeightGrid {
  return { width, height, values, bounds, nodata };
}

describe("sampleHeight", () => {
  // 2x2 over a 1° square: sample centres at 0.25 and 0.75 in both axes.
  //   10 20
  //   30 40
  const grid = makeGrid(Int16Array.from([10, 20, 30, 40]), 2, 2);

  it("reads a sample centre exactly", () => {
    expect(sampleHeight(grid, 0.25, 0.75)).toBeCloseTo(10, 6);
    expect(sampleHeight(grid, 0.75, 0.75)).toBeCloseTo(20, 6);
    expect(sampleHeight(grid, 0.25, 0.25)).toBeCloseTo(30, 6);
    expect(sampleHeight(grid, 0.75, 0.25)).toBeCloseTo(40, 6);
  });

  it("interpolates between them", () => {
    expect(sampleHeight(grid, 0.5, 0.75)).toBeCloseTo(15, 6);
    expect(sampleHeight(grid, 0.5, 0.5)).toBeCloseTo(25, 6);
  });

  it("clamps within the half-pixel border rather than refusing", () => {
    // The outer half-pixel has no second sample to interpolate towards. It is
    // inside the cell and must still answer, or every cell seam is a gap.
    expect(sampleHeight(grid, 0, 1)).toBeCloseTo(10, 6);
    expect(sampleHeight(grid, 1, 0)).toBeCloseTo(40, 6);
  });

  it("is NaN outside the grid", () => {
    expect(sampleHeight(grid, -0.5, 0.5)).toBeNaN();
    expect(sampleHeight(grid, 0.5, 1.6)).toBeNaN();
  });

  it("weights voids out instead of averaging them in", () => {
    const withVoid = makeGrid(
      Int16Array.from([-32768, 20, 30, 40]),
      2,
      2,
      -32768,
    );
    // Centre: three real corners at equal weight.
    expect(sampleHeight(withVoid, 0.5, 0.5)).toBeCloseTo(30, 6);
    // Over the void itself there is nothing to say.
    expect(sampleHeight(withVoid, 0.25, 0.75)).toBeNaN();
  });

  it("is NaN where every corner is a void", () => {
    const allVoid = makeGrid(
      Int16Array.from([-32768, -32768, -32768, -32768]),
      2,
      2,
      -32768,
    );
    expect(sampleHeight(allVoid, 0.5, 0.5)).toBeNaN();
  });
});

describe("nearestHeight", () => {
  const grid = makeGrid(Int16Array.from([10, 20, 30, 40]), 2, 2);

  it("picks the containing pixel, not the nearest centre", () => {
    expect(nearestHeight(grid, 0.1, 0.9)).toBe(10);
    expect(nearestHeight(grid, 0.9, 0.1)).toBe(40);
  });

  it("is NaN off the grid", () => {
    expect(nearestHeight(grid, 1.5, 0.5)).toBeNaN();
  });
});

describe("slopeAt", () => {
  it("is zero on flat ground", () => {
    const flat = makeGrid(new Int16Array(25).fill(100), 5, 5);
    expect(slopeAt(flat, 0.5, 0.5).slope).toBeCloseTo(0, 9);
  });

  it("matches the rise over the run on a linear ramp", () => {
    // Rising 100 m per column, eastward.
    const width = 5;
    const values = new Int16Array(width * width);
    for (let row = 0; row < width; row++) {
      for (let col = 0; col < width; col++) {
        values[row * width + col] = col * 100;
      }
    }
    const ramp = makeGrid(values, width, width);
    const step = gridStepMetres(ramp, 0.5);

    const { slope, aspect } = slopeAt(ramp, 0.5, 0.5);
    expect(slope).toBeCloseTo(100 / step.x, 6);
    // Downhill is west: 270° clockwise from north.
    expect(aspect).toBeCloseTo(270, 3);
  });

  it("points downhill to the south on a ramp rising northward", () => {
    const width = 5;
    const values = new Int16Array(width * width);
    for (let row = 0; row < width; row++) {
      for (let col = 0; col < width; col++) {
        // Row 0 is north, so a high north means a value falling with row.
        values[row * width + col] = (width - row) * 100;
      }
    }
    const { aspect } = slopeAt(makeGrid(values, width, width), 0.5, 0.5);
    expect(aspect).toBeCloseTo(180, 3);
  });

  it("falls back to a one-sided difference at the edge", () => {
    const width = 3;
    const values = Int16Array.from([0, 10, 20, 0, 10, 20, 0, 10, 20]);
    const grid = makeGrid(values, width, width);
    // Sampling at the far west edge: no western neighbour to difference
    // against, and answering NaN there would put a hole down every cell seam.
    const { slope } = slopeAt(grid, 0.01, 0.5);
    expect(Number.isFinite(slope)).toBe(true);
    expect(slope).toBeGreaterThan(0);
  });
});

describe("gridStats", () => {
  it("ignores voids", () => {
    const grid = makeGrid(
      Int16Array.from([-32768, 10, 900, 40]),
      2,
      2,
      -32768,
    );
    expect(gridStats(grid)).toEqual({ min: 10, max: 900, voids: 1 });
  });

  it("reports NaN for a cell with nothing in it", () => {
    const grid = makeGrid(Int16Array.from([-32768, -32768]), 2, 1, -32768);
    const stats = gridStats(grid);
    expect(stats.voids).toBe(2);
    expect(stats.min).toBeNaN();
  });
});
