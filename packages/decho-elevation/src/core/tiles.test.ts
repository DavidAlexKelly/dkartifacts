import { describe, expect, it } from "vitest";

import {
  latAtTileY,
  lonAtTileX,
  metresPerPixel,
  resampleTile,
  tileBounds,
} from "./mercator";
import { encodePng, crc32 } from "./png";
import {
  CONTOUR_COLOUR,
  DEFAULT_NEUTRAL_SHADE,
  HYPSOMETRIC_STOPS,
  MOBILITY_SLOPE_CLASSES,
  contourTile,
  hypsometricTile,
  intervalForZoom,
  rampColour,
  shadedReliefTile,
  slopeTile,
  terrariumTile,
  type TileFrame,
} from "./renderers";
import { decodeTerrarium, writeTerrarium } from "./terrarium";

describe("mercator", () => {
  it("puts tile 0/0/0 around the whole world", () => {
    const bounds = tileBounds(0, 0, 0);
    expect(bounds.west).toBe(-180);
    expect(bounds.east).toBe(180);
    expect(bounds.north).toBeCloseTo(85.0511, 3);
    expect(bounds.south).toBeCloseTo(-85.0511, 3);
  });

  it("splits into quadrants at zoom 1", () => {
    expect(lonAtTileX(1, 1)).toBe(0);
    expect(latAtTileY(1, 1)).toBeCloseTo(0, 9);
  });

  it("reports the familiar ground resolution at the equator", () => {
    // The canonical figure for a 256-pixel tile at zoom 0. It follows from
    // WGS84's semi-major axis, which is why mercator.ts uses that and not the
    // mean radius the rest of the package measures distances with.
    expect(metresPerPixel(0, 0, 256)).toBeCloseTo(156543.03, 1);
    expect(metresPerPixel(10, 0, 256)).toBeCloseTo(156543.03 / 1024, 2);
  });

  it("shrinks ground resolution towards the poles", () => {
    expect(metresPerPixel(10, 60, 256)).toBeCloseTo(
      metresPerPixel(10, 0, 256) / 2,
      2,
    );
  });

  it("samples pixel centres, in row-major order from the top-left", () => {
    const seen: Array<[number, number]> = [];
    resampleTile(2, 1, 1, 2, (lon, lat) => {
      seen.push([lon, lat]);
      return 0;
    });

    expect(seen).toHaveLength(4);
    const bounds = tileBounds(2, 1, 1);
    // First sample is a quarter of the way in, not on the corner: sampling the
    // corner shifts the whole raster half a pixel north-west.
    expect(seen[0][0]).toBeGreaterThan(bounds.west);
    expect(seen[0][1]).toBeLessThan(bounds.north);
    // Longitude increases along a row; latitude decreases down the rows.
    expect(seen[1][0]).toBeGreaterThan(seen[0][0]);
    expect(seen[2][1]).toBeLessThan(seen[0][1]);
  });
});

describe("terrarium", () => {
  it("round-trips heights to within the encoding's own resolution", () => {
    const rgba = new Uint8Array(4);
    for (const height of [-420, 0, 1.5, 8848, 100.00390625, -32768, 32767]) {
      writeTerrarium(rgba, 0, height);
      expect(decodeTerrarium(rgba[0], rgba[1], rgba[2])).toBeCloseTo(
        height,
        2,
      );
    }
  });

  it("writes an opaque pixel", () => {
    const rgba = new Uint8Array(4);
    writeTerrarium(rgba, 0, 100);
    expect(rgba[3]).toBe(255);
  });

  it("puts voids at sea level rather than at the sentinel", () => {
    // raster-dem does not read alpha, so a void must be given a height, and 0
    // is the only defensible one — the voids in this DEM are water. Leaving it
    // at -32768 tears a hole through the mesh at every coastline.
    const rgba = new Uint8Array(4);
    writeTerrarium(rgba, 0, NaN);
    expect(decodeTerrarium(rgba[0], rgba[1], rgba[2])).toBe(0);
  });

  it("clamps rather than wrapping an absurd height", () => {
    const rgba = new Uint8Array(4);
    writeTerrarium(rgba, 0, 1e9);
    expect(decodeTerrarium(rgba[0], rgba[1], rgba[2])).toBeLessThan(32768);
    writeTerrarium(rgba, 0, -1e9);
    expect(decodeTerrarium(rgba[0], rgba[1], rgba[2])).toBe(-32768);
  });
});

