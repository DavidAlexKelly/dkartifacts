import { describe, expect, it } from "vitest";

import { decodeGeoTiff } from "./geotiff.js";
import type { CellBounds } from "./grid.js";
import { sampleHeight } from "./heightGrid.js";
import { writeTiff } from "./testing/tiff.js";

/** c000_r006's real extent, from the pathfinding chunk's own meta.json. */
const BOUNDS: CellBounds = { west: -180, south: 71, east: -178, north: 73 };

/** A 4x3 ramp: value = row * 100 + col, distinct in both axes. */
const ramp = () =>
  Int16Array.from([0, 1, 2, 3, 100, 101, 102, 103, 200, 201, 202, 203]);

describe("decodeGeoTiff", () => {
  it("reads an uncompressed Int16 strip", async () => {
    const tiff = await writeTiff({ width: 4, height: 3, samples: ramp() });
    const grid = await decodeGeoTiff(tiff, BOUNDS);

    expect(grid.width).toBe(4);
    expect(grid.height).toBe(3);
    expect(grid.values).toBeInstanceOf(Int16Array);
    expect([...grid.values]).toEqual([...ramp()]);
    expect(grid.bounds).toEqual(BOUNDS);
  });

  it("reads big-endian files", async () => {
    const tiff = await writeTiff({
      width: 4,
      height: 3,
      samples: ramp(),
      littleEndian: false,
    });
    const grid = await decodeGeoTiff(tiff, BOUNDS);
    expect([...grid.values]).toEqual([...ramp()]);
  });

  it("reassembles multiple strips", async () => {
    const tiff = await writeTiff({
      width: 4,
      height: 3,
      samples: ramp(),
      rowsPerStrip: 2,
    });
    const grid = await decodeGeoTiff(tiff, BOUNDS);
    expect([...grid.values]).toEqual([...ramp()]);
  });

  it("reassembles tiles, discarding the padding", async () => {
    // 4x3 in 2x2 tiles is 2 across and 2 down, and the bottom row of tiles is
    // half padding. Reading the padded width as the image width shears every
    // partial tile — which is the bug this pins.
    const tiff = await writeTiff({
      width: 4,
      height: 3,
      samples: ramp(),
      tile: { width: 2, height: 2 },
    });
    const grid = await decodeGeoTiff(tiff, BOUNDS);
    expect([...grid.values]).toEqual([...ramp()]);
  });

  it("reads Float32 samples and keeps them float", async () => {
    const samples = Float32Array.from([1.5, -2.25, 1000.125, 0]);
    const tiff = await writeTiff({ width: 2, height: 2, samples });
    const grid = await decodeGeoTiff(tiff, BOUNDS);

    expect(grid.values).toBeInstanceOf(Float32Array);
    expect([...grid.values]).toEqual([1.5, -2.25, 1000.125, 0]);
  });

  it("keeps 8-bit samples narrow, which is what a baked hillshade is", async () => {
    // gdaldem hillshade writes 8-bit, and widening those cells to Float32 cost
    // four bytes a pixel for data that needs one — so the cell budget held a
    // quarter of the hillshade it could. Every byte value is exactly
    // representable in an Int16, so unlike the UInt16 case there is nothing to
    // wrap and nothing to lose.
    // The full byte range, including the values above 127 that a signed read
    // would turn negative.
    const samples = Uint8Array.from([0, 90, 180, 255]);
    const tiff = await writeTiff({ width: 2, height: 2, samples });
    const grid = await decodeGeoTiff(tiff, BOUNDS);

    expect(grid.values).toBeInstanceOf(Int16Array);
    expect([...grid.values]).toEqual([0, 90, 180, 255]);
    // Half the residency of the same data as float, which is the point.
    expect(grid.values.byteLength).toBe(samples.length * 2);
  });

  it("inflates Deflate-compressed data", async () => {
    const tiff = await writeTiff({
      width: 4,
      height: 3,
      samples: ramp(),
      deflate: true,
    });
    const grid = await decodeGeoTiff(tiff, BOUNDS);
    expect([...grid.values]).toEqual([...ramp()]);
  });

  it("undoes the horizontal predictor", async () => {
    const tiff = await writeTiff({
      width: 4,
      height: 3,
      samples: ramp(),
      deflate: true,
      predictor: 2,
    });
    const grid = await decodeGeoTiff(tiff, BOUNDS);
    expect([...grid.values]).toEqual([...ramp()]);
  });

  it("undoes the predictor on negative values too", async () => {
    // Differencing is done modulo 2^16 on the unsigned representation, so
    // sign-extended arithmetic on the way back out is where this goes wrong.
    const samples = Int16Array.from([-500, -100, 0, 250]);
    const tiff = await writeTiff({
      width: 4,
      height: 1,
      samples,
      predictor: 2,
    });
    const grid = await decodeGeoTiff(tiff, BOUNDS);
    expect([...grid.values]).toEqual([-500, -100, 0, 250]);
  });

  it("takes nodata from GDAL_NODATA", async () => {
    const tiff = await writeTiff({
      width: 2,
      height: 2,
      samples: Int16Array.from([-32768, 10, 20, 30]),
      nodata: "-32768",
    });
    const grid = await decodeGeoTiff(tiff, BOUNDS);

    expect(grid.nodata).toBe(-32768);

    // The centre of a 2x2 grid weights all four samples equally. With the void
    // recognised, it is the mean of the three that are real; without, the
    // sentinel drags it eight kilometres underground — which is what a
    // coastline looks like when nodata is not declared.
    expect(sampleHeight(grid, -179, 72)).toBeCloseTo(20, 6);

    const unflagged = await decodeGeoTiff(tiff, BOUNDS, { nodata: NaN });
    expect(sampleHeight(unflagged, -179, 72)).toBeLessThan(-8000);
  });

  it("lets the caller override nodata when the file declares none", async () => {
    const tiff = await writeTiff({
      width: 2,
      height: 2,
      samples: Int16Array.from([-32768, 10, 20, 30]),
    });
    const declared = await decodeGeoTiff(tiff, BOUNDS);
    expect(Number.isNaN(declared.nodata)).toBe(true);

    const overridden = await decodeGeoTiff(tiff, BOUNDS, { nodata: -32768 });
    expect(overridden.nodata).toBe(-32768);
  });

  it("rejects BigTIFF by name", async () => {
    const tiff = await writeTiff({
      width: 2,
      height: 2,
      samples: Int16Array.from([1, 2, 3, 4]),
      pretendBigTiff: true,
    });
    await expect(decodeGeoTiff(tiff, BOUNDS)).rejects.toThrow(/BigTIFF/);
  });

  it("names the compression it cannot handle", async () => {
    const tiff = await writeTiff({
      width: 2,
      height: 2,
      samples: Int16Array.from([1, 2, 3, 4]),
      compressionOverride: 5,
    });
    await expect(decodeGeoTiff(tiff, BOUNDS)).rejects.toThrow(/LZW/);
  });

  it("refuses a multi-band image rather than reading one band of three", async () => {
    const tiff = await writeTiff({
      width: 2,
      height: 2,
      samples: Int16Array.from([1, 2, 3, 4]),
      samplesPerPixel: 3,
    });
    await expect(decodeGeoTiff(tiff, BOUNDS)).rejects.toThrow(/single-band/);
  });

  it("rejects a file that is not a TIFF at all", async () => {
    const notTiff = new TextEncoder().encode("<!doctype html><html>403").buffer;
    await expect(decodeGeoTiff(notTiff, BOUNDS)).rejects.toThrow(/not a TIFF/);
  });
});
