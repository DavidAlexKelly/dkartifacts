import { describe, expect, it } from "vitest";

import {
  fixedGridResolver,
  manifestResolver,
  storeTarget,
  type FixedGridStore,
  type GlobeManifest,
} from "./stores.js";

/**
 * Trimmed version of the real manifest.json in "[MAP] Chunked PMtiles":
 * version 2, gridOrigin (-180, 85), a single archive for z0-6 and 2-degree
 * cells at z12 with an allow-list. Cell numbers below were taken from that
 * file so the expectations describe real data rather than invented data.
 */
const MANIFEST: GlobeManifest = {
  version: 2,
  gridOrigin: { lon: -180, lat: 85 },
  layers: [
    { id: "low", minZoom: 0, maxZoom: 6, type: "single", path: "z0-z6.pmtiles" },
    {
      id: "high",
      minZoom: 12,
      maxZoom: 12,
      type: "grid",
      cellDeg: 2,
      pathTemplate: "z12/c{col}_r{row}.pmtiles",
      // Paris sits in col 91, row 18 for a 2-degree grid anchored at
      // (-180, 85): (2.35 + 180) / 2 = 91.17, (85 - 48.86) / 2 = 18.07.
      cells: [
        [91, 18],
        [91, 19],
        [92, 18],
      ],
    },
  ],
};

/** Web-mercator tile containing a lon/lat at a zoom. */
function tileFor(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
    ),
  };
}

const PARIS = { lon: 2.3522, lat: 48.8566 };

describe("manifestResolver", () => {
  const resolver = manifestResolver(MANIFEST);

  it("reports the deepest zoom any layer covers", () => {
    expect(resolver.maxZoom).toBe(12);
  });

  it("returns the single archive for low zooms", () => {
    expect(resolver.pathForTile(0, 0, 0)).toBe("z0-z6.pmtiles");
    expect(resolver.pathForTile(6, 33, 22)).toBe("z0-z6.pmtiles");
  });

  it("resolves a grid tile to its zero-padded cell", () => {
    const { x, y } = tileFor(PARIS.lon, PARIS.lat, 12);
    // The padding matters: the dataset's files are c091_r018, not c91_r18.
    expect(resolver.pathForTile(12, x, y)).toBe("z12/c091_r018.pmtiles");
  });

  it("returns null for a cell the manifest does not list", () => {
    // Mid-Atlantic at z12 — ocean, so no cell was ever written. Returning null
    // is what stops the tile protocol issuing a doomed request per tile.
    const { x, y } = tileFor(-30, 40, 12);
    expect(resolver.pathForTile(12, x, y)).toBeNull();
  });

  it("returns null for a zoom no layer covers", () => {
    // z7-z11 are absent from this trimmed manifest, and above maxZoom MapLibre
    // overzooms rather than requesting deeper tiles.
    expect(resolver.pathForTile(9, 100, 100)).toBeNull();
    expect(resolver.pathForTile(15, 100, 100)).toBeNull();
  });

  it("cellsAround returns listed cells overlapping the extent plus a ring", () => {
    const cells = resolver.cellsAround(
      12,
      { west: 2.3, south: 48.8, east: 2.4, north: 48.9 },
      1,
    );
    const paths = cells.map((c) => c.path).sort();

    // Only the three cells the manifest lists can come back, and all three are
    // within one ring of Paris.
    expect(paths).toEqual([
      "z12/c091_r018.pmtiles",
      "z12/c091_r019.pmtiles",
      "z12/c092_r018.pmtiles",
    ]);
    for (const cell of cells) {
      expect(Number.isInteger(cell.col)).toBe(true);
      expect(Number.isInteger(cell.row)).toBe(true);
    }
  });

  it("cellsAround is empty for a single-archive zoom", () => {
    // One file covers everything, so there is nothing to prefetch.
    expect(
      resolver.cellsAround(3, { west: 0, south: 0, east: 10, north: 10 }, 1),
    ).toEqual([]);
  });

  it("rows increase southward from the grid origin", () => {
    // row = floor((gridOrigin.lat - lat) / cellDeg), with gridOrigin.lat = 85.
    // Getting this sign wrong yields negative rows and a blank map, and it is
    // exactly where this resolver and the Python chunker diverged once before.
    const at = (lat: number) =>
      resolver.cellsAround(
        12,
        { west: 2.35, east: 2.35, south: lat, north: lat },
        2,
      );

    const northerly = at(50.9); // row 17
    const southerly = at(48.86); // row 18

    expect(northerly.length).toBeGreaterThan(0);
    expect(southerly.length).toBeGreaterThan(0);
    expect(Math.min(...southerly.map((c) => c.row))).toBeGreaterThan(
      Math.min(...northerly.map((c) => c.row)) - 1,
    );
    // And concretely: Paris resolves to row 18, not -18.
    expect(southerly.some((c) => c.row === 18)).toBe(true);
  });
});

