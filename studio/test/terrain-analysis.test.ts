import { describe, expect, it } from "vitest";
import { area as turfArea, booleanPointInPolygon, point } from "@turf/turf";
import { createHeightSource, heightsToTerrarium, type HeightSource, type TerrainLibrary } from "../src/analysis/heightgrid";
import { lineOfSight, slopeAspect, viewshed, zonalStats } from "../src/analysis/terrain";
import { aspectColor, ASPECT_LEGEND, borderedHeights, derivedTileRgba, parseDerivedUrl, SLOPE_CLASSES, slopeSource } from "../src/analysis/derivedtiles";

const CIRC = 40075016.686;
const RAD = Math.PI / 180;
type HeightFn = (lon: number, lat: number) => number;

/**
 * A fake terrain pyramid: tile bytes just carry z/x/y, and the injected
 * decoder renders `fn` at the pixel centres as Terrarium RGBA.
 */
function synthetic(fn: HeightFn | null, opts: { maxZoom?: number; size?: number; present?: (z: number, x: number, y: number) => boolean } = {}) {
  const size = opts.size ?? 256;
  let decoded = 0;
  const library: TerrainLibrary = {
    async manifest() {
      return {};
    },
    resolver() {
      return { minZoom: 0, maxZoom: opts.maxZoom ?? 12 };
    },
    async tile(_id, z, x, y) {
      if (!fn || (opts.present && !opts.present(z, x, y))) {return null;}
      return new Int32Array([z, x, y]).buffer;
    },
  };
  const decode = async (bytes: ArrayBuffer) => {
    decoded++;
    const [z, x, y] = new Int32Array(bytes);
    const n = 2 ** z;
    const h = new Float32Array(size * size);
    for (let r = 0; r < size; r++) {
      const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + (r + 0.5) / size)) / n))) / RAD;
      for (let c = 0; c < size; c++) {
        const lon = ((x + (c + 0.5) / size) / n) * 360 - 180;
        h[r * size + c] = fn!(lon, lat);
      }
    }
    return heightsToTerrarium(h, size, size);
  };
  return { library, decode, decodedCount: () => decoded };
}

async function source(fn: HeightFn | null, opts: Parameters<typeof synthetic>[1] = {}): Promise<HeightSource> {
  const s = synthetic(fn, opts);
  return createHeightSource(s.library, "terrain", { decode: s.decode });
}

const eastM = (lon: number, lat: number) => (lon / 360) * CIRC * Math.cos(lat * RAD);

describe("height source", () => {
  it("decodes Terrarium and interpolates bilinearly, across tile edges", async () => {
    const src = await source((lon) => 500 + 1000 * lon);
    expect(src.maxZoom).toBe(12);
    for (const lon of [0.01, 0.0439, 0.08789, 0.1234]) {
      expect(await src.heightAt(lon, 0.01)).toBeCloseTo(500 + 1000 * lon, 1);
    }
    const hs = await src.heightsAlong([[0.02, 0], [Number.NaN, 0], [0.05, 0.05]]);
    expect(hs[0]).toBeCloseTo(520, 1);
    expect(hs[1]).toBeNull();
    expect(hs[2]).toBeCloseTo(550, 1);
    expect(src.tileSize).toBe(256);
  });

  it("reads missing tiles as sea level", async () => {
    const src = await source(null);
    expect(await src.heightAt(10, 10)).toBe(0);
    expect(await src.tileHeights(12, 1, 1)).toBeNull();
  });

  it("decodes each tile once while it is cached", async () => {
    const s = synthetic(() => 100);
    const src = await createHeightSource(s.library, "t", { decode: s.decode });
    await src.heightsAlong([[0.01, 0.01], [0.012, 0.012]]);
    await src.heightAt(0.011, 0.011);
    expect(s.decodedCount()).toBe(1);
  });
});

