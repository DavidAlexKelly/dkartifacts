import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCacheIndex,
  resolveCap,
  selectVictims,
  type CacheEntryMeta,
  type KeyValueStore,
} from "./persistentCache.js";

const MB = 1024 * 1024;

/** In-memory stand-in for localStorage. */
function fakeStorage(initial: Record<string, string> = {}): KeyValueStore & {
  dump(): Record<string, string>;
} {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

describe("resolveCap", () => {
  it("uses the configured ceiling when the browser reports no quota", () => {
    expect(resolveCap({ maxBytes: 2000, quotaFraction: 0.5 })).toBe(2000);
    expect(resolveCap({ maxBytes: 2000, quotaFraction: 0.5 }, 0)).toBe(2000);
  });

  it("never claims more than the configured share of a small quota", () => {
    // Safari-ish: ~1 GB for the whole origin, and we are not the only user of
    // it — the OSDK's caches and the app bundle live there too.
    expect(
      resolveCap({ maxBytes: 2 * 1024 * MB, quotaFraction: 0.5 }, 1000 * MB),
    ).toBe(500 * MB);
  });

  it("keeps the ceiling when the quota is generous", () => {
    expect(
      resolveCap({ maxBytes: 100 * MB, quotaFraction: 0.5 }, 100_000 * MB),
    ).toBe(100 * MB);
  });
});

describe("selectVictims", () => {
  const now = 1_000_000_000;
  const meta = (bytes: number | undefined, ageMs: number): CacheEntryMeta => ({
    bytes,
    lastUsed: now - ageMs,
  });

  it("evicts nothing when under target", () => {
    const result = selectVictims([["a", meta(10, 1000)]], {
      currentBytes: 10,
      targetBytes: 100,
      now,
    });
    expect(result.keys).toEqual([]);
  });

  it("prefers large and old over small and old", () => {
    // The point of weighting by size: a pure LRU would shed the small file
    // first purely because it is marginally older.
    const result = selectVictims(
      [
        ["small-old", meta(1 * MB, 10_000)],
        ["big-old", meta(30 * MB, 9_000)],
      ],
      { currentBytes: 31 * MB, targetBytes: 5 * MB, now },
    );
    expect(result.keys[0]).toBe("big-old");
  });

  it("protects a small, recently used entry over a large idle one", () => {
    // This is the low-zoom archive: small, needed by every pan. A pure LRU
    // evicts it the moment the user spends a while zoomed in, and re-fetching
    // it is the worst trade available.
    const result = selectVictims(
      [
        ["z0-z6", meta(45 * MB, 5)],
        ["z12-cell", meta(30 * MB, 3_600_000)],
      ],
      { currentBytes: 75 * MB, targetBytes: 50 * MB, now },
    );
    expect(result.keys).toEqual(["z12-cell"]);
  });

  it("never evicts pinned entries", () => {
    const result = selectVictims(
      [
        ["pinned", { bytes: 90 * MB, lastUsed: 0, pinned: true }],
        ["loose", meta(10 * MB, 1000)],
      ],
      { currentBytes: 100 * MB, targetBytes: 5 * MB, now },
    );
    expect(result.keys).toEqual(["loose"]);
  });

  it("sheds unknown-size entries first, and stops to re-measure", () => {
    // An entry we cannot measure cannot be budgeted, and keeping it means the
    // accounting stays wrong. Freeing an unknown amount also means we cannot
    // reason about progress, so the pass stops rather than over-evicting.
    const result = selectVictims(
      [
        ["unknown", meta(undefined, 10)],
        ["known", meta(50 * MB, 100_000)],
      ],
      { currentBytes: 50 * MB, targetBytes: 10 * MB, now },
    );
    expect(result.keys).toEqual(["unknown"]);
  });

  it("stops as soon as it is under target", () => {
    const result = selectVictims(
      [
        ["a", meta(30 * MB, 100_000)],
        ["b", meta(30 * MB, 90_000)],
        ["c", meta(30 * MB, 80_000)],
      ],
      { currentBytes: 90 * MB, targetBytes: 60 * MB, now },
    );
    expect(result.keys).toHaveLength(1);
    expect(result.freedBytes).toBe(30 * MB);
  });
});

describe("createCacheIndex", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("records writes and totals their bytes", () => {
    const index = createCacheIndex(fakeStorage());
    index.put("a", { bytes: 100, lastUsed: 1 });
    index.put("b", { bytes: 250, lastUsed: 2 });

    expect(index.totalBytes()).toBe(350);
    expect(index.entries()).toHaveLength(2);
  });

  it("counts an unknown size as zero rather than throwing", () => {
    const index = createCacheIndex(fakeStorage());
    index.put("a", { bytes: undefined, lastUsed: 1 });
    expect(index.totalBytes()).toBe(0);
  });

  it("touch updates recency without touching the body", () => {
    const index = createCacheIndex(fakeStorage());
    index.put("a", { bytes: 10, lastUsed: 1 });
    index.touch("a", 5_000);
    expect(index.get("a")?.lastUsed).toBe(5_000);
  });

  it("touch on an unknown key is a no-op", () => {
    const index = createCacheIndex(fakeStorage());
    expect(() => index.touch("nope")).not.toThrow();
    expect(index.get("nope")).toBeUndefined();
  });

  it("persists to storage, debounced, and reloads", () => {
    const storage = fakeStorage();
    const index = createCacheIndex(storage);
    index.put("a", { bytes: 100, lastUsed: 7 });

    // Debounced: nothing written yet. Flushing on every cache hit would mean
    // serialising the whole index synchronously on the hot path.
    expect(storage.dump()).toEqual({});
    vi.advanceTimersByTime(2000);

    const reloaded = createCacheIndex(storage);
    expect(reloaded.get("a")).toEqual({ bytes: 100, lastUsed: 7 });
    expect(reloaded.totalBytes()).toBe(100);
  });

  it("survives a corrupt index by starting empty", () => {
    const storage = fakeStorage({
      "decho-basemap:cache-index/v1": "{ not json",
    });
    const index = createCacheIndex(storage);
    expect(index.entries()).toEqual([]);
  });

  it("works with no storage at all", () => {
    const index = createCacheIndex(null);
    index.put("a", { bytes: 10, lastUsed: 1 });
    expect(index.totalBytes()).toBe(10);
  });

  it("reconcile drops entries the cache no longer holds", () => {
    const index = createCacheIndex(fakeStorage());
    index.put("gone", { bytes: 100, lastUsed: 1 });
    index.put("kept", { bytes: 50, lastUsed: 1 });

    index.reconcile(["kept"], () => undefined);

    expect(index.get("gone")).toBeUndefined();
    expect(index.totalBytes()).toBe(50);
  });

  it("reconcile adopts cached keys, dating unknown ones to the epoch", () => {
    // Rebuilding after the index is lost: sizes come from the manifest, and
    // anything we have never seen used is evicted before anything we have.
    const index = createCacheIndex(fakeStorage());
    index.reconcile(["a", "b"], (key) => (key === "a" ? 4242 : undefined));

    expect(index.get("a")).toEqual({ bytes: 4242, lastUsed: 0 });
    expect(index.get("b")).toEqual({ bytes: undefined, lastUsed: 0 });
    expect(index.totalBytes()).toBe(4242);
  });

  it("reconcile backfills a size onto an entry that only had an age", () => {
    const index = createCacheIndex(fakeStorage());
    index.put("a", { bytes: undefined, lastUsed: 999 });
    index.reconcile(["a"], () => 1234);

    expect(index.get("a")).toEqual({ bytes: 1234, lastUsed: 999 });
  });

  it("clear empties the index", () => {
    const index = createCacheIndex(fakeStorage());
    index.put("a", { bytes: 10, lastUsed: 1 });
    index.clear();
    expect(index.totalBytes()).toBe(0);
    expect(index.entries()).toEqual([]);
  });
});
