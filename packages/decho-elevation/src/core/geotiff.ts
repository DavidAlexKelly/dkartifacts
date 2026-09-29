/**
 * A small GeoTIFF reader — just enough to turn one DEM chunk into a HeightGrid.
 *
 * WHY NOT geotiff.js
 * ------------------
 * Because of what this has to read: one band, one dtype, a regular lattice
 * whose extent we already know from the cell grid, and no reprojection. The
 * general-purpose library is ~200 KB and brings a raster model, an overview
 * pyramid, a pool of workers and a CRS stack, none of which this uses. What is
 * here is about three hundred lines and its own tests, which round-trip real
 * TIFFs written by the test itself.
 *
 * WHAT IT SUPPORTS, AND WHY THE LIST IS SHORT
 * -------------------------------------------
 *   classic TIFF (not BigTIFF), one sample per pixel
 *   Int16, UInt16, Float32, Float64 samples
 *   uncompressed, and Deflate/zlib (tags 8 and 32946), predictor 1 or 2
 *   striped or tiled layout, either byte order
 *
 * That is what GDAL produces by default for a DEM. Anything else throws with
 * the compression named and what to do about it, because the alternative —
 * guessing at LZW and getting it subtly wrong — produces a grid full of
 * plausible-looking rubbish, and rubbish elevations do not look wrong on a map
 * until someone plans a route through a hill that is not there.
 *
 * If the source turns out to be LZW or PackBits, there are two honest fixes:
 * re-encode the dataset with `-co COMPRESS=DEFLATE`, or implement `DemCodec`
 * over geotiff.js in the consuming app and pass it in. Both are one change in
 * one place; that is what the codec interface is for.
 */

import type { CellBounds } from "./grid.js";
import type { HeightArray, HeightGrid } from "./heightGrid.js";

// ── TIFF tags this reader looks at ──────────────────────────────────────────

const TAG_IMAGE_WIDTH = 256;
const TAG_IMAGE_LENGTH = 257;
const TAG_BITS_PER_SAMPLE = 258;
const TAG_COMPRESSION = 259;
const TAG_STRIP_OFFSETS = 273;
const TAG_SAMPLES_PER_PIXEL = 277;
const TAG_ROWS_PER_STRIP = 278;
const TAG_STRIP_BYTE_COUNTS = 279;
const TAG_PREDICTOR = 317;
const TAG_TILE_WIDTH = 322;
const TAG_TILE_LENGTH = 323;
const TAG_TILE_OFFSETS = 324;
const TAG_TILE_BYTE_COUNTS = 325;
const TAG_SAMPLE_FORMAT = 339;
const TAG_GDAL_NODATA = 42113;

const COMPRESSION_NONE = 1;
const COMPRESSION_ADOBE_DEFLATE = 8;
const COMPRESSION_DEFLATE = 32946;

const SAMPLE_FORMAT_UINT = 1;
const SAMPLE_FORMAT_INT = 2;
const SAMPLE_FORMAT_FLOAT = 3;

/** Bytes per value, by TIFF field type. Index is the type code. */
const TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
};

export interface DecodeGeoTiffOptions {
  /**
   * Value meaning "no data", when the file does not say.
   *
   * GDAL writes it as tag 42113 and most DEM exports carry it, but a chunk cut
   * with `gdal_translate` from a source that had none will not — and a DEM full
   * of unflagged -32768 sentinels renders as a canyon around every coastline.
   * The store can declare it; this is where that declaration lands.
   */
  nodata?: number;
}

interface Entry {
  type: number;
  count: number;
  /** Numeric values, or an empty array for ASCII. */
  values: number[];
  text?: string;
}

