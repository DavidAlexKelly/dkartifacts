/**
 * End-to-end: a mocked byte layer, real chunks, real search.
 *
 * The byte layer is the ONLY thing stubbed. Everything below it — loading a
 * cell, decoding it, indexing it, stitching it to its neighbour, searching
 * across the seam, costing the result — is the shipping code, driven by files
 * that are byte-for-byte in the dataset's format.
 *
 * Cells here are 8×8 or 12×12 lattices covering a 2° cell, so a "node spacing"
 * is tens of kilometres. That is unrealistic and deliberate: the arithmetic is
 * identical at 1500 m, and a small graph makes the expected answer something a
 * reader can work out by hand. It is also why every call passes a wide
 * `snapRadiusM` — at this scale a clicked point is a long way from any node.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildSyntheticCell,
  syntheticDataset,
  type SyntheticCellSpec,
} from "../testing/fixtures.js";
import type { CellGrid } from "./grid.js";
// Type-only, so it is erased and cannot pull ./route in ahead of the mock.
import type { RouteOptions } from "./route.js";

/**
 * Hoisted so the vi.mock factory can reach it — the factory is lifted above the
 * imports, so it cannot close over an ordinary module-level const.
 */
const served = vi.hoisted(() => ({
  files: new Map<string, ArrayBuffer>(),
  reads: [] as string[],
}));

vi.mock("@acc/decho-foundry-bytes", () => ({
  getFile: async (_rid: string, path: string, signal?: AbortSignal) => {
    if (signal?.aborted) {throw abort();}
    served.reads.push(path);
    const file = served.files.get(path);
    if (!file) {throw new Error(`404 ${path}`);}
    return file;
  },
  getFileOptional: async (_rid: string, path: string, signal?: AbortSignal) => {
    if (signal?.aborted) {throw abort();}
    served.reads.push(path);
    return served.files.get(path) ?? null;
  },
  abortError: () => abort(),
}));

