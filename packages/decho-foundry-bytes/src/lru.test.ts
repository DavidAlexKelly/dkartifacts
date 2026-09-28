import { describe, expect, it } from "vitest";

import { createResidentCache } from "./lru";

const buf = (bytes: number) => new ArrayBuffer(bytes);

describe("createResidentCache", () => {
  it("stores and returns bodies, tracking total bytes", () => {
    const cache = createResidentCache(1000);
    cache.set("a", buf(100));
    cache.set("b", buf(250));

    expect(cache.get("a")?.byteLength).toBe(100);
    expect(cache.bytes).toBe(350);
    expect(cache.size).toBe(2);
  });

  it("evicts least-recently-used first, not insertion order", () => {
    const cache = createResidentCache(300);
    cache.set("a", buf(100));
    cache.set("b", buf(100));
    cache.set("c", buf(100));

    // Touch "a" so "b" becomes the least recently used.
    cache.get("a");
    cache.set("d", buf(100));

    expect(cache.has("b")).toBe(false);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("c")).toBe(true);
    expect(cache.has("d")).toBe(true);
    expect(cache.bytes).toBe(300);
  });

  it("replacing a key does not double-count its bytes", () => {
    // The bug this guards against: subtracting the old size on replace is easy
    // to forget, and the symptom is a cache that reports more bytes than it
    // holds and then evicts everything.
    const cache = createResidentCache(1000);
    cache.set("a", buf(100));
    cache.set("a", buf(400));

    expect(cache.bytes).toBe(400);
    expect(cache.size).toBe(1);
  });

  it("keeps a single entry that alone exceeds the budget", () => {
    // Evicting the thing just asked for would guarantee a re-fetch and make no
    // progress. A z12 archive can legitimately be larger than a small budget.
    const cache = createResidentCache(100);
    cache.set("huge", buf(5000));

    expect(cache.has("huge")).toBe(true);
    expect(cache.bytes).toBe(5000);
  });

  it("evicts down to the budget when a large entry arrives", () => {
    const cache = createResidentCache(500);
    cache.set("a", buf(200));
    cache.set("b", buf(200));
    cache.set("big", buf(500));

    expect(cache.has("big")).toBe(true);
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(500);
  });

  it("returns undefined for a miss without disturbing the order", () => {
    const cache = createResidentCache(300);
    cache.set("a", buf(100));
    cache.set("b", buf(100));

    expect(cache.get("nope")).toBeUndefined();

    cache.set("c", buf(100));
    cache.set("d", buf(100));
    // "a" was still the oldest, so it goes first.
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
  });

  it("clear() resets bytes as well as entries", () => {
    const cache = createResidentCache(1000);
    cache.set("a", buf(100));
    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
  });
});
