/**
 * A GeoTIFF *writer*, for the reader's tests.
 *
 * WHY WRITE ONE
 * -------------
 * The reader in geotiff.ts is hand-rolled, which is only defensible if it is
 * tested against real files. Checking in a handful of binary fixtures would
 * cover whatever those fixtures happen to be; a writer covers the whole matrix
 * the reader claims — endianness, strips against tiles, tile padding, Int16
 * against Float32, deflate, the horizontal predictor — and each case states its
 * own expectation in code rather than in a comment about a blob.
 *
 * It lives under src/ rather than beside the test because the test files are
 * excluded from the published tarball and from the build; a helper the tests
 * import must not be.
 */

const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;

interface Field {
  tag: number;
  type: number;
  values: number[];
  text?: string;
}

export interface WriteTiffOptions {
  width: number;
  height: number;
  /** Row-major from the top-left, length width * height. */
  /**
   * Uint8Array is here for the baked-hillshade case: gdaldem writes 8-bit
   * unsigned, and the decoder narrows those to Int16 rather than widening them
   * to float.
   */
  samples: Int16Array | Float32Array | Uint8Array;
  littleEndian?: boolean;
  /** Rows per strip. Ignored when `tile` is given. Defaults to all of them. */
  rowsPerStrip?: number;
  /** Emit a tiled TIFF with this tile size, padded as the spec requires. */
  tile?: { width: number; height: number };
  /** zlib-compress each segment, and declare Deflate. */
  deflate?: boolean;
  /** 2 applies horizontal differencing. 16-bit samples only. */
  predictor?: 1 | 2;
  /** Written as GDAL_NODATA (tag 42113). */
  nodata?: string;
  /** Overrides SamplesPerPixel, to exercise the reader's rejection of it. */
  samplesPerPixel?: number;
  /** Overrides the compression tag, to exercise the unsupported-codec path. */
  compressionOverride?: number;
  /** Writes 43 as the magic, i.e. claims BigTIFF. */
  pretendBigTiff?: boolean;
}

