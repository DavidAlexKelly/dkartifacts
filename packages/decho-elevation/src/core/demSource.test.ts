import { beforeEach, describe, expect, it, vi } from "vitest";

import { cellBounds, cellKey, type CellGrid } from "./grid";
import type { DemStore } from "./store";
import { writeTiff } from "./testing/tiff";

vi.mock("./bytes", () => ({
  getFileOptional: vi.fn(),
  settleRangeMode: vi.fn(() => Promise.resolve("whole-file")),
  isConfigured: vi.fn(() => true),
  // An idle transfer lane by default. Prefetching yields to demand, so a busy
  // lane means no speculative warming — which the test below sets up
  // explicitly rather than getting by accident.
  getLaneStats: vi.fn(() => ({
    large: { active: 0, queued: 0, limit: 4 },
    small: { active: 0, queued: 0, limit: 6 },
  })),
}));

import { getFileOptional, getLaneStats } from "./bytes";
import {
  DEFAULT_MIN_ZOOM,
  createDemSource,
  type ProtocolHost,
} from "./demSource";

const mockedGet = vi.mocked(getFileOptional);

const GRID: CellGrid = { originLon: -180, originLat: 85, cellDeg: 2 };
const STORE: DemStore = {
  datasetRid: "ri.foundry.main.dataset.test",
  grid: GRID,
  pathTemplate: "{cell}.tif",
  manifestPath: null,
  nodata: -32768,
};

/** Norway: 9E 61.5N is c094_r011, which is the cell every case below uses. */
const CELL = { col: 94, row: 11 };

/** A tiny but real GeoTIFF, so the whole path down to the decoder is exercised. */
async function chunk(): Promise<ArrayBuffer> {
  const size = 8;
  const samples = new Int16Array(size * size);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = 100 + (i % size) * 10;
  }
  return writeTiff({ width: size, height: size, samples, nodata: "-32768" });
}

/** Collects the protocol handlers a source registers. */
function collectingHost(): {
  host: ProtocolHost;
  handlers: Map<string, (params: { url: string }) => Promise<{ data: unknown }>>;
} {
  const handlers = new Map<
    string,
    (params: { url: string }) => Promise<{ data: unknown }>
  >();
  return {
    handlers,
    host: {
      addProtocol: (name, handler) => handlers.set(name, handler),
      removeProtocol: (name) => handlers.delete(name),
    },
  };
}