export async function decodeGeoTiff(
  bytes: ArrayBuffer,
  bounds: CellBounds,
  options: DecodeGeoTiffOptions = {},
): Promise<HeightGrid> {
  const view = new DataView(bytes);
  if (bytes.byteLength < 8) {
    throw new Error("decho-elevation: not a TIFF (file is 8 bytes or fewer)");
  }

  const byteOrder = view.getUint16(0, false);
  let littleEndian: boolean;
  if (byteOrder === 0x4949) {
    littleEndian = true;
  } else if (byteOrder === 0x4d4d) {
    littleEndian = false;
  } else {
    throw new Error(
      `decho-elevation: not a TIFF (byte order marker 0x${byteOrder.toString(16)})`,
    );
  }

  const magic = view.getUint16(2, littleEndian);
  if (magic === 43) {
    throw new Error(
      "decho-elevation: BigTIFF is not supported. Re-cut the chunk as classic " +
        "TIFF (a 2° DEM cell is far below the 4 GB limit) or supply a DemCodec.",
    );
  }
  if (magic !== 42) {
    throw new Error(
      `decho-elevation: not a TIFF (magic ${magic}, expected 42)`,
    );
  }

  const entries = readIfd(view, view.getUint32(4, littleEndian), littleEndian);

  const width = requireScalar(entries, TAG_IMAGE_WIDTH, "ImageWidth");
  const height = requireScalar(entries, TAG_IMAGE_LENGTH, "ImageLength");
  const samplesPerPixel = scalar(entries, TAG_SAMPLES_PER_PIXEL) ?? 1;
  if (samplesPerPixel !== 1) {
    throw new Error(
      `decho-elevation: expected a single-band DEM, found ${samplesPerPixel} ` +
        "samples per pixel.",
    );
  }

  const bitsPerSample = scalar(entries, TAG_BITS_PER_SAMPLE) ?? 8;
  const sampleFormat = scalar(entries, TAG_SAMPLE_FORMAT) ?? SAMPLE_FORMAT_UINT;
  const compression = scalar(entries, TAG_COMPRESSION) ?? COMPRESSION_NONE;
  const predictor = scalar(entries, TAG_PREDICTOR) ?? 1;

  if (predictor !== 1 && predictor !== 2) {
    throw new Error(
      `decho-elevation: unsupported TIFF predictor ${predictor} (floating-point ` +
        "predictor 3 is not implemented).",
    );
  }

  const reader = sampleReader(bitsPerSample, sampleFormat);
  const output = allocate(bitsPerSample, sampleFormat, width * height);
  const bytesPerSample = bitsPerSample / 8;

  const layout = readLayout(entries, width, height);

  for (const segment of layout.segments) {
    const raw = new Uint8Array(bytes, segment.offset, segment.byteCount);
    const inflated = await decompress(raw, compression);
    const data = new DataView(
      inflated.buffer,
      inflated.byteOffset,
      inflated.byteLength,
    );

    if (predictor === 2) {
      undoHorizontalDifferencing(
        data,
        segment.width,
        segment.rows,
        bitsPerSample,
        littleEndian,
      );
    }

    for (let row = 0; row < segment.rows; row++) {
      const y = segment.y + row;
      if (y >= height) {break;}
      for (let col = 0; col < segment.width; col++) {
        const x = segment.x + col;
        if (x >= width) {continue;}
        const at = (row * segment.width + col) * bytesPerSample;
        // A truncated final segment is a corrupt file, but reading past the
        // end of the buffer throws a RangeError that says nothing useful.
        if (at + bytesPerSample > data.byteLength) {break;}
        output[y * width + x] = reader(data, at, littleEndian);
      }
    }
  }

  const nodata =
    options.nodata ?? parseNodata(entries.get(TAG_GDAL_NODATA)?.text) ?? NaN;

  return { width, height, values: output, bounds, nodata };
}

// ── IFD ─────────────────────────────────────────────────────────────────────

function readIfd(
  view: DataView,
  offset: number,
  littleEndian: boolean,
): Map<number, Entry> {
  const count = view.getUint16(offset, littleEndian);
  const entries = new Map<number, Entry>();

  for (let i = 0; i < count; i++) {
    const at = offset + 2 + i * 12;
    const tag = view.getUint16(at, littleEndian);
    const type = view.getUint16(at + 2, littleEndian);
    const valueCount = view.getUint32(at + 4, littleEndian);
    const size = TYPE_SIZES[type];
    if (!size) {continue;}

    const total = size * valueCount;
    // Values of four bytes or fewer are stored INLINE in the entry, not at an
    // offset. Reading them as an offset yields a pointer into nowhere, which is
    // the classic way a hand-rolled TIFF reader gets ImageWidth wrong.
    const valuesAt = total <= 4 ? at + 8 : view.getUint32(at + 8, littleEndian);

    if (type === 2) {
      let text = "";
      for (let c = 0; c < valueCount; c++) {
        const code = view.getUint8(valuesAt + c);
        if (code === 0) {break;}
        text += String.fromCharCode(code);
      }
      entries.set(tag, { type, count: valueCount, values: [], text });
      continue;
    }

    const values: number[] = [];
    for (let v = 0; v < valueCount; v++) {
      values.push(readValue(view, type, valuesAt + v * size, littleEndian));
    }
    entries.set(tag, { type, count: valueCount, values });
  }

  return entries;
}