const frame = (heights: number[], size: number): TileFrame => ({
  heights: Float32Array.from(heights),
  size,
  z: 11,
  x: 0,
  y: 0,
  metresPerPixel: 30,
});

describe("renderers", () => {
  it("encodes every pixel of a terrarium tile", () => {
    const rgba = terrariumTile(frame([0, 100, 200, 300], 2));
    expect(rgba).toHaveLength(16);
    expect(decodeTerrarium(rgba[4], rgba[5], rgba[6])).toBeCloseTo(100, 2);
  });

  it("interpolates the hypsometric ramp and clamps at both ends", () => {
    expect(rampColour(HYPSOMETRIC_STOPS, -100)).toEqual(
      HYPSOMETRIC_STOPS[0].colour,
    );
    expect(rampColour(HYPSOMETRIC_STOPS, 99999)).toEqual(
      HYPSOMETRIC_STOPS[HYPSOMETRIC_STOPS.length - 1].colour,
    );

    const midpoint = rampColour(HYPSOMETRIC_STOPS, 100);
    const low = HYPSOMETRIC_STOPS[0].colour;
    const high = HYPSOMETRIC_STOPS[1].colour;
    expect(midpoint[0]).toBeCloseTo((low[0] + high[0]) / 2, 0);
  });

  it("leaves voids transparent in a tint", () => {
    const rgba = hypsometricTile({ opacity: 1 })(frame([NaN, 500], 1));
    expect(rgba[3]).toBe(0);
  });

  it("classifies slope into the mobility bands", () => {
    // 30 m pixels with a 30 m rise per pixel is a slope of 1.0 across the
    // middle column: comfortably no-go.
    const steep = slopeTile()(frame([0, 0, 0, 0, 30, 60, 0, 0, 0], 3));
    const centre = (1 * 3 + 1) * 4;
    const noGo = MOBILITY_SLOPE_CLASSES[MOBILITY_SLOPE_CLASSES.length - 1];
    expect([steep[centre], steep[centre + 1], steep[centre + 2]]).toEqual([
      noGo.colour[0],
      noGo.colour[1],
      noGo.colour[2],
    ]);
  });

  it("leaves trafficable ground unshaded", () => {
    const flat = slopeTile()(frame([100, 100, 100, 100, 100, 100, 100, 100, 100], 3));
    expect([...flat]).toEqual(new Array(9 * 4).fill(0));
  });
});

describe("baked shaded relief", () => {
  const alphaOf = (rgba: Uint8Array, i: number) => rgba[i * 4 + 3];

  it("leaves flat ground completely alone", () => {
    // The whole point of painting the departure from neutral rather than the
    // value: a grey sheet over the map drains every colour under it.
    const flat = shadedReliefTile()(
      frame([DEFAULT_NEUTRAL_SHADE, DEFAULT_NEUTRAL_SHADE], 1),
    );
    expect([...flat]).toEqual(new Array(1 * 1 * 4).fill(0));
  });

  it("darkens below neutral and lightens above it", () => {
    const tile = shadedReliefTile({ shadow: 1, highlight: 1 })(
      frame([0.5 * DEFAULT_NEUTRAL_SHADE, 255, DEFAULT_NEUTRAL_SHADE, 255], 2),
    );

    // Half way to black: half the shadow strength.
    expect(alphaOf(tile, 0)).toBeCloseTo(255 * 0.5, -1);
    expect(tile[0]).toBeLessThan(128);
    // Fully lit: full highlight strength, and a light colour.
    expect(alphaOf(tile, 1)).toBe(255);
    expect(tile[1 * 4]).toBeGreaterThan(200);
  });

  it("honours the strengths separately", () => {
    const shadowsOnly = shadedReliefTile({ shadow: 0.5, highlight: 0 })(
      frame([0, 255, 90, 255], 2),
    );
    // Lit ground contributes nothing when the highlight is off.
    expect(alphaOf(shadowsOnly, 1)).toBe(0);
    expect(alphaOf(shadowsOnly, 2)).toBeGreaterThan(0);
  });

  it("leaves nodata transparent rather than black", () => {
    // gdaldem reserves 0 for nodata and shifts real shading into 1-255, so the
    // store turns those into NaN — and a black border on every cell is what
    // painting them would look like.
    const voids = shadedReliefTile()(frame([NaN, 90], 1));
    expect(alphaOf(voids, 0)).toBe(0);
  });

  it("survives a bake with the sun overhead", () => {
    // neutral 255 would divide by zero working out the lit range.
    const tile = shadedReliefTile({ neutral: 255 })(frame([255, 128], 1));
    expect(alphaOf(tile, 0)).toBe(0);
    expect(Number.isFinite(tile[3])).toBe(true);
  });
});

