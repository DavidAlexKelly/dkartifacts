import { describe, expect, it } from "vitest";

import { buildSyntheticCell } from "../testing/fixtures.js";
import { createLoadedCell } from "./cell.js";
import { parseCellGraph } from "./format.js";
import { haversineM } from "./geo.js";
import { SIDE_EAST, SIDE_SOUTH, type CellGrid } from "./grid.js";
import { stitchCells } from "./stitch.js";

const GRID: CellGrid = { originLon: -180, originLat: 85, cellDeg: 2 };

function loadCell(
  col: number,
  row: number,
  base: number,
  overrides: Partial<Parameters<typeof buildSyntheticCell>[0]> = {},
) {
  const built = buildSyntheticCell({
    grid: GRID,
    col,
    row,
    size: 8,
    ...overrides,
  });
  return {
    built,
    cell: createLoadedCell(
      parseCellGraph(built.meta, built.nodes, built.edges),
      base,
    ),
  };
}

describe("stitching adjacent cells", () => {
  it("links the facing border nodes and nothing else", () => {
    const west = loadCell(100, 12, 0);
    const east = loadCell(101, 12, 1 << 22);

    const result = stitchCells(west.cell, SIDE_EAST, east.cell);

    expect(result.linkCount).toBeGreaterThan(0);
    // The lattice is in phase here, so the nominal radius is enough.
    expect(result.widened).toBe(false);

    const spacing = west.cell.graph.spacingM;
    for (const [fromLocal, links] of result.forward) {
      // Only nodes in the eastern band of the west cell may be linked.
      expect(west.cell.borderMask[fromLocal] & (1 << SIDE_EAST)).toBeGreaterThan(0);
      for (const link of links) {
        // And only to nodes genuinely within the link radius.
        expect(link.distM).toBeLessThanOrEqual(spacing * 1.6);
        expect(link.distM).toBeCloseTo(
          haversineM(
            west.cell.graph.lon[fromLocal],
            west.cell.graph.lat[fromLocal],
            east.cell.graph.lon[link.toLocal],
            east.cell.graph.lat[link.toLocal],
          ),
          3,
        );
      }
    }
  });

  it("joins a lattice that is in phase one-for-one across the seam", () => {
    const west = loadCell(100, 12, 0);
    const east = loadCell(101, 12, 1 << 22);
    const result = stitchCells(west.cell, SIDE_EAST, east.cell);

    // 8 rows of nodes, each with a counterpart directly across the boundary.
    expect(result.forward.size).toBe(8);
    expect(result.backward.size).toBe(8);
  });

  it("mirrors each link, with the slope negated", () => {
    const slopey = { elevation: (lon: number) => 5000 * lon };
    const west = loadCell(100, 12, 0, slopey);
    const east = loadCell(101, 12, 1 << 22, slopey);

    const result = stitchCells(west.cell, SIDE_EAST, east.cell);

    for (const [fromLocal, links] of result.forward) {
      for (const link of links) {
        const back = result.backward.get(link.toLocal);
        expect(back).toBeDefined();
        const mirror = (back as typeof links).find((l) => l.toLocal === fromLocal);
        expect(mirror).toBeDefined();
        expect((mirror as (typeof links)[number]).slope).toBeCloseTo(-link.slope, 9);
        expect(link.slope).not.toBe(0);
      }
    }
  });

  /**
   * A road that crosses a cell boundary is exactly where an invented off-road
   * penalty would send the route on a visible detour, so a link between two
   * road-connected nodes must stay a road.
   */
  it("keeps a road a road across the seam", () => {
    const road = { terrain: (_i: number, j: number) => (j === 3 ? 2 : 1) };
    const west = loadCell(100, 12, 0, road);
    const east = loadCell(101, 12, 1 << 22, road);

    const result = stitchCells(west.cell, SIDE_EAST, east.cell);

    const terrains = new Set<number>();
    for (const links of result.forward.values()) {
      for (const link of links) {terrains.add(link.terrain);}
    }
    expect(terrains.has(2)).toBe(true);
    expect(terrains.has(1)).toBe(true);
  });

  it("refuses a synthetic link steeper than the data's own limit", () => {
    // A 3 km cliff over a ~28 km node spacing is far past max_slope 0.4.
    const west = loadCell(100, 12, 0, { elevation: () => 0 });
    const east = loadCell(101, 12, 1 << 22, { elevation: () => 300_000 });

    const result = stitchCells(west.cell, SIDE_EAST, east.cell);
    expect(result.linkCount).toBe(0);
  });

  it("produces nothing when the facing band is empty", () => {
    const west = loadCell(100, 12, 0);
    // Drop the neighbour's two westernmost columns: nothing is close enough.
    const east = loadCell(101, 12, 1 << 22, { omit: (i) => i < 2 });

    expect(stitchCells(west.cell, SIDE_EAST, east.cell).linkCount).toBe(0);
  });

  /**
   * This lattice is anisotropic — equal steps in DEGREES, so at 60°N the
   * north-south gap is twice the east-west one — which is exactly the case that
   * silently produced no links at all before the radius became self-measuring.
   */
  it("stitches north-south even when the seam gap exceeds the declared spacing", () => {
    const north = loadCell(100, 12, 0);
    const south = loadCell(100, 13, 1 << 22);

    // The southern neighbour lies across the north cell's SOUTH side.
    const result = stitchCells(north.cell, SIDE_SOUTH, south.cell);
    expect(result.linkCount).toBeGreaterThan(0);
    expect(result.forward.size).toBe(8);
    expect(result.widened).toBe(true);
    expect(result.effectiveRadiusM).toBeGreaterThan(
      north.cell.graph.spacingM * 1.6,
    );
  });

  it("refuses to bridge cells that are genuinely far apart", () => {
    // Two cells three columns apart, stitched as though adjacent: the closest
    // real pair is far beyond the fallback ceiling, so nothing is invented.
    const west = loadCell(100, 12, 0);
    const distant = loadCell(103, 12, 1 << 22);

    expect(stitchCells(west.cell, SIDE_EAST, distant.cell).linkCount).toBe(0);
  });
});
