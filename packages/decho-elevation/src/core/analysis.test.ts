import { describe, expect, it, vi } from "vitest";

import { createCellCache } from "./cellCache.js";
import type { HeightSampler } from "./demSource.js";
import {
  VIEWSHED_HIDDEN,
  VIEWSHED_NO_DATA,
  VIEWSHED_OUTSIDE,
  VIEWSHED_VISIBLE,
  earthBulge,
  lineOfSight,
  viewshed,
} from "./lineOfSight.js";
import { elevationProfile, sampleAlong } from "./profile.js";
import type { HeightGrid } from "./heightGrid.js";

/** A sampler over an analytic surface. No dataset, no network, no decode. */
function surface(height: (lon: number, lat: number) => number): HeightSampler {
  return {
    warm: () => Promise.resolve(),
    heightAtLoaded: height,
  };
}

describe("sampleAlong", () => {
  it("includes both ends and spaces the rest evenly", () => {
    const samples = sampleAlong(
      [
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 },
      ],
      5,
    );
    expect(samples).toHaveLength(5);
    expect(samples[0].lon).toBeCloseTo(0, 9);
    expect(samples[4].lon).toBeCloseTo(1, 9);
    expect(samples[2].distance).toBeCloseTo(samples[4].distance / 2, 3);
  });

  it("spaces by distance across legs of different lengths", () => {
    // A short leg then a long one: even spacing by distance must put more
    // samples in the long leg, which spacing by leg index would not.
    const samples = sampleAlong(
      [
        { lon: 0, lat: 0 },
        { lon: 0.1, lat: 0 },
        { lon: 2, lat: 0 },
      ],
      21,
    );
    const inFirstLeg = samples.filter((s) => s.lon <= 0.1).length;
    expect(inFirstLeg).toBeLessThan(3);
  });

  it("survives duplicated waypoints", () => {
    const samples = sampleAlong(
      [
        { lon: 5, lat: 5 },
        { lon: 5, lat: 5 },
      ],
      4,
    );
    expect(samples.every((s) => Number.isFinite(s.lon))).toBe(true);
    expect(samples.every((s) => s.distance === 0)).toBe(true);
  });

  it("handles the degenerate cases without throwing", () => {
    expect(sampleAlong([], 10)).toEqual([]);
    expect(sampleAlong([{ lon: 1, lat: 2 }], 10)).toHaveLength(1);
    expect(sampleAlong([{ lon: 1, lat: 2 }, { lon: 3, lat: 4 }], 0)).toEqual([]);
  });
});

describe("elevationProfile", () => {
  it("measures length, extremes, climb and descent", async () => {
    // A ridge in the middle of the line: up 400 m and back down.
    const profile = await elevationProfile(
      surface((lon) => 100 + 400 * (1 - Math.abs(lon - 0.5) / 0.5)),
      [
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 },
      ],
      { samples: 101 },
    );

    expect(profile.length).toBeCloseTo(111195, -2);
    expect(profile.min).toBeCloseTo(100, 1);
    expect(profile.max).toBeCloseTo(500, 1);
    expect(profile.gain).toBeCloseTo(400, 0);
    expect(profile.loss).toBeCloseTo(400, 0);
    expect(profile.voids).toBe(0);
  });

  it("warms the waypoints as well as the samples", async () => {
    const warmed: number[] = [];
    await elevationProfile(
      {
        warm: (points) => {
          warmed.push(points.length);
          return Promise.resolve();
        },
        heightAtLoaded: () => 0,
      },
      [
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 },
      ],
      { samples: 3 },
    );
    // One round of loads, not one per sample — and the waypoints go in as well
    // as the samples, because a long leg can cross a cell no sample lands in.
    expect(warmed).toEqual([5]);
  });

  it("counts voids instead of failing on them", async () => {
    const profile = await elevationProfile(
      surface((lon) => (lon > 0.5 ? NaN : 200)),
      [
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 },
      ],
      { samples: 11 },
    );
    expect(profile.voids).toBe(5);
    expect(profile.max).toBeCloseTo(200, 6);
  });

  it("reports NaN extremes for a line entirely off coverage", async () => {
    const profile = await elevationProfile(
      surface(() => NaN),
      [
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 },
      ],
      { samples: 5 },
    );
    expect(profile.min).toBeNaN();
    expect(profile.gain).toBe(0);
  });
});