describe("contours", () => {
  /**
   * A ramp climbing `rise` metres per pixel, left to right.
   *
   * 2.5 m per pixel against a 10 m interval puts a contour every FOUR pixels,
   * which is what makes these tests spatial: pixel 0 is on a line, pixel 1 is
   * one pixel from it, pixel 2 is midway between two. A ramp of 10 m per pixel
   * would put every pixel exactly on a contour and assert nothing.
   */
  const ramp = (size: number, rise: number, base = 0) =>
    Array.from({ length: size * size }, (_, i) => base + (i % size) * rise);

  const alphaAt = (rgba: Uint8Array, size: number, col: number, row = 0) =>
    rgba[(row * size + col) * 4 + 3];

  it("takes the interval from the zoom, coarse to fine", () => {
    // A contour interval is fixed in metres but read in pixels, so one
    // interval cannot serve every zoom.
    expect(intervalForZoom(16)).toBe(10);
    expect(intervalForZoom(14)).toBe(10);
    expect(intervalForZoom(13)).toBe(25);
    expect(intervalForZoom(12)).toBe(25);
    expect(intervalForZoom(11)).toBe(100);
    expect(intervalForZoom(0)).toBe(100);
  });

  it("takes a ladder of its own", () => {
    const ladder = [
      { minZoom: 15, interval: 5 },
      { minZoom: 0, interval: 50 },
    ];
    expect(intervalForZoom(15, ladder)).toBe(5);
    expect(intervalForZoom(14, ladder)).toBe(50);
  });

  it("draws a line where the ground crosses a multiple of the interval", () => {
    const rgba = contourTile({ interval: 10 })(frame(ramp(12, 2.5), 12));
    // On the 0 m and 10 m lines.
    expect(alphaAt(rgba, 12, 0)).toBeGreaterThan(0);
    expect(alphaAt(rgba, 12, 4)).toBeGreaterThan(0);
    expect(alphaAt(rgba, 12, 8)).toBeGreaterThan(0);
  });

  it("leaves the ground between contours clear", () => {
    // The hairline test: two pixels from a line is blank, or the lines are
    // fences rather than contours.
    const rgba = contourTile({ interval: 10 })(frame(ramp(12, 2.5), 12));
    expect(alphaAt(rgba, 12, 2)).toBe(0);
    expect(alphaAt(rgba, 12, 6)).toBe(0);
  });

  it("draws a hairline by default and widens on request", () => {
    const heights = ramp(12, 2.5);
    const hairline = contourTile({ interval: 10, indexEvery: 0 })(
      frame(heights, 12),
    );
    const fat = contourTile({ interval: 10, indexEvery: 0, width: 4 })(
      frame(heights, 12),
    );

    // One pixel out from the line: nothing at the default weight, something at
    // four pixels wide.
    expect(alphaAt(hairline, 12, 1)).toBe(0);
    expect(alphaAt(fat, 12, 1)).toBeGreaterThan(0);
  });

  it("draws nothing at all on flat ground", () => {
    // The gradient is the denominator: on a plain the distance to the nearest
    // contour is infinite, which is the correct answer and not "every contour
    // at once".
    const flat = contourTile()(frame(new Array(16).fill(250), 4));
    expect([...flat]).toEqual(new Array(16 * 4).fill(0));
  });

  it("draws index contours heavier than the rest", () => {
    // Every fifth line by convention — the ones a reader counts from. With a
    // 10 m interval that is 0 m and 50 m; 10 m is an ordinary line. Compared
    // one pixel OUT from each, which is where a difference in weight shows:
    // both lines are solid at their centre.
    const rgba = contourTile({ interval: 10, indexEvery: 5 })(
      frame(ramp(12, 2.5), 12),
    );
    expect(alphaAt(rgba, 12, 1)).toBeGreaterThan(0); // beside the 0 m index
    expect(alphaAt(rgba, 12, 5)).toBe(0); // beside the 10 m ordinary
  });

  it("can be told not to draw index contours", () => {
    const plain = contourTile({ interval: 10, indexEvery: 0 })(
      frame(ramp(12, 2.5), 12),
    );
    expect(alphaAt(plain, 12, 0)).toBe(alphaAt(plain, 12, 4));
    expect(alphaAt(plain, 12, 1)).toBe(alphaAt(plain, 12, 5));
  });

  it("keeps its width in pixels as the ground stretches", () => {
    // The reason the width is expressed in pixels rather than metres: the same
    // hillside at a coarser ground resolution must not draw thinner lines.
    //
    // indexEvery: 0 matters here. The two ramps put their 0 m line in the same
    // place but their 10 m line at different pixels, so with index contours on,
    // the pixel being compared is beside an INDEX line in one case and an
    // ordinary line in the other — a difference in weight that has nothing to
    // do with what this test is about.
    const fine = contourTile({ interval: 10, width: 4, indexEvery: 0 })({
      heights: new Float32Array(ramp(8, 2.5)),
      size: 8,
      z: 14,
      x: 0,
      y: 0,
      metresPerPixel: 30,
    });
    const coarse = contourTile({ interval: 10, width: 4, indexEvery: 0 })({
      // Twice the rise per pixel over twice the ground: the same hillside.
      heights: new Float32Array(ramp(8, 5)),
      size: 8,
      z: 14,
      x: 0,
      y: 0,
      metresPerPixel: 60,
    });
    expect(alphaAt(fine, 8, 1)).toBe(alphaAt(coarse, 8, 1));
  });

  it("leaves voids alone", () => {
    const heights = ramp(8, 2.5);
    heights[0] = NaN;
    const rgba = contourTile({ interval: 10 })(frame(heights, 8));
    expect(alphaAt(rgba, 8, 0)).toBe(0);
  });

  it("prints in bistre, the colour a topographic sheet uses", () => {
    const rgba = contourTile({ interval: 10 })(frame(ramp(8, 2.5), 8));
    expect([rgba[0], rgba[1], rgba[2]]).toEqual([
      CONTOUR_COLOUR[0],
      CONTOUR_COLOUR[1],
      CONTOUR_COLOUR[2],
    ]);
  });
});