function abort(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

// Imported after the mock is declared; vitest hoists vi.mock above these.
const { createGraphSource } = await import("./graphSource.js");
const { findRoute } = await import("./route.js");
const { NoGraphDataError, NoRouteError } = await import("./errors.js");
const { TERRAIN_OPEN, TERRAIN_ROAD } = await import("./profiles.js");

const GRID: CellGrid = { originLon: -180, originLat: 85, cellDeg: 2 };
const STORE = {
  datasetRid: "ri.foundry.main.dataset.test",
  grid: GRID,
  pathTemplate: "pathfinding/{cell}",
};

/** Cell (100, 12) covers lon [20, 22), lat (59, 61]. */
const COL = 100;
const ROW = 12;

type CellSpec = Partial<SyntheticCellSpec> & { col: number; row: number };

function serve(...cells: CellSpec[]) {
  served.files = syntheticDataset(
    cells.map((cell) =>
      buildSyntheticCell({ grid: GRID, size: 8, diagonals: true, ...cell }),
    ),
  );
  served.reads = [];
}

const source = () => createGraphSource({ store: STORE });

/** findRoute with a snap radius suited to the toy lattice. */
const go = (
  graph: ReturnType<typeof createGraphSource>,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  options: RouteOptions = {},
) => findRoute(graph, from, to, { snapRadiusM: 60_000, ...options });

describe("routing", () => {
  beforeEach(() => {
    served.files.clear();
    served.reads = [];
  });

  it("routes inside one cell", async () => {
    serve({ col: COL, row: ROW });

    const result = await go(
      source(),
      { lat: 60.8, lon: 20.2 },
      { lat: 59.2, lon: 21.8 },
    );

    expect(result.cells).toContain("c100_r012");
    expect(result.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(result.distanceM).toBeGreaterThan(0);
    expect(result.costM).toBeGreaterThan(0);
    // Ends near where it was asked to, within a (very coarse) node spacing.
    const [firstLat, firstLon] = result.waypoints[0];
    const [lastLat, lastLon] = result.waypoints[result.waypoints.length - 1];
    expect(firstLat).toBeCloseTo(60.8, 0);
    expect(firstLon).toBeCloseTo(20.2, 0);
    expect(lastLat).toBeCloseTo(59.2, 0);
    expect(lastLon).toBeCloseTo(21.8, 0);
  });

  /** The whole reason stitching exists. */
  it("routes across a cell boundary", async () => {
    serve({ col: COL, row: ROW }, { col: COL + 1, row: ROW });

    const result = await go(
      source(),
      { lat: 60, lon: 20.2 },
      { lat: 60, lon: 23.8 },
    );

    expect(result.cells).toContain("c100_r012");
    expect(result.cells).toContain("c101_r012");
    expect(result.truncated).toBe(false);
    // The path must actually cross lon 22 — the seam.
    expect(Math.min(...result.waypoints.map((w) => w[1]))).toBeLessThan(22);
    expect(Math.max(...result.waypoints.map((w) => w[1]))).toBeGreaterThan(22);
  });

  it("pulls in a middle cell it was never asked for", async () => {
    serve(
      { col: COL, row: ROW },
      { col: COL + 1, row: ROW },
      { col: COL + 2, row: ROW },
    );

    const result = await go(
      source(),
      { lat: 60, lon: 20.2 },
      { lat: 60, lon: 25.8 },
    );

    for (const key of ["c100_r012", "c101_r012", "c102_r012"]) {
      expect(result.cells).toContain(key);
    }
  });

  /**
   * Terrain is the point of the cost model: a road worth five times an open
   * crossing must bend the route onto it.
   */
  it("prefers a road to open ground", async () => {
    // Row 3 of the lattice is road; everything else is open.
    serve({
      col: COL,
      row: ROW,
      size: 12,
      terrain: (_i: number, j: number) => (j === 3 ? TERRAIN_ROAD : TERRAIN_OPEN),
    });

    const profile = {
      id: "road-lover",
      kVehicle: 0,
      terrain: { [TERRAIN_OPEN]: 5, [TERRAIN_ROAD]: 1 },
    };

    // Both endpoints sit on the road row; anything leaving it is five times
    // dearer per metre, so the cheapest path never does.
    const roadLat = 61 - (3 + 0.5) * (2 / 12);
    const result = await go(
      source(),
      { lat: roadLat, lon: 20.1 },
      { lat: roadLat, lon: 21.9 },
      { profile, simplifyToleranceM: 0 },
    );

    for (const [lat] of result.waypoints) {
      expect(lat).toBeCloseTo(roadLat, 3);
    }
  });

  /** Slope is signed per direction, so the cheap way round is not symmetric. */
  it("costs an uphill leg more than the same leg downhill", async () => {
    const spec: CellSpec = {
      col: COL,
      row: ROW,
      elevation: (lon: number) => (lon - 20) * 3000,
    };
    const profile = { id: "climber", kVehicle: 2, terrain: { 1: 1, 2: 1 } };

    serve(spec);
    const uphill = await go(
      source(),
      { lat: 60, lon: 20.2 },
      { lat: 60, lon: 21.8 },
      { profile },
    );

    serve(spec);
    const downhill = await go(
      source(),
      { lat: 60, lon: 21.8 },
      { lat: 60, lon: 20.2 },
      { profile },
    );

    expect(uphill.costM).toBeGreaterThan(downhill.costM);
    expect(uphill.distanceM).toBeCloseTo(downhill.distanceM, 0);
  });

  it("reports ETA only when the profile declares speeds", async () => {
    serve({ col: COL, row: ROW });
    const withoutSpeeds = await go(
      source(),
      { lat: 60.5, lon: 20.5 },
      { lat: 59.5, lon: 21.5 },
      { profile: { id: "bare", kVehicle: 1, terrain: { 1: 1 } } },
    );
    expect(withoutSpeeds.etaS).toBeNull();

    serve({ col: COL, row: ROW });
    const withSpeeds = await go(
      source(),
      { lat: 60.5, lon: 20.5 },
      { lat: 59.5, lon: 21.5 },
      {
        profile: {
          id: "timed",
          kVehicle: 1,
          terrain: { 1: 1 },
          speedMps: { 1: 10 },
        },
      },
    );
    expect(withSpeeds.etaS).toBeGreaterThan(0);
  });

  it("treats an absent cell as no coverage, with its own error", async () => {
    serve({ col: COL, row: ROW });

    await expect(
      go(source(), { lat: 60, lon: 20.5 }, { lat: 70, lon: 20.5 }),
    ).rejects.toBeInstanceOf(NoGraphDataError);
  });

  it("says so when the cell budget stops it, rather than routing the long way", async () => {
    serve(
      { col: COL, row: ROW },
      { col: COL + 1, row: ROW },
      { col: COL + 2, row: ROW },
    );

    const error = await go(
      source(),
      { lat: 60, lon: 20.2 },
      { lat: 60, lon: 25.8 },
      { maxCells: 2 },
    ).catch((err) => err);

    expect(error).toBeInstanceOf(NoRouteError);
    expect((error as InstanceType<typeof NoRouteError>).reason).toBe("cell-budget");
    expect((error as InstanceType<typeof NoRouteError>).truncated).toBe(true);
  });

  it("says so when the two endpoints are not connected", async () => {
    // A wall of missing nodes down the middle of the cell.
    serve({ col: COL, row: ROW, omit: (i: number) => i === 4 });

    const error = await go(
      source(),
      { lat: 60, lon: 20.2 },
      { lat: 60, lon: 21.8 },
    ).catch((err) => err);

    expect(error).toBeInstanceOf(NoRouteError);
    expect((error as InstanceType<typeof NoRouteError>).reason).toBe("disconnected");
  });

  it("honours cancellation", async () => {
    serve({ col: COL, row: ROW });
    const controller = new AbortController();
    controller.abort();

    const error = await go(
      source(),
      { lat: 60, lon: 20.2 },
      { lat: 60, lon: 21.8 },
      { signal: controller.signal },
    ).catch((err) => err);

    expect((error as Error).name).toBe("AbortError");
  });

  /**
   * Two things at once: a cell's three files are read once however many routes
   * cross it, and a cell that does not exist is remembered as absent rather
   * than probed again by the next search.
   */
  it("reads nothing twice", async () => {
    serve({ col: COL, row: ROW });
    const shared = source();

    await go(shared, { lat: 60.5, lon: 20.5 }, { lat: 59.5, lon: 21.5 });
    const afterFirst = [...served.reads];
    await go(shared, { lat: 59.5, lon: 21.5 }, { lat: 60.5, lon: 20.5 });

    const cellFiles = afterFirst.filter((path) => path.includes("c100_r012"));
    expect(cellFiles.sort()).toEqual([
      "pathfinding/c100_r012/edges.bin",
      "pathfinding/c100_r012/meta.json",
      "pathfinding/c100_r012/nodes.bin",
    ]);

    // No path is ever requested twice — not the cell's three files, and not
    // the neighbours probed and found absent, which are remembered for a TTL.
    // (The second route probes at most a neighbour the first never reached,
    // hence "no duplicates" rather than "no further reads".)
    expect(new Set(served.reads).size).toBe(served.reads.length);
    expect(served.reads.filter((p) => p.includes("c100_r012")).length).toBe(3);
  });

  it("simplifies the staircase away but keeps the endpoints", async () => {
    const spec: CellSpec = { col: COL, row: ROW, size: 16 };

    serve(spec);
    const raw = await go(
      source(),
      { lat: 60.8, lon: 20.2 },
      { lat: 59.2, lon: 21.8 },
      { simplifyToleranceM: 0 },
    );

    serve(spec);
    const simplified = await go(
      source(),
      { lat: 60.8, lon: 20.2 },
      { lat: 59.2, lon: 21.8 },
    );

    expect(simplified.waypoints.length).toBeLessThan(raw.waypoints.length);
    expect(simplified.waypoints[0]).toEqual(raw.waypoints[0]);
    expect(simplified.waypoints[simplified.waypoints.length - 1]).toEqual(
      raw.waypoints[raw.waypoints.length - 1],
    );
  });
});