describe("line of sight", () => {
  // A 200 m wall about 2.2 km east of the origin, running north-south.
  const wall: HeightFn = (lon) => (lon > 0.02 && lon < 0.021 ? 200 : 0);

  it("is blocked by a wall and says where", async () => {
    const src = await source(wall);
    const r = await lineOfSight(src, [0, 0], [0.04, 0]);
    expect(r.visible).toBe(false);
    expect(r.blockedAt).toBeDefined();
    expect(r.blockedAt!.lon).toBeGreaterThan(0.0195);
    expect(r.blockedAt!.lon).toBeLessThan(0.0215);
    expect(r.blockedAt!.distanceM).toBeGreaterThan(2150);
    expect(r.blockedAt!.distanceM).toBeLessThan(2400);
    expect(r.profile).toHaveLength(256);
    // Visible up to and including the wall's face, hidden behind it.
    expect(r.visibleSegments.length).toBeGreaterThanOrEqual(1);
    expect(r.visibleSegments[0][0]).toBe(0);
    const lastVisible = Math.max(...r.visibleSegments.map((s) => s[1]));
    expect(lastVisible).toBeLessThan(2400);
    expect(lastVisible).toBeGreaterThan(2100);
  });

  it("sees in front of the wall, and over it from high enough", async () => {
    const src = await source(wall);
    expect((await lineOfSight(src, [0, 0], [0.015, 0])).visible).toBe(true);
    expect((await lineOfSight(src, [0, 0], [0.04, 0], { observerHeightM: 500 })).visible).toBe(true);
    // A tall target behind the wall shows over it.
    expect((await lineOfSight(src, [0, 0], [0.04, 0], { targetHeightM: 400 })).visible).toBe(true);
  });

  it("is hidden by the curve of the earth at long range", async () => {
    const sea = await source(null);
    const tenKm = [0.0898, 0] as [number, number];
    const curved = await lineOfSight(sea, [0, 0], tenKm, { observerHeightM: 2 });
    expect(curved.visible).toBe(false);
    // The horizon of a 2 m eye with k = 0.13 is sqrt(2 R h / (1 - k)) ≈ 5.4 km.
    const hidden = curved.visibleSegments[0][1];
    expect(hidden).toBeGreaterThan(5000);
    expect(hidden).toBeLessThan(5800);
    expect((await lineOfSight(sea, [0, 0], tenKm, { earthCurvature: false })).visible).toBe(true);
    // A 10 m mast at 10 km stands above the horizon (2 m eye + 10 m target ≈ 17.5 km).
    expect((await lineOfSight(sea, [0, 0], tenKm, { targetHeightM: 10 })).visible).toBe(true);
    // Refraction lengthens the horizon: without it a 5.2 km target is hidden.
    const fiveKm = [0.0467, 0] as [number, number];
    expect((await lineOfSight(sea, [0, 0], fiveKm, { refraction: 0.13 })).visible).toBe(true);
    expect((await lineOfSight(sea, [0, 0], fiveKm, { refraction: 0 })).visible).toBe(false);
  });
});