describe("encodePng", () => {
  it("writes a valid 8-bit RGBA PNG", async () => {
    const rgba = new Uint8Array(2 * 2 * 4).fill(7);
    const png = await encodePng(rgba, 2, 2);

    expect([...png.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    // Length, then type, then the 13-byte IHDR.
    expect(view.getUint32(8)).toBe(13);
    expect(String.fromCharCode(...png.subarray(12, 16))).toBe("IHDR");
    expect(view.getUint32(16)).toBe(2);
    expect(view.getUint32(20)).toBe(2);
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(6); // truecolour with alpha

    // The CRC follows the 13 data bytes, and covers the type and the data but
    // not the length: 8 signature + 4 length + 4 type + 13 data = 29.
    expect(view.getUint32(29)).toBe(crc32(png.subarray(12, 29)));
    expect(String.fromCharCode(...png.subarray(png.length - 8, png.length - 4))).toBe(
      "IEND",
    );
  });

  it("round-trips the pixels through the zlib stream", async () => {
    const rgba = Uint8Array.from([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255,
    ]);
    const png = await encodePng(rgba, 2, 2);

    // Find IDAT, inflate it, and check the scanlines came out as written with
    // a filter byte in front of each.
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    let at = 8;
    let idat: Uint8Array | null = null;
    while (at < png.length) {
      const length = view.getUint32(at);
      const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
      if (type === "IDAT") {
        idat = png.subarray(at + 8, at + 8 + length);
        break;
      }
      at += 12 + length;
    }
    expect(idat).not.toBeNull();

    const inflated = new Uint8Array(
      await new Response(
        new Blob([idat as unknown as BlobPart])
          .stream()
          .pipeThrough(new DecompressionStream("deflate")),
      ).arrayBuffer(),
    );

    expect([...inflated]).toEqual([
      0, 1, 2, 3, 255, 4, 5, 6, 255,
      0, 7, 8, 9, 255, 10, 11, 12, 255,
    ]);
  });

  it("refuses a buffer that is not the size it claims", async () => {
    await expect(encodePng(new Uint8Array(3), 2, 2)).rejects.toThrow(
      /expected 16/,
    );
  });
});