describe("earthBulge", () => {
  it("is zero at both ends and greatest in the middle", () => {
    expect(earthBulge(0, 10000)).toBe(0);
    expect(earthBulge(10000, 10000)).toBe(0);
    expect(earthBulge(5000, 10000)).toBeGreaterThan(
      earthBulge(2500, 10000),
    );
  });

  it("matches the conventional figures", () => {
    // ~2 m at the middle of a 10 km line, ~78 m at the middle of 40 km, once
    // refraction has inflated the radius.
    expect(earthBulge(5000, 10000)).toBeCloseTo(1.7, 1);
    expect(earthBulge(20000, 40000)).toBeCloseTo(27.3, 1);
  });
});

describe("lineOfSight", () => {
  const flat = surface(() => 100);

  it("sees across flat ground", async () => {
    const result = await lineOfSight(flat, {
      from: { lon: 0, lat: 0 },
      to: { lon: 0.05, lat: 0 },
    });
    expect(result.visible).toBe(true);
    expect(result.obstruction).toBeUndefined();
    expect(result.clearance).toBeGreaterThan(0);
  });

  it("is blocked by a hill in the middle, and says by how much", async () => {
    const withHill = surface((lon) =>
      Math.abs(lon - 0.025) < 0.002 ? 400 : 100,
    );
    const result = await lineOfSight(withHill, {
      from: { lon: 0, lat: 0 },
      to: { lon: 0.05, lat: 0 },
    });

    expect(result.visible).toBe(false);
    expect(result.clearance).toBeLessThan(0);
    // The hill is at 400 m; the sight line runs from 101.7 to 101.7 (100 m of
    // ground plus a standing observer at each end) and the bulge takes half a
    // metre off it at the midpoint. So the hill rises 298.8 m above the line,
    // and that is what the observer would have to climb to see over it.
    expect(result.obstruction?.rise).toBeCloseTo(298.8, 1);
    expect(result.obstruction?.lon).toBeCloseTo(0.025, 2);
  });

  it("sees over the same hill from high enough", async () => {
    const withHill = surface((lon) =>
      Math.abs(lon - 0.025) < 0.002 ? 400 : 100,
    );
    const result = await lineOfSight(withHill, {
      from: { lon: 0, lat: 0 },
      to: { lon: 0.05, lat: 0 },
      observerHeight: 700,
      targetHeight: 0,
    });
    expect(result.visible).toBe(true);
  });

  it("lets curvature block a long shot that a flat Earth would not", async () => {
    // 60 km of dead level ground: the far end is below the horizon, and the
    // ground in the middle bulges ~60 m above the chord.
    const from = { lon: 0, lat: 0 };
    const to = { lon: 0.54, lat: 0 };
    const withCurve = await lineOfSight(flat, { from, to, observerHeight: 2 });
    const withoutCurve = await lineOfSight(flat, {
      from,
      to,
      observerHeight: 2,
      curvature: false,
    });

    expect(withCurve.visible).toBe(false);
    expect(withoutCurve.visible).toBe(true);
  });

  it("refuses to guess when either end is off coverage", async () => {
    const result = await lineOfSight(surface(() => NaN), {
      from: { lon: 0, lat: 0 },
      to: { lon: 0.05, lat: 0 },
    });
    expect(result.visible).toBe(false);
    expect(result.clearance).toBeNaN();
    expect(result.obstruction).toBeUndefined();
  });

  it("carries a chartable section, sight line included", async () => {
    const result = await lineOfSight(flat, {
      from: { lon: 0, lat: 0 },
      to: { lon: 0.05, lat: 0 },
      samples: 16,
    });
    expect(result.samples).toHaveLength(16);
    expect(result.samples[0].sightLine).toBeCloseTo(101.7, 1);
    expect(result.samples.every((s) => Number.isFinite(s.elevation))).toBe(true);
  });
});