describe("fixedGridResolver", () => {
  const store: FixedGridStore = {
    kind: "fixed-grid",
    datasetRid: "ri.foundry.main.dataset.theatre",
    singleFileMaxZoom: 8,
    singleFilePath: "z0-z8.pmtiles",
    bbox: { minLon: 14, maxLon: 45, minLat: 44, maxLat: 72 },
    grid: {
      9: { cols: 2, rows: 2 },
      12: { cols: 5, rows: 5 },
    },
    maxZoom: 12,
    fileName: (zoom, minLon, minLat) =>
      `z${zoom}_${minLon.toFixed(1)}E_${minLat.toFixed(1)}N.pmtiles`,
  };
  const resolver = fixedGridResolver(store);

  it("returns the single archive at or below its zoom", () => {
    expect(resolver.pathForTile(0, 0, 0)).toBe("z0-z8.pmtiles");
    expect(resolver.pathForTile(8, 140, 70)).toBe("z0-z8.pmtiles");
  });

  it("names a cell from the theatre grid", () => {
    // Narva, inside the theatre box.
    const { x, y } = tileFor(28.19, 59.37, 12);
    expect(resolver.pathForTile(12, x, y)).toMatch(
      /^z12_\d+\.\dE_\d+\.\dN\.pmtiles$/,
    );
  });

  it("clamps rather than returning null outside the bbox", () => {
    // The theatre cut has no allow-list, and an edge cell is a better answer
    // than nothing for a tile just outside the box.
    const { x, y } = tileFor(-60, 10, 12);
    expect(resolver.pathForTile(12, x, y)).not.toBeNull();
  });

  it("cellsAround is empty for single-archive zooms and non-empty inside the box", () => {
    expect(
      resolver.cellsAround(8, { west: 20, south: 50, east: 30, north: 60 }, 1),
    ).toEqual([]);

    const cells = resolver.cellsAround(
      12,
      { west: 27, south: 58, east: 29, north: 60 },
      0,
    );
    expect(cells.length).toBeGreaterThan(0);
  });
});

describe("storeTarget", () => {
  it("prefers the dataset over the media set", () => {
    expect(
      storeTarget({
        kind: "manifest",
        datasetRid: "ri.foundry.main.dataset.a",
        mediaSetRid: "ri.mio.main.media-set.b",
      }),
    ).toEqual({ rid: "ri.foundry.main.dataset.a", media: false });
  });

  it("falls back to the media set when there is no dataset", () => {
    expect(
      storeTarget({ kind: "manifest", mediaSetRid: "ri.mio.main.media-set.b" }),
    ).toEqual({ rid: "ri.mio.main.media-set.b", media: true });
  });

  it("throws when a manifest store names neither", () => {
    expect(() => storeTarget({ kind: "manifest" })).toThrow(/neither/i);
  });
});

/**
 * The object cell form, as deployed in "[MAP] Chunked PMtiles".
 *
 * It arrived WITHOUT a version bump, so nothing in the document distinguishes
 * it from the tuple form — the parser has to sniff each entry. Getting that
 * wrong destructures {col,row} as an array, yields undefined for both
 * coordinates, and produces a resolver that returns null for every grid tile:
 * a map that loads at low zoom and goes blank the moment you zoom in, with
 * nothing in the console.
 */
const OBJECT_MANIFEST: GlobeManifest = {
  version: 2,
  gridOrigin: { lon: -180, lat: 85 },
  layers: [
    {
      id: "low",
      minZoom: 0,
      maxZoom: 6,
      type: "single",
      path: "z0-z6.pmtiles",
      bytes: 44839642,
    },
    {
      id: "high",
      minZoom: 12,
      maxZoom: 12,
      type: "grid",
      cellDeg: 2,
      pathTemplate: "z12/c{col}_r{row}.pmtiles",
      cells: [
        { col: 91, row: 18, bytes: 32505856 },
        { col: 91, row: 19, bytes: 1048576 },
        { col: 92, row: 18 }, // size omitted: must still resolve
      ],
    },
  ],
};

describe("manifestResolver — object cell form", () => {
  const resolver = manifestResolver(OBJECT_MANIFEST);

  it("resolves grid tiles from {col,row} entries", () => {
    const { x, y } = tileFor(PARIS.lon, PARIS.lat, 12);
    expect(resolver.pathForTile(12, x, y)).toBe("z12/c091_r018.pmtiles");
  });

  it("still excludes cells the manifest does not list", () => {
    const { x, y } = tileFor(-30, 40, 12);
    expect(resolver.pathForTile(12, x, y)).toBeNull();
  });

  it("reports declared sizes by path", () => {
    expect(resolver.bytesForPath("z0-z6.pmtiles")).toBe(44839642);
    expect(resolver.bytesForPath("z12/c091_r018.pmtiles")).toBe(32505856);
  });

  it("returns undefined for a cell with no declared size", () => {
    // A hint, never a guarantee: callers must handle absence.
    expect(resolver.bytesForPath("z12/c092_r018.pmtiles")).toBeUndefined();
    expect(resolver.bytesForPath("nonsense.pmtiles")).toBeUndefined();
  });

  it("carries sizes through cellsAround so prefetch can budget", () => {
    const cells = resolver.cellsAround(
      12,
      { west: 2.3, south: 48.8, east: 2.4, north: 48.9 },
      1,
    );
    const paris = cells.find((c) => c.path === "z12/c091_r018.pmtiles");
    expect(paris?.bytes).toBe(32505856);
  });
});

describe("manifestResolver — tuple cell form keeps working", () => {
  it("reports no sizes, and resolves cells exactly as before", () => {
    const resolver = manifestResolver(MANIFEST);
    const { x, y } = tileFor(PARIS.lon, PARIS.lat, 12);

    expect(resolver.pathForTile(12, x, y)).toBe("z12/c091_r018.pmtiles");
    expect(resolver.bytesForPath("z12/c091_r018.pmtiles")).toBeUndefined();
  });
});