function readValue(
  view: DataView,
  type: number,
  at: number,
  littleEndian: boolean,
): number {
  switch (type) {
    case 1:
    case 7:
      return view.getUint8(at);
    case 3:
      return view.getUint16(at, littleEndian);
    case 4:
      return view.getUint32(at, littleEndian);
    case 5:
      return (
        view.getUint32(at, littleEndian) / view.getUint32(at + 4, littleEndian)
      );
    case 6:
      return view.getInt8(at);
    case 8:
      return view.getInt16(at, littleEndian);
    case 9:
      return view.getInt32(at, littleEndian);
    case 10:
      return (
        view.getInt32(at, littleEndian) / view.getInt32(at + 4, littleEndian)
      );
    case 11:
      return view.getFloat32(at, littleEndian);
    case 12:
      return view.getFloat64(at, littleEndian);
    default:
      return NaN;
  }
}

function scalar(entries: Map<number, Entry>, tag: number): number | undefined {
  const entry = entries.get(tag);
  return entry && entry.values.length > 0 ? entry.values[0] : undefined;
}

function requireScalar(
  entries: Map<number, Entry>,
  tag: number,
  name: string,
): number {
  const value = scalar(entries, tag);
  if (value === undefined) {
    throw new Error(`decho-elevation: TIFF is missing ${name} (tag ${tag})`);
  }
  return value;
}

function parseNodata(text: string | undefined): number | undefined {
  if (text === undefined) {return undefined;}
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "nan") {return NaN;}
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

// ── Layout ──────────────────────────────────────────────────────────────────

interface Segment {
  offset: number;
  byteCount: number;
  /** Column of this segment's first sample within the image. */
  x: number;
  /** Row of this segment's first sample within the image. */
  y: number;
  /** Samples per row IN THE SEGMENT — a tile's full width, padding included. */
  width: number;
  rows: number;
}

function readLayout(
  entries: Map<number, Entry>,
  width: number,
  height: number,
): { segments: Segment[] } {
  const tileWidth = scalar(entries, TAG_TILE_WIDTH);
  const tileLength = scalar(entries, TAG_TILE_LENGTH);

  if (tileWidth !== undefined && tileLength !== undefined) {
    const offsets = entries.get(TAG_TILE_OFFSETS)?.values ?? [];
    const counts = entries.get(TAG_TILE_BYTE_COUNTS)?.values ?? [];
    const across = Math.ceil(width / tileWidth);
    const down = Math.ceil(height / tileLength);

    const segments: Segment[] = [];
    for (let index = 0; index < across * down; index++) {
      if (offsets[index] === undefined) {break;}
      segments.push({
        offset: offsets[index],
        byteCount: counts[index],
        x: (index % across) * tileWidth,
        y: Math.floor(index / across) * tileLength,
        // Tiles are PADDED to the full tile size, so a right-edge tile still
        // has tileWidth samples per row and the surplus is skipped by the
        // bounds check in the copy loop. Using the clipped width here would
        // shear every partial tile.
        width: tileWidth,
        rows: tileLength,
      });
    }
    return { segments };
  }

  const offsets = entries.get(TAG_STRIP_OFFSETS)?.values ?? [];
  const counts = entries.get(TAG_STRIP_BYTE_COUNTS)?.values ?? [];
  if (offsets.length === 0) {
    throw new Error(
      "decho-elevation: TIFF has neither TileOffsets nor StripOffsets",
    );
  }
  const rowsPerStrip = Math.min(scalar(entries, TAG_ROWS_PER_STRIP) ?? height, height);

  const segments: Segment[] = offsets.map((offset, index) => ({
    offset,
    byteCount: counts[index],
    x: 0,
    y: index * rowsPerStrip,
    width,
    rows: Math.min(rowsPerStrip, height - index * rowsPerStrip),
  }));

  return { segments };
}

// ── Samples ─────────────────────────────────────────────────────────────────

type SampleReader = (
  view: DataView,
  at: number,
  littleEndian: boolean,
) => number;