describe("viewshed", () => {
  const inside = (fc: Awaited<ReturnType<typeof viewshed>>, lon: number, lat: number) =>
    fc.features.some((f) => booleanPointInPolygon(point([lon, lat]), f));

  it("sees the whole disc on a flat plane", async () => {
    const src = await source(() => 100);
    const v = await viewshed(src, [0.01, 0.01], { radiusM: 2000 });
    expect(v.stats.visibleAreaM2 / v.stats.totalAreaM2).toBeCloseTo(1, 6);
    expect(v.features).toHaveLength(1);
    const polys = v.features[0].geometry.coordinates;
    expect(polys).toHaveLength(1);
    expect(polys[0]).toHaveLength(1); // no holes
    expect(turfArea(v.features[0]) / v.stats.totalAreaM2).toBeCloseTo(1, 2);
    expect(inside(v, 0.01, 0.01)).toBe(true);
    expect(inside(v, 0.02, 0.01)).toBe(true);
  });

  it("hides the sector behind a wall", async () => {
    // Wall 100 m high, ~1.1 km east, 11 km long.
    const src = await source((lon, lat) => (lon > 0.01 && lon < 0.0105 && Math.abs(lat) < 0.05 ? 100 : 0));
    const v = await viewshed(src, [0, 0], { radiusM: 3000, rays: 360 });
    const frac = v.stats.visibleAreaM2 / v.stats.totalAreaM2;
    // The disc east of x ≈ 1.17 km is a circular segment of ~26% of the disc.
    expect(frac).toBeGreaterThan(0.68);
    expect(frac).toBeLessThan(0.8);
    expect(turfArea(v.features[0]) / v.stats.visibleAreaM2).toBeCloseTo(1, 1);
    expect(inside(v, -0.02, 0)).toBe(true);
    expect(inside(v, 0.005, 0.01)).toBe(true);
    expect(inside(v, 0.02, 0)).toBe(false);
    expect(inside(v, 0.015, 0.005)).toBe(false);
  });

  it("traces hidden pockets as holes", async () => {
    // A short 30 m wall at ~1 km hides a pocket; a hillside rising beyond it is seen again.
    const src = await source((lon, lat) => (lon >= 0.0135 ? 200 + (lon - 0.0135) * 1e5 : lon > 0.009 && lon < 0.0095 && Math.abs(lat) < 0.003 ? 30 : 0));
    const v = await viewshed(src, [0, 0], { radiusM: 2500 });
    const polys = v.features[0].geometry.coordinates;
    const holes = polys.reduce((n, p) => n + p.length - 1, 0);
    expect(holes).toBeGreaterThanOrEqual(1);
    expect(inside(v, 0.011, 0)).toBe(false); // in the pocket
    expect(inside(v, 0.016, 0)).toBe(true); // hillside
    expect(inside(v, 0.011, 0.008)).toBe(true); // beside the wall
  });

  it("does 5 km at 360 rays quickly", async () => {
    const cone: HeightFn = (lon, lat) => Math.max(0, 400 - Math.hypot(eastM(lon - 0.02, lat), eastM(lat - 0.01, 0)) * 0.2);
    for (const maxZoom of [12, 14]) {
      const src = await source(cone, { maxZoom });
      await viewshed(src, [0, 0], { radiusM: 5000 }); // warm: decode the tiles
      const t0 = performance.now();
      const v = await viewshed(src, [0, 0], { radiusM: 5000, rays: 360 });
      const ms = performance.now() - t0;
      console.log(`viewshed z${maxZoom}: ${v.stats.rings} rings x 360 rays in ${ms.toFixed(0)} ms (tiles cached), visible ${(100 * v.stats.visibleAreaM2 / v.stats.totalAreaM2).toFixed(1)}%`);
      expect(ms).toBeLessThan(3000);
      expect(v.stats.visibleAreaM2).toBeLessThan(v.stats.totalAreaM2);
      expect(v.stats.visibleAreaM2).toBeGreaterThan(0.5 * v.stats.totalAreaM2);
    }
  });
});

describe("zonal stats", () => {
  it("summarises a known plane", async () => {
    const src = await source((lon) => 500 + 1000 * lon);
    const square = { type: "Polygon" as const, coordinates: [[[0.01, 0], [0.03, 0], [0.03, 0.02], [0.01, 0.02], [0.01, 0]]] };
    const s = await zonalStats(src, square);
    expect(s.count).toBeGreaterThan(1000);
    expect(s.count).toBeLessThanOrEqual(21000);
    expect(s.mean).toBeCloseTo(520, 0);
    expect(s.min).toBeGreaterThan(509.9);
    expect(s.min).toBeLessThan(511);
    expect(s.max).toBeLessThan(530.1);
    expect(s.max).toBeGreaterThan(529);
    expect(s.stdev).toBeCloseTo(20 / Math.sqrt(12), 1);
    expect(s.areaM2 / (2226 * 2226)).toBeCloseTo(1, 1);
  });

  it("respects holes and an explicit cell size", async () => {
    const src = await source((lon) => 500 + 1000 * lon);
    const withHole = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [[0.01, 0], [0.03, 0], [0.03, 0.02], [0.01, 0.02], [0.01, 0]],
          [[0.015, 0.005], [0.015, 0.015], [0.025, 0.015], [0.025, 0.005], [0.015, 0.005]],
        ],
      },
    };
    const s = await zonalStats(src, withHole, { cellM: 50 });
    expect(s.cellM).toBe(50);
    // 3/4 of a 2.2 km square at 50 m cells.
    expect(s.count / ((0.75 * 2226 * 2226) / 2500)).toBeCloseTo(1, 1);
    expect(s.mean).toBeCloseTo(520, 0);
  });
});