/** The tile containing 9E 61.5N at a given zoom. */
function tileFor(z: number, lon: number, lat: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  );
  return [x, y];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createDemSource: what loads, and when", () => {
  it("fetches nothing for a tile below the zoom floor", async () => {
    // This is the case that made the floor necessary. One z0 tile covers the
    // planet, which is ~15,700 DEM cells of 3-25 MB each.
    mockedGet.mockResolvedValue(await chunk());
    const source = await createDemSource({ store: STORE });
    const { host, handlers } = collectingHost();
    source.register(host);

    const handler = handlers.get("foundry-dem");
    const tile = await handler?.({ url: "foundry-dem://0/0/0" });

    expect(mockedGet).not.toHaveBeenCalled();
    // And it still answers with a decodable image, not an empty buffer: a
    // raster source given zero bytes logs an error MapLibre cannot explain.
    expect((tile?.data as ArrayBuffer).byteLength).toBeGreaterThan(0);
  });

  it("serves a tile at the floor, loading only the cells it covers", async () => {
    mockedGet.mockResolvedValue(await chunk());
    const source = await createDemSource({ store: STORE });
    const { host, handlers } = collectingHost();
    source.register(host);

    const [x, y] = tileFor(source.minZoom, 9, 61.5);
    await handlers.get("foundry-dem")?.({
      url: `foundry-dem://${source.minZoom}/${x}/${y}`,
    });

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith(
      STORE.datasetRid,
      `${cellKey(CELL.col, CELL.row)}.tif`,
    );
  });

  it("reuses a decoded cell across tiles instead of re-fetching it", async () => {
    mockedGet.mockResolvedValue(await chunk());
    const source = await createDemSource({ store: STORE });
    const { host, handlers } = collectingHost();
    source.register(host);
    const handler = handlers.get("foundry-dem");

    // Four neighbouring z12 tiles, all inside one 2° cell.
    const [x, y] = tileFor(12, 9, 61.5);
    await Promise.all([
      handler?.({ url: `foundry-dem://12/${x}/${y}` }),
      handler?.({ url: `foundry-dem://12/${x + 1}/${y}` }),
      handler?.({ url: `foundry-dem://12/${x}/${y + 1}` }),
      handler?.({ url: `foundry-dem://12/${x + 1}/${y + 1}` }),
    ]);

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(source.stats().residentCells).toBe(1);
  });

  it("does not re-ask for a cell that answered 404", async () => {
    mockedGet.mockResolvedValue(null);
    const source = await createDemSource({ store: STORE });
    const { host, handlers } = collectingHost();
    source.register(host);
    const handler = handlers.get("foundry-dem");

    const [x, y] = tileFor(12, 9, 61.5);
    await handler?.({ url: `foundry-dem://12/${x}/${y}` });
    await handler?.({ url: `foundry-dem://12/${x}/${y}` });

    // Most of the planet is ocean with no chunk; asking twice per tile for
    // something that does not exist is the difference between a quiet map and
    // a console full of 404s.
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(source.stats().absentCells).toBe(1);
  });

  it("refuses a tile covering absurdly many cells, whatever the floor", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockedGet.mockResolvedValue(await chunk());
    // A floor of 0 is a misconfiguration; the backstop is what stops it being
    // a catastrophic one.
    const source = await createDemSource({ store: STORE, minZoom: 0 });
    const { host, handlers } = collectingHost();
    source.register(host);

    await handlers.get("foundry-dem")?.({ url: "foundry-dem://0/0/0" });

    expect(mockedGet).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("refusing tile 0/0/0"),
    );
    warn.mockRestore();
  });

  it("warms one level below the floor, and no further", async () => {
    // The floor is an abrupt edge — cross it and MapLibre drops every terrain
    // tile at once — so the cells the next zoom step will draw are worth having
    // decoded before the step. One level only: two levels out is a view four
    // times as wide, where the same four cells are far less likely to be the
    // ones anybody zooms into.
    vi.useFakeTimers();
    try {
      mockedGet.mockResolvedValue(await chunk());
      const source = await createDemSource({ store: STORE });
      const bounds = cellBounds(GRID, CELL.col, CELL.row);

      source.prefetchAround(source.minZoom - 2, bounds);
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockedGet).not.toHaveBeenCalled();

      source.prefetchAround(source.minZoom - 1, bounds);
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockedGet).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not speculate while the transfer lane is busy", async () => {
    // Warming competes for the same lane as the basemap's archives and as the
    // tiles the view is actually waiting on, and a 2° cell is 3-25 MB — so
    // starting one while that lane is full delays something the user is
    // looking at to fetch something they may never look at.
    vi.useFakeTimers();
    try {
      mockedGet.mockResolvedValue(await chunk());
      const source = await createDemSource({ store: STORE });
      const bounds = cellBounds(GRID, CELL.col, CELL.row);

      vi.mocked(getLaneStats).mockReturnValueOnce({
        large: { active: 4, queued: 2, limit: 4 },
        small: { active: 0, queued: 0, limit: 6 },
      });
      source.prefetchAround(source.minZoom, bounds);
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockedGet).not.toHaveBeenCalled();

      // And resumes once it clears: the next view change asks again.
      source.prefetchAround(source.minZoom, bounds);
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockedGet).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("floors tiles at the zoom the docs and the README both name", async () => {
    // This drifted once — the constant said 11 while its own comment, the file
    // header and the README all said 9 — and the symptom was terrain that
    // appeared only when very zoomed in and vanished the moment you pulled
    // back. Cheap to pin, expensive to notice.
    expect(DEFAULT_MIN_ZOOM).toBe(9);
    const source = await createDemSource({ store: STORE });
    expect(source.minZoom).toBe(9);
  });

  it("cancels a prefetch that a later view change supersedes", async () => {
    vi.useFakeTimers();
    try {
      mockedGet.mockResolvedValue(await chunk());
      const source = await createDemSource({ store: STORE });
      const bounds = cellBounds(GRID, CELL.col, CELL.row);

      // Debounced: a pan fires moveend and zoomend for one gesture, and a DEM
      // cell is far too expensive to speculate on twice.
      source.prefetchAround(12, bounds);
      source.prefetchAround(12, bounds);
      source.cancelPrefetch();
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockedGet).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers point questions at any zoom, floor or no floor", async () => {
    // The floor is about tiles. A profile read while zoomed out to a continent
    // is a question the user asked, and one cell is a fair price for it.
    mockedGet.mockResolvedValue(await chunk());
    const source = await createDemSource({ store: STORE });

    const height = await source.heightAt(9, 61.5);
    expect(Number.isFinite(height)).toBe(true);
    expect(mockedGet).toHaveBeenCalledTimes(1);

    // And the second read is free.
    expect(source.heightAtLoaded(9, 61.5)).toBeCloseTo(height, 6);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("reports NaN rather than throwing where there is no chunk", async () => {
    mockedGet.mockResolvedValue(null);
    const source = await createDemSource({ store: STORE });
    expect(await source.heightAt(9, 61.5)).toBeNaN();
  });

  it("serves one protocol per renderer, and refuses to name others", async () => {
    mockedGet.mockResolvedValue(null);
    const source = await createDemSource({
      store: STORE,
      tiles: {
        "dem-a": () => new Uint8Array(256 * 256 * 4),
        "dem-b": () => new Uint8Array(256 * 256 * 4),
      },
    });

    expect(source.protocols).toEqual(["dem-a", "dem-b"]);
    expect(source.tileUrl("dem-a")).toBe("dem-a://{z}/{x}/{y}");
    expect(() => source.tileUrl("dem-c")).toThrow(/serves no protocol/);
  });

  it("keeps the protocol registered until the last holder unregisters", async () => {
    mockedGet.mockResolvedValue(null);
    const source = await createDemSource({ store: STORE });
    const { host, handlers } = collectingHost();

    // React StrictMode double-mounts in development, and two maps can be alive
    // at once; with a boolean the first teardown would strand the others.
    source.register(host);
    source.register(host);
    source.unregister(host);
    expect(handlers.has("foundry-dem")).toBe(true);
    source.unregister(host);
    expect(handlers.has("foundry-dem")).toBe(false);
  });
});