function sampleReader(bits: number, format: number): SampleReader {
  if (format === SAMPLE_FORMAT_FLOAT) {
    if (bits === 32) {return (v, at, le) => v.getFloat32(at, le);}
    if (bits === 64) {return (v, at, le) => v.getFloat64(at, le);}
  }
  if (format === SAMPLE_FORMAT_INT) {
    if (bits === 16) {return (v, at, le) => v.getInt16(at, le);}
    if (bits === 32) {return (v, at, le) => v.getInt32(at, le);}
    if (bits === 8) {return (v, at) => v.getInt8(at);}
  }
  if (format === SAMPLE_FORMAT_UINT) {
    if (bits === 16) {return (v, at, le) => v.getUint16(at, le);}
    if (bits === 32) {return (v, at, le) => v.getUint32(at, le);}
    if (bits === 8) {return (v, at) => v.getUint8(at);}
  }
  throw new Error(
    `decho-elevation: unsupported DEM sample type (${bits}-bit, sample format ` +
      `${format}).`,
  );
}

/**
 * Int16 and anything 8-bit stay narrow; everything else becomes Float32.
 *
 * An Int16 DEM is half the residency of the same data widened to float, and a
 * 2° cell is 11.5 MB against 23 MB — worth keeping for the one dtype that
 * dominates.
 *
 * EIGHT-BIT SAMPLES ARE NARROWED FOR THE SAME REASON AND WITH NO RISK. Every
 * value a byte can hold, signed or unsigned, is exactly representable in an
 * Int16 — so unlike the UInt16 case below there is nothing to wrap. It is not a
 * hypothetical dtype either: `gdaldem hillshade` writes 8-bit, and widening
 * those cells to float quadrupled what they cost resident, which meant the cell
 * budget held a quarter of the hillshade it could.
 *
 * UInt16 is NOT narrowed into Int16: its usual nodata sentinel is 65535, which
 * would wrap to -1 and put a one-pixel trench through the map.
 */
function allocate(bits: number, format: number, length: number): HeightArray {
  const narrow =
    (format === SAMPLE_FORMAT_INT && bits === 16) ||
    ((format === SAMPLE_FORMAT_INT || format === SAMPLE_FORMAT_UINT) &&
      bits === 8);
  return narrow ? new Int16Array(length) : new Float32Array(length);
}

/**
 * Predictor 2: each sample is stored as its difference from the one to its
 * left, per row. Undone in place before the samples are read.
 */
function undoHorizontalDifferencing(
  data: DataView,
  width: number,
  rows: number,
  bits: number,
  littleEndian: boolean,
): void {
  const stride = bits / 8;
  const rowBytes = width * stride;

  for (let row = 0; row < rows; row++) {
    const base = row * rowBytes;
    if (base + rowBytes > data.byteLength) {break;}
    for (let col = 1; col < width; col++) {
      const at = base + col * stride;
      const previous = at - stride;
      if (bits === 16) {
        data.setUint16(
          at,
          (data.getUint16(at, littleEndian) +
            data.getUint16(previous, littleEndian)) &
            0xffff,
          littleEndian,
        );
      } else if (bits === 32) {
        data.setUint32(
          at,
          (data.getUint32(at, littleEndian) +
            data.getUint32(previous, littleEndian)) >>>
            0,
          littleEndian,
        );
      } else if (bits === 8) {
        data.setUint8(at, (data.getUint8(at) + data.getUint8(previous)) & 0xff);
      }
    }
  }
}

// ── Decompression ───────────────────────────────────────────────────────────

async function decompress(
  bytes: Uint8Array,
  compression: number,
): Promise<Uint8Array> {
  if (compression === COMPRESSION_NONE) {return bytes;}

  if (
    compression === COMPRESSION_DEFLATE ||
    compression === COMPRESSION_ADOBE_DEFLATE
  ) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error(
        "decho-elevation: this DEM chunk is Deflate-compressed and the runtime " +
          "has no DecompressionStream. Serve uncompressed chunks or supply a " +
          "DemCodec with its own inflater.",
      );
    }
    // "deflate" is the zlib-wrapped variant, which is what TIFF tags 8 and
    // 32946 both mean. "deflate-raw" would fail on the two-byte zlib header.
    const stream = new Blob([bytes as unknown as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  throw new Error(
    `decho-elevation: unsupported TIFF compression ${compression} ` +
      `(${describeCompression(compression)}). This reader handles uncompressed ` +
      "and Deflate. Either re-cut the chunks with -co COMPRESS=DEFLATE, or pass " +
      "a DemCodec built over a full TIFF library.",
  );
}

function describeCompression(code: number): string {
  switch (code) {
    case 2:
      return "CCITT modified Huffman";
    case 5:
      return "LZW";
    case 7:
      return "JPEG";
    case 32773:
      return "PackBits";
    case 34925:
      return "LZMA";
    case 50000:
      return "Zstandard";
    case 50001:
      return "WebP";
    default:
      return "unrecognised";
  }
}