describe("slope and aspect", () => {
  const z = 12;
  const y = 2048; // just south of the equator
  const size = 64;
  const W = size + 2;
  /** Pixel ground size of a bordered-grid row (row 0 is the border above tile row 0). */
  const cs = (r: number) => {
    const n = 2 ** z;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + (r - 1 + 0.5) / size)) / n)));
    return (CIRC / (size * n)) * Math.cos(lat);
  };
  const grid = (f: (r: number, c: number) => number) => {
    const h = new Float32Array(W * W);
    for (let r = 0; r < W; r++) {for (let c = 0; c < W; c++) {h[r * W + c] = f(r, c);}}
    return h;
  };

  it("measures a 45° ramp as 45°, facing away from its rise", async () => {
    const east = slopeAspect(grid((r, c) => c * cs(r)), size, z, y);
    const north = slopeAspect(grid((r) => (W - r) * cs(r)), size, z, y);
    const sw = slopeAspect(grid((r, c) => (c - r) * cs(r)), size, z, y); // rises NE
    for (const i of [0, 100, size * size - 1]) {
      expect(east.slopeDeg[i]).toBeCloseTo(45, 1);
      expect(east.aspectDeg[i]).toBeCloseTo(270, 1); // rises east → faces west
      expect(north.slopeDeg[i]).toBeCloseTo(45, 0);
      expect(north.aspectDeg[i]).toBeCloseTo(180, 0); // rises north → faces south
      expect(sw.aspectDeg[i]).toBeCloseTo(225, 0);
    }
    const west = slopeAspect(grid((r, c) => -c * cs(r) * Math.tan(10 * RAD)), size, z, y);
    expect(west.slopeDeg[50]).toBeCloseTo(10, 1);
    expect(west.aspectDeg[50]).toBeCloseTo(90, 1);
  });

  it("marks flat ground as aspect -1", () => {
    const flat = slopeAspect(grid(() => 123), size, z, y);
    expect(flat.slopeDeg[10]).toBe(0);
    expect(flat.aspectDeg[10]).toBe(-1);
  });
});

describe("derived tiles", () => {
  // 35° ramp rising east: red slope class, aspect facing west.
  const ramp: HeightFn = (lon, lat) => 10000 + Math.tan(35 * RAD) * eastM(lon, lat);
  const red = SLOPE_CLASSES[3].color;
  const px = (rgba: Uint8ClampedArray, i: number) => Array.from(rgba.subarray(i * 4, i * 4 + 4));

  it("colours slope classes, at and above the pyramid's max zoom", async () => {
    const src = await source(ramp, { maxZoom: 12 });
    const tx = 2048, ty = 2047;
    const at = (await derivedTileRgba(src, "slope", 12, tx, ty))!;
    expect(px(at, 128 * 256 + 128)).toEqual(red);
    expect(px(at, 0)).toEqual(red); // borders come from neighbours: no seam
    const over = (await derivedTileRgba(src, "slope", 14, tx * 4 + 1, ty * 4 + 2))!;
    expect(px(over, 128 * 256 + 128)).toEqual(red);
    expect(px(over, 255)).toEqual(red);
    const flat = (await derivedTileRgba(await source(() => 50), "slope", 12, tx, ty))!;
    expect(px(flat, 1000)).toEqual(SLOPE_CLASSES[0].color);
  });

  it("repeats the edge where a neighbour is missing, instead of a cliff", async () => {
    const tx = 2048, ty = 2047;
    const src = await source(() => 3000, { present: (z, x, y) => z === 12 && x === tx && y === ty });
    const rgba = (await derivedTileRgba(src, "slope", 12, tx, ty))!;
    for (const i of [0, 255, 255 * 256, 256 * 256 - 1]) {expect(px(rgba, i)).toEqual(SLOPE_CLASSES[0].color);}
    const b = (await borderedHeights(src, 12, tx, ty))!;
    expect(b[0]).toBeCloseTo(3000, 2);
  });

  it("colours aspect as a hue wheel and leaves flat ground transparent", async () => {
    const src = await source(ramp);
    const rgba = (await derivedTileRgba(src, "aspect", 12, 2048, 2047))!;
    expect(px(rgba, 300)).toEqual(aspectColor(270));
    expect(await derivedTileRgba(await source(() => 50), "aspect", 12, 2048, 2047)).toBeNull();
    expect(ASPECT_LEGEND.map((e) => e.label)).toEqual(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
  });

  it("builds raster sources and parses their URLs", () => {
    const s = slopeSource("ri.foundry.main.dataset/x y", 12);
    expect(s).toMatchObject({ type: "raster", tileSize: 256, maxzoom: 14 });
    const url = (s as { tiles: string[] }).tiles[0].replace("{z}", "13").replace("{x}", "5").replace("{y}", "7");
    expect(parseDerivedUrl(url)).toEqual({ kind: "slope", terrainId: "ri.foundry.main.dataset/x y", z: 13, x: 5, y: 7 });
  });
});
