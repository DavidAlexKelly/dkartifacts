/**
 * A minimal PNG writer — RGBA in, one 8-bit truecolour-with-alpha PNG out.
 *
 * WHY NOT A CANVAS
 * ----------------
 * `OffscreenCanvas.convertToBlob()` would be four lines. It is also the wrong
 * tool for this, twice over:
 *
 *   1. Canvas is a COLOUR-MANAGED surface. Putting bytes in and getting the
 *      same bytes out is not guaranteed: 2D contexts may composite in a
 *      different colour space, and `getImageData` is specified to return
 *      premultiplied-then-unpremultiplied values, which is lossy. For a
 *      terrarium tile the "colours" are a 24-bit height, so a single unit of
 *      channel drift is a metre of terrain, and premultiplication rounding
 *      would put a metre of noise everywhere.
 *   2. It is unavailable off the main thread in some browsers and absent from
 *      Node, which puts the one interesting piece of arithmetic in this package
 *      beyond the reach of its own tests.
 *
 * Writing the container by hand is about ninety lines, exact, and testable. The
 * only compression is the zlib stream PNG requires, which the platform provides
 * through CompressionStream.
 *
 * FILTERING
 * ---------
 * Every scanline is written with filter type 0 (None). Sub/Up/Average/Paeth
 * would compress better, and for a height field they compress much better — but
 * this PNG lives for milliseconds between here and createImageBitmap, is never
 * stored, and never crosses a network. Deflate alone already halves it.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * RGBA bytes to a PNG.
 *
 * `rgba` is width * height * 4 bytes, row-major from the top-left — the same
 * order as ImageData and as the height arrays everything else here uses.
 */
export async function encodePng(
  rgba: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const expected = width * height * 4;
  if (rgba.length !== expected) {
    throw new Error(
      `decho-elevation: encodePng got ${rgba.length} bytes for ${width}x${height} ` +
        `RGBA, expected ${expected}`,
    );
  }

  // Each scanline is prefixed with its filter type byte.
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let row = 0; row < height; row++) {
    const to = row * (1 + width * 4);
    raw[to] = 0;
    raw.set(rgba.subarray(row * width * 4, (row + 1) * width * 4), to + 1);
  }

  const compressed = await deflate(raw);

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const chunks = [
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", new Uint8Array(0)),
  ];

  const total =
    SIGNATURE.length + chunks.reduce((sum, c) => sum + c.length, 0);
  const png = new Uint8Array(total);
  png.set(SIGNATURE, 0);
  let at = SIGNATURE.length;
  for (const c of chunks) {
    png.set(c, at);
    at += c.length;
  }
  return png;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(data, 8);
  // The CRC covers the type AND the data, not the length.
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    throw new Error(
      "decho-elevation: no CompressionStream in this runtime, so DEM tiles " +
        "cannot be encoded. Point the raster-dem source at pre-encoded " +
        "terrain-RGB tiles instead.",
    );
  }
  // "deflate" is the zlib-wrapped variant, which is what PNG's IDAT requires.
  // "deflate-raw" produces a stream with no zlib header and every decoder
  // rejects the file.
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
