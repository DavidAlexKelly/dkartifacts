import { describe, expect, it } from "vitest";

import {
  LARGE_LANE_LIMIT,
  SMALL_LANE_LIMIT,
  createLane,
  isLargeFilePath,
} from "./lanes";

describe("createLane", () => {
  it("admits up to the limit immediately", async () => {
    const lane = createLane("test", 2);
    await lane.acquire();
    await lane.acquire();

    expect(lane.stats).toEqual({ active: 2, queued: 0, limit: 2 });
  });

  it("queues beyond the limit and admits on release, in order", async () => {
    const lane = createLane("test", 1);
    await lane.acquire();

    const order: string[] = [];
    const second = lane.acquire().then(() => order.push("second"));
    const third = lane.acquire().then(() => order.push("third"));

    expect(lane.stats.queued).toBe(2);
    expect(order).toEqual([]);

    lane.release();
    await second;
    expect(order).toEqual(["second"]);
    expect(lane.stats).toEqual({ active: 1, queued: 1, limit: 1 });

    lane.release();
    await third;
    expect(order).toEqual(["second", "third"]);
  });

  it("ignores a release when nothing is active", async () => {
    // A double release would drive `active` negative and silently raise the
    // effective limit for the rest of the session — the sort of bug that only
    // shows up as "why are there 30 concurrent downloads".
    const lane = createLane("test", 1);
    lane.release();
    lane.release();

    expect(lane.stats.active).toBe(0);

    await lane.acquire();
    expect(lane.stats.active).toBe(1);

    // Still exactly at the limit: the next acquire must queue.
    let admitted = false;
    void lane.acquire().then(() => {
      admitted = true;
    });
    await Promise.resolve();
    expect(admitted).toBe(false);
    expect(lane.stats.queued).toBe(1);
  });

  it("returns to idle once every holder releases", async () => {
    const lane = createLane("test", 2);
    await lane.acquire();
    await lane.acquire();
    lane.release();
    lane.release();

    expect(lane.stats).toEqual({ active: 0, queued: 0, limit: 2 });
  });
});

describe("isLargeFilePath", () => {
  it("classifies PMTiles archives as archives", () => {
    expect(isLargeFilePath("z0-z6.pmtiles")).toBe(true);
    expect(isLargeFilePath("z12/c164_r080.pmtiles")).toBe(true);
    expect(isLargeFilePath("Z12/C164_R080.PMTILES")).toBe(true);
  });

  it("classifies GeoTIFF cells as archives, because they are large", () => {
    // The lane is a SIZE class, not a file format. @acc/decho-elevation streams
    // 2° DEM cells and baked hillshade cells through this byte layer at 3-25 MB
    // each, and while `.tif` fell through to the asset lane those ran six at a
    // time in the lane sized for 20 KB glyphs — so the labels for tiles already
    // on screen queued behind half a dozen multi-megabyte transfers.
    expect(isLargeFilePath("c089_r016.tif")).toBe(true);
    expect(isLargeFilePath("elevation/c089_r016.tiff")).toBe(true);
    expect(isLargeFilePath("C089_R016.TIF")).toBe(true);
  });

  it("classifies glyphs, sprites and manifests as assets", () => {
    expect(isLargeFilePath("manifest.json")).toBe(false);
    expect(isLargeFilePath("fonts/Noto Sans Regular/0-255.pbf")).toBe(false);
    expect(isLargeFilePath("sprites/light.png")).toBe(false);
    // Only the extension counts, not the word appearing mid-path.
    expect(isLargeFilePath("pmtiles/manifest.json")).toBe(false);
  });
});

describe("lane limits", () => {
  it("gives archives a smaller budget than small assets", () => {
    // The point of two lanes: a 25 MB archive must not be able to starve a
    // 20 KB glyph range, so assets get the wider lane.
    expect(SMALL_LANE_LIMIT).toBeGreaterThan(LARGE_LANE_LIMIT);
  });
});