export async function writeTiff(
  options: WriteTiffOptions,
): Promise<ArrayBuffer> {
  const {
    width,
    height,
    samples,
    littleEndian = true,
    deflate = false,
    predictor = 1,
  } = options;

  const isFloat = samples instanceof Float32Array;
  // From the array itself rather than assumed, so a Uint8Array writes an
  // 8-bit file. It used to be `isFloat ? 4 : 2`, which silently turned a byte
  // array into a 16-bit one — and made a test for 8-bit decoding pass for
  // entirely the wrong reason.
  const bytesPerSample = samples.BYTES_PER_ELEMENT;
  const bits = bytesPerSample * 8;

  if (predictor === 2 && isFloat) {
    throw new Error("writeTiff: predictor 2 is for integer samples");
  }

  // ── Segments ──────────────────────────────────────────────────────────────

  interface Segment {
    bytes: Uint8Array;
    /** Samples per row within the segment (a tile's padded width). */
    rowWidth: number;
    rows: number;
  }

  const segments: Segment[] = [];

  const segmentBytes = (
    x0: number,
    y0: number,
    rowWidth: number,
    rows: number,
  ): Uint8Array => {
    const out = new Uint8Array(rowWidth * rows * bytesPerSample);
    const view = new DataView(out.buffer);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < rowWidth; col++) {
        const x = x0 + col;
        const y = y0 + row;
        // Padding beyond the image stays zero, which is what GDAL writes.
        const value =
          x < width && y < height ? samples[y * width + x] : 0;
        const at = (row * rowWidth + col) * bytesPerSample;
        if (isFloat) {
          view.setFloat32(at, value, littleEndian);
        } else if (bytesPerSample === 1) {
          view.setUint8(at, value);
        } else {
          view.setInt16(at, value, littleEndian);
        }
      }
    }
    return out;
  };

  if (options.tile) {
    const { width: tw, height: th } = options.tile;
    const across = Math.ceil(width / tw);
    const down = Math.ceil(height / th);
    for (let ty = 0; ty < down; ty++) {
      for (let tx = 0; tx < across; tx++) {
        segments.push({
          bytes: segmentBytes(tx * tw, ty * th, tw, th),
          rowWidth: tw,
          rows: th,
        });
      }
    }
  } else {
    const rowsPerStrip = options.rowsPerStrip ?? height;
    for (let y = 0; y < height; y += rowsPerStrip) {
      const rows = Math.min(rowsPerStrip, height - y);
      segments.push({
        bytes: segmentBytes(0, y, width, rows),
        rowWidth: width,
        rows,
      });
    }
  }

  const encoded: Uint8Array[] = [];
  for (const segment of segments) {
    let bytes = segment.bytes;
    if (predictor === 2) {
      bytes = applyHorizontalDifferencing(
        bytes,
        segment.rowWidth,
        segment.rows,
        littleEndian,
      );
    }
    encoded.push(deflate ? await zlib(bytes) : bytes);
  }

  // ── Fields ────────────────────────────────────────────────────────────────

  const dataLength = encoded.reduce((sum, s) => sum + s.length, 0);
  const dataOffset = 8;

  const offsets: number[] = [];
  let at = dataOffset;
  for (const segment of encoded) {
    offsets.push(at);
    at += segment.length;
  }

  const compression = options.compressionOverride ?? (deflate ? 8 : 1);
  // 3 float, 2 signed, 1 unsigned. Bytes are labelled unsigned because that is
  // what gdaldem writes, and it exercises the decoder's UINT path.
  const sampleFormat = isFloat ? 3 : samples instanceof Uint8Array ? 1 : 2;

  const fields: Field[] = [
    { tag: 256, type: TYPE_LONG, values: [width] },
    { tag: 257, type: TYPE_LONG, values: [height] },
    { tag: 258, type: TYPE_SHORT, values: [bits] },
    { tag: 259, type: TYPE_SHORT, values: [compression] },
    {
      tag: 277,
      type: TYPE_SHORT,
      values: [options.samplesPerPixel ?? 1],
    },
    { tag: 339, type: TYPE_SHORT, values: [sampleFormat] },
  ];

  if (predictor !== 1) {
    fields.push({ tag: 317, type: TYPE_SHORT, values: [predictor] });
  }

  if (options.tile) {
    fields.push(
      { tag: 322, type: TYPE_LONG, values: [options.tile.width] },
      { tag: 323, type: TYPE_LONG, values: [options.tile.height] },
      { tag: 324, type: TYPE_LONG, values: offsets },
      { tag: 325, type: TYPE_LONG, values: encoded.map((s) => s.length) },
    );
  } else {
    fields.push(
      { tag: 273, type: TYPE_LONG, values: offsets },
      {
        tag: 278,
        type: TYPE_LONG,
        values: [options.rowsPerStrip ?? height],
      },
      { tag: 279, type: TYPE_LONG, values: encoded.map((s) => s.length) },
    );
  }

  if (options.nodata !== undefined) {
    const text = `${options.nodata}\0`;
    fields.push({
      tag: 42113,
      type: TYPE_ASCII,
      values: [],
      text,
    });
  }

  // The spec requires IFD entries in ascending tag order, and real readers
  // (including this package's) are entitled to rely on it.
  fields.sort((a, b) => a.tag - b.tag);

  const ifdOffset = dataOffset + dataLength;
  const ifdSize = 2 + fields.length * 12 + 4;
  let extraOffset = ifdOffset + ifdSize;

  const sizeOf = (field: Field) => {
    const unit = field.type === TYPE_SHORT ? 2 : field.type === TYPE_LONG ? 4 : 1;
    const count = field.text !== undefined ? field.text.length : field.values.length;
    return unit * count;
  };

  const extras: Array<{ at: number; field: Field }> = [];
  for (const field of fields) {
    if (sizeOf(field) > 4) {
      extras.push({ at: extraOffset, field });
      extraOffset += sizeOf(field);
    }
  }

  const buffer = new ArrayBuffer(extraOffset);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  view.setUint16(0, littleEndian ? 0x4949 : 0x4d4d, false);
  view.setUint16(2, options.pretendBigTiff ? 43 : 42, littleEndian);
  view.setUint32(4, ifdOffset, littleEndian);

  at = dataOffset;
  for (const segment of encoded) {
    bytes.set(segment, at);
    at += segment.length;
  }

  view.setUint16(ifdOffset, fields.length, littleEndian);
  fields.forEach((field, index) => {
    const entry = ifdOffset + 2 + index * 12;
    const count =
      field.text !== undefined ? field.text.length : field.values.length;
    view.setUint16(entry, field.tag, littleEndian);
    view.setUint16(entry + 2, field.type, littleEndian);
    view.setUint32(entry + 4, count, littleEndian);

    const inline = sizeOf(field) <= 4;
    const valuesAt = inline
      ? entry + 8
      : (extras.find((e) => e.field === field)?.at ?? 0);
    if (!inline) {
      view.setUint32(entry + 8, valuesAt, littleEndian);
    }

    if (field.text !== undefined) {
      for (let i = 0; i < field.text.length; i++) {
        view.setUint8(valuesAt + i, field.text.charCodeAt(i));
      }
      return;
    }

    field.values.forEach((value, i) => {
      if (field.type === TYPE_SHORT) {
        view.setUint16(valuesAt + i * 2, value, littleEndian);
      } else {
        view.setUint32(valuesAt + i * 4, value, littleEndian);
      }
    });
  });

  view.setUint32(ifdOffset + 2 + fields.length * 12, 0, littleEndian);

  return buffer;
}

function applyHorizontalDifferencing(
  input: Uint8Array,
  width: number,
  rows: number,
  littleEndian: boolean,
): Uint8Array {
  const out = new Uint8Array(input);
  const view = new DataView(out.buffer);
  for (let row = 0; row < rows; row++) {
    const base = row * width * 2;
    // Right to left, so each subtraction uses the ORIGINAL neighbour.
    for (let col = width - 1; col >= 1; col--) {
      const here = base + col * 2;
      const left = here - 2;
      view.setUint16(
        here,
        (view.getUint16(here, littleEndian) -
          view.getUint16(left, littleEndian)) &
          0xffff,
        littleEndian,
      );
    }
  }
  return out;
}

async function zlib(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