describe("viewshed", () => {
  it("sees everything from a hilltop on flat ground", async () => {
    const result = await viewshed(surface(() => 0), {
      centre: { lon: 0, lat: 0 },
      radiusMetres: 2000,
      observerHeight: 30,
      size: 21,
    });

    const visible = [...result.cells].filter((c) => c === VIEWSHED_VISIBLE);
    const outside = [...result.cells].filter((c) => c === VIEWSHED_OUTSIDE);
    expect(visible.length).toBeGreaterThan(200);
    // The corners of the square are outside the radius.
    expect(outside.length).toBeGreaterThan(0);
    expect([...result.cells]).not.toContain(VIEWSHED_HIDDEN);
  });

  it("is blinded on one side by a ridge", async () => {
    // A wall 300 m high just east of the observer.
    const ridge = surface((lon) => (lon > 0.004 && lon < 0.006 ? 300 : 0));
    const result = await viewshed(ridge, {
      centre: { lon: 0, lat: 0 },
      radiusMetres: 3000,
      observerHeight: 2,
      size: 31,
    });

    const eastOfRidge: number[] = [];
    for (let row = 0; row < result.size; row++) {
      for (let col = 0; col < result.size; col++) {
        const lon =
          result.bounds.west +
          (col / (result.size - 1)) * (result.bounds.east - result.bounds.west);
        if (lon > 0.008) {eastOfRidge.push(result.cells[row * result.size + col]);}
      }
    }

    expect(eastOfRidge.length).toBeGreaterThan(0);
    expect(eastOfRidge.every((c) => c !== VIEWSHED_VISIBLE)).toBe(true);
    // And the western half is still visible, so this is not just "nothing".
    expect([...result.cells]).toContain(VIEWSHED_VISIBLE);
  });

  it("reports no data rather than a blank when the observer is off coverage", async () => {
    const result = await viewshed(surface(() => NaN), {
      centre: { lon: 0, lat: 0 },
      radiusMetres: 1000,
      size: 5,
    });
    expect([...result.cells].every((c) => c === VIEWSHED_NO_DATA)).toBe(true);
    expect(result.observerElevation).toBeNaN();
  });

  it("reports progress once per row", async () => {
    const onProgress = vi.fn();
    await viewshed(
      surface(() => 0),
      { centre: { lon: 0, lat: 0 }, radiusMetres: 500, size: 9 },
      onProgress,
    );
    expect(onProgress).toHaveBeenCalledTimes(9);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });
});

describe("createCellCache", () => {
  const grid = (bytes: number): HeightGrid => ({
    width: 1,
    height: bytes / 2,
    values: new Int16Array(bytes / 2),
    bounds: { west: 0, south: 0, east: 1, north: 1 },
    nodata: NaN,
  });

  it("evicts the least recently used when the budget is exceeded", () => {
    const cache = createCellCache(300);
    cache.set("a", grid(100));
    cache.set("b", grid(100));
    cache.set("c", grid(100));
    expect(cache.size).toBe(3);

    // Touching "a" makes "b" the oldest.
    cache.get("a");
    cache.set("d", grid(100));

    expect(cache.has("b")).toBe(false);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("d")).toBe(true);
    expect(cache.bytes).toBe(300);
  });

  it("prices by bytes, not by count", () => {
    const cache = createCellCache(1000);
    cache.set("big", grid(900));
    cache.set("small", grid(200));
    // One cell of each: the small one does not get to stay just because there
    // are only two.
    expect(cache.has("big")).toBe(false);
    expect(cache.bytes).toBe(200);
  });

  it("keeps a single cell larger than the whole budget", () => {
    // Evicting it immediately would mean never being able to answer a question
    // about that cell at all.
    const cache = createCellCache(100);
    cache.set("huge", grid(1000));
    expect(cache.has("huge")).toBe(true);
  });

  it("replaces an entry without double-counting it", () => {
    const cache = createCellCache(1000);
    cache.set("a", grid(100));
    cache.set("a", grid(200));
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(200);
  });

  it("forgets everything on clear", () => {
    const cache = createCellCache(1000);
    cache.set("a", grid(100));
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
  });
});
