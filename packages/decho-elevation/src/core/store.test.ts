import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadDemIndex, type DemManifest, type DemStore } from "./store.js";

// The byte layer is the one thing in this package that talks to the platform.
// Mocking it here keeps the manifest logic — which is where the loud failures
// live — testable without a dataset.
vi.mock("./bytes.js", () => ({
  getFileOptional: vi.fn(),
  settleRangeMode: vi.fn(() => Promise.resolve("whole-file")),
  isConfigured: vi.fn(() => true),
}));

import { getFileOptional, settleRangeMode } from "./bytes.js";

const mockedGet = vi.mocked(getFileOptional);
const mockedSettle = vi.mocked(settleRangeMode);

const STORE: DemStore = {
  datasetRid: "ri.foundry.main.dataset.test",
  grid: { originLon: -180, originLat: 85, cellDeg: 2 },
  pathTemplate: "{cell}.tif",
};

const asBytes = (value: unknown): ArrayBuffer =>
  new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;

beforeEach(() => {
  vi.clearAllMocks();
  mockedSettle.mockResolvedValue("whole-file");
});

describe("loadDemIndex without a manifest", () => {
  it("does not even look when manifestPath is null", async () => {
    const index = await loadDemIndex({ ...STORE, manifestPath: null });

    expect(mockedGet).not.toHaveBeenCalled();
    expect(mockedSettle).not.toHaveBeenCalled();
    expect(index.pathFor({ col: 0, row: 6 })).toBe("c000_r006.tif");
    // Unknown, NOT false: the only way to find out is to ask, and most of the
    // planet is ocean with no chunk at all.
    expect(index.has({ col: 0, row: 6 })).toBeUndefined();
    expect(index.bytesFor({ col: 0, row: 6 })).toBeUndefined();
    expect(index.cells()).toBeUndefined();
  });

  it("treats a missing manifest as absent, not as an error", async () => {
    mockedGet.mockResolvedValue(null);
    const index = await loadDemIndex(STORE);

    expect(mockedGet).toHaveBeenCalledWith(STORE.datasetRid, "manifest.json");
    expect(index.has({ col: 0, row: 6 })).toBeUndefined();
  });

  it("settles the transfer mode against the manifest, not against a chunk", async () => {
    // Left to the first chunk, a screenful of DEM tiles each probe
    // independently and each probe is answered with a full copy of the same
    // 20 MB file.
    mockedGet.mockResolvedValue(null);
    await loadDemIndex(STORE);
    expect(mockedSettle).toHaveBeenCalledWith(
      STORE.datasetRid,
      "manifest.json",
    );
  });

  it("survives an unreadable dataset without throwing", async () => {
    mockedGet.mockRejectedValue(new Error("403"));
    const index = await loadDemIndex(STORE);
    expect(index.has({ col: 0, row: 6 })).toBeUndefined();
  });
});

describe("loadDemIndex with a manifest", () => {
  it("reads the allow-list, the sizes and the ranges", async () => {
    const manifest: DemManifest = {
      version: 1,
      gridOrigin: { lon: -180, lat: 85 },
      cellDeg: 2,
      cells: [
        { col: 0, row: 6, bytes: 4210688, min: 0, max: 412 },
        [1, 6],
      ],
      dem: { source: "glo90", nodata: -32768 },
    };
    mockedGet.mockResolvedValue(asBytes(manifest));

    const index = await loadDemIndex(STORE);

    expect(index.has({ col: 0, row: 6 })).toBe(true);
    // The tuple form is accepted too: both shapes are deployed in the sibling
    // basemap manifest, and the version number cannot tell them apart.
    expect(index.has({ col: 1, row: 6 })).toBe(true);
    expect(index.has({ col: 99, row: 6 })).toBe(false);
    expect(index.bytesFor({ col: 0, row: 6 })).toBe(4210688);
    expect(index.bytesFor({ col: 1, row: 6 })).toBeUndefined();
    expect(index.rangeFor({ col: 0, row: 6 })).toEqual({ min: 0, max: 412 });
    expect(index.nodata).toBe(-32768);
    expect(index.meta?.source).toBe("glo90");
    expect(index.cells()).toEqual([
      { col: 0, row: 6 },
      { col: 1, row: 6 },
    ]);
  });

  it("lets the store's nodata win over the manifest's", async () => {
    mockedGet.mockResolvedValue(asBytes({ dem: { nodata: -9999 } }));
    const index = await loadDemIndex({ ...STORE, nodata: -32768 });
    expect(index.nodata).toBe(-32768);
  });

  it("takes the path template from the manifest when it has one", async () => {
    mockedGet.mockResolvedValue(asBytes({ pathTemplate: "dem/{cell}.tif" }));
    const index = await loadDemIndex(STORE);
    expect(index.pathFor({ col: 0, row: 6 })).toBe("dem/c000_r006.tif");
  });

  it("throws when the manifest's grid disagrees with the store's", async () => {
    // One of the two cuts was regenerated. Every sample would be whole cells
    // adrift, which looks like slightly wrong terrain rather than an error.
    mockedGet.mockResolvedValue(
      asBytes({ gridOrigin: { lon: -180, lat: 90 }, cellDeg: 2 }),
    );
    await expect(loadDemIndex(STORE)).rejects.toThrow(/disagrees/);
  });

  it("throws when a cell's own bounds disagree with where the grid puts it", async () => {
    mockedGet.mockResolvedValue(
      asBytes({
        cells: [
          {
            col: 0,
            row: 6,
            bounds: { west: -180, south: 69, east: -178, north: 71 },
          },
        ],
      }),
    );
    await expect(loadDemIndex(STORE)).rejects.toThrow(/grid mismatch/);
  });

  it("accepts a cell whose declared bounds agree", async () => {
    mockedGet.mockResolvedValue(
      asBytes({
        cells: [
          {
            col: 0,
            row: 6,
            bounds: { west: -180, south: 71, east: -178, north: 73 },
          },
        ],
      }),
    );
    await expect(loadDemIndex(STORE)).resolves.toBeTruthy();
  });

  it("throws on a manifest that exists and does not parse", async () => {
    // Different from there never having been one: someone wrote this and it is
    // broken.
    mockedGet.mockResolvedValue(
      new TextEncoder().encode("{ not json").buffer as ArrayBuffer,
    );
    await expect(loadDemIndex(STORE)).rejects.toThrow(/not valid JSON/);
  });
});
