/**
 * Decoding nodes.bin / edges.bin into a searchable graph.
 *
 * THE FORMAT, AS THE DATA DECLARES IT
 * -----------------------------------
 *   meta.json  { cell, col, row, bbox, spacing_m, max_slope, nodeCount,
 *                edgeCount, terrainClasses, costModel, format }
 *   nodes.bin  NODE v1: lon,f32 lat,f32 elev,f32 flags,u8      -> 13 bytes
 *   edges.bin  EDGE v1: from,u32 to,u32 dist,f32 slope,f32 terrain,u8 -> 17
 *
 * NOTHING HERE ASSUMES THAT
 * -------------------------
 * 13 and 17 are odd strides — no field after the first is naturally aligned —
 * so a generator that padded to 16/20 would produce a file this parser could
 * still read, and a parser that hardcoded 13 would read it as noise: plausible
 * coordinates, plausible costs, silently wrong routes. Since meta.json carries
 * the exact record COUNTS, the stride is arithmetic rather than a guess:
 *
 *     stride = byteLength / count
 *
 * and endianness is then settled by decoding real records and checking they
 * land inside the cell's own declared bbox. Anything that fails both
 * endiannesses throws MalformedGraphError with the numbers it saw, because the
 * one outcome worth ruling out completely is a parser that quietly guesses.
 *
 * WHY CSR
 * -------
 * A* touches `for each neighbour of n` millions of times. Arrays of edge
 * objects, or a Map<node, Edge[]>, spend that entire budget chasing pointers
 * and collecting garbage. Compressed sparse row — one offsets array plus
 * parallel typed arrays — makes a node's edges a contiguous slice, which is
 * both cache-friendly and transferable to a worker with no copy.
 *
 * The odd strides also mean the source buffers CANNOT be viewed as Float32Array
 * in place (typed arrays require natural alignment), which is the other reason
 * the bytes are unpacked once here rather than read repeatedly during search.
 */

import { MalformedGraphError } from "./errors";
import { haversineM } from "./geo";
import type { CellBounds } from "./grid";

/** meta.json, restricted to the fields this package relies on. */
export interface CellMeta {
  cell: string;
  col: number;
  row: number;
  bbox: CellBounds;
  spacing_m: number;
  max_slope: number;
  nodeCount: number;
  edgeCount: number;
  terrainClasses?: Record<string, string>;
  costModel?: string;
  format?: { nodes?: string; edges?: string };
}

/** One cell's graph, unpacked into columnar typed arrays. */
export interface CellGraph {
  readonly key: string;
  readonly col: number;
  readonly row: number;
  readonly bbox: CellBounds;
  readonly spacingM: number;
  readonly maxSlope: number;

  readonly nodeCount: number;
  readonly lon: Float32Array;
  readonly lat: Float32Array;
  readonly elev: Float32Array;
  readonly flags: Uint8Array;

  /** CSR: edges of node i are [offsets[i], offsets[i + 1]). */
  readonly offsets: Uint32Array;
  readonly edgeTo: Uint32Array;
  readonly edgeDist: Float32Array;
  readonly edgeSlope: Float32Array;
  readonly edgeTerrain: Uint8Array;
  readonly edgeCount: number;

  /** Resident cost of this cell, for the parsed-cell budget. */
  readonly bytes: number;
}

const NODE_FIELDS = "lon,f32 lat,f32 elev,f32 flags,u8";
const EDGE_FIELDS = "from,u32 to,u32 dist,f32 slope,f32 terrain,u8";

const NODE_MIN_STRIDE = 13;
const EDGE_MIN_STRIDE = 17;

/**
 * Bounds on the search for a layout. See resolveLayout.
 *
 * A stride cannot be below the packed field width, and a record padded past 128
 * bytes for four fields is not a thing anyone does. A header is a magic number,
 * a version and a count or two — tens of bytes, not hundreds.
 */
const MAX_STRIDE = 128;
const MAX_HEADER_BYTES = 256;

/**
 * Refuse to decode a layout this parser was not written for.
 *
 * "The format is fixed" is true right up until someone adds a field, and the
 * failure mode of reading v2 with a v1 parser is not a crash — it is a route
 * that looks reasonable and is not. The declared format string is the cheapest
 * possible version check, so it is checked.
 */
export function assertKnownLayout(meta: CellMeta): void {
  const nodes = normaliseLayout(meta.format?.nodes);
  const edges = normaliseLayout(meta.format?.edges);

  // Absent format strings are tolerated: the earliest chunks may predate them,
  // and the bbox/index validation below still has to pass either way.
  if (nodes && !nodes.endsWith(NODE_FIELDS)) {
    throw new MalformedGraphError(
      meta.cell,
      `unsupported node layout "${meta.format?.nodes}" (this parser reads "${NODE_FIELDS}")`,
      { declared: meta.format?.nodes },
    );
  }
  if (edges && !edges.endsWith(EDGE_FIELDS)) {
    throw new MalformedGraphError(
      meta.cell,
      `unsupported edge layout "${meta.format?.edges}" (this parser reads "${EDGE_FIELDS}")`,
      { declared: meta.format?.edges },
    );
  }
}

function normaliseLayout(declared: string | undefined): string | null {
  if (!declared) {return null;}
  return declared.replace(/\s+/g, " ").trim();
}

interface Layout {
  offset: number;
  stride: number;
  littleEndian: boolean;
}

/**
 * Work out where the records start, how far apart they are, and in which byte
 * order — from the record count and a validator that says whether a candidate
 * decodes to sane values.
 *
 * WHY THE STRIDE IS THE SEARCH VARIABLE, NOT THE HEADER SIZE
 * ----------------------------------------------------------
 * The first version of this enumerated a list of plausible header sizes
 * ([0, 4, 8, 12, 16, 24, 32]) and derived the stride from each. That is
 * backwards, and the real dataset proved it within a day: c091_r018 has 219 834
 * bytes for 13 739 nodes, which is stride 16 after a **10-byte** header
 * (4-byte magic + 2-byte version + 4-byte count, by the look of it). Ten was
 * not on the list, so the parser correctly refused to guess — and the cell
 * would not load.
 *
 * Strides, though, are enumerable from first principles: a record cannot be
 * smaller than its packed fields, and nobody pads four fields past 128 bytes.
 * So iterate the stride, and let the LEFTOVER bytes be whatever header the
 * generator felt like writing. Candidates are then tried smallest-remainder
 * first, because an exact fit is likelier than a header and a small header is
 * likelier than a large one.
 *
 * Records-at-zero-with-a-trailer is tried as well as header-then-records, since
 * the arithmetic cannot distinguish them and both exist in the wild.
 */
function resolveLayout(
  cell: string,
  what: "nodes" | "edges",
  byteLength: number,
  count: number,
  minStride: number,
  valid: (layout: Layout) => boolean,
): Layout {
  interface Candidate extends Layout {
    remainder: number;
    /** Where the leftover bytes are: before the records, or after them. */
    placement: "header" | "trailer";
  }

  const candidates: Candidate[] = [];

  for (let stride = minStride; stride <= MAX_STRIDE; stride++) {
    const remainder = byteLength - stride * count;
    // Remainder shrinks as stride grows, so once it is negative nothing larger
    // can fit either.
    if (remainder < 0) {break;}
    if (remainder > MAX_HEADER_BYTES) {continue;}

    for (const littleEndian of [true, false]) {
      candidates.push({
        offset: remainder,
        stride,
        littleEndian,
        remainder,
        placement: "header",
      });
      if (remainder > 0) {
        candidates.push({
          offset: 0,
          stride,
          littleEndian,
          remainder,
          placement: "trailer",
        });
      }
    }
  }

  // Exact fits first, then the smallest header, then the smallest stride, then
  // little-endian ahead of big. Deterministic, and in order of likelihood.
  candidates.sort(
    (a, b) =>
      a.remainder - b.remainder ||
      a.stride - b.stride ||
      Number(b.littleEndian) - Number(a.littleEndian) ||
      (a.placement === "header" ? -1 : 1),
  );

  for (const candidate of candidates) {
    if (valid(candidate)) {
      reportLayout(what, minStride, candidate);
      return candidate;
    }
  }

  throw new MalformedGraphError(
    cell,
    `could not decode ${what}: ${byteLength} bytes for ${count} records yields ` +
      `no layout whose values are sane (tried ${candidates.length} combinations ` +
      `of stride ${minStride}-${MAX_STRIDE}, header/trailer up to ` +
      `${MAX_HEADER_BYTES} bytes, both byte orders)`,
    {
      byteLength,
      count,
      minStride,
      // The few worth eyeballing: an exact fit, or a plausible header.
      closest: candidates
        .filter((c) => c.littleEndian && c.placement === "header")
        .slice(0, 6)
        .map((c) => `stride ${c.stride} + ${c.remainder}-byte header`),
    },
  );
}

/**
 * Announce a non-default layout ONCE per shape, not once per cell.
 *
 * Every cell in a cut is written by the same generator, so the layout is a
 * property of the dataset — printing it per cell would put 32 identical lines in
 * the console for a route that crosses 16 cells. Worth saying at all, because it
 * is the only way anyone learns what the pipeline actually emits: nothing else
 * in the estate documents that the live cut pads to 16 bytes behind a 10-byte
 * header.
 */
const reportedLayouts = new Set<string>();

function reportLayout(
  what: "nodes" | "edges",
  minStride: number,
  layout: { stride: number; remainder: number; placement: string; littleEndian: boolean },
): void {
  if (layout.remainder === 0 && layout.stride === minStride) {return;}

  const signature = `${what}/${layout.stride}/${layout.remainder}/${layout.placement}/${layout.littleEndian}`;
  if (reportedLayouts.has(signature)) {return;}
  reportedLayouts.add(signature);

  const shape =
    layout.remainder === 0
      ? `${layout.stride}-byte records`
      : `${layout.stride}-byte records ${
          layout.placement === "header"
            ? `after a ${layout.remainder}-byte header`
            : `before a ${layout.remainder}-byte trailer`
        }`;

  console.info(
    `[decho-pathfinding] ${what}.bin layout: ${shape}, ` +
      `${layout.littleEndian ? "little" : "big"}-endian ` +
      `(packed fields would be ${minStride} bytes)`,
  );
}

// ── Edge field detection ─────────────────────────────────────────────────────

/** Where each edge field actually sits inside a record. */
interface EdgeFields {
  distOffset: number;
  slopeOffset: number;
  terrainOffset: number;
  /** Median relative error of `dist` against great-circle distance. */
  distError: number;
  /** Median absolute error of `slope` against rise/run from the elevations. */
  slopeError: number | null;
  /** Distinct terrain values in the sample. */
  terrainValues: number[];
}

/** Documented offsets: from u32, to u32, dist f32, slope f32, terrain u8. */
const DOCUMENTED_EDGE_FIELDS = { dist: 8, slope: 12, terrain: 16 };

/**
 * A `dist` within this fraction of great-circle distance is the real one.
 *
 * Generous on purpose: the generator may measure geodesically on an ellipsoid,
 * or in 3D including the rise, and any of those is within a few percent of a
 * spherical haversine over 1500 m. A WRONG field is not off by 5% — it is a
 * denormal, a byte-swapped integer, or a number in the millions.
 */
const DIST_TOLERANCE = 0.05;

/** Likewise: a slope that is really rise/run agrees to well inside this. */
const SLOPE_TOLERANCE = 0.05;

/** Terrain is a small class id. Anything larger is a misread byte. */
const MAX_PLAUSIBLE_TERRAIN = 32;

function median(values: number[]): number {
  if (values.length === 0) {return Infinity;}
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

/**
 * Work out which offsets hold dist, slope and terrain, by checking candidates
 * against geometry that is already known to be right.
 *
 * WHY THIS EXISTS
 * ---------------
 * The first version read the documented offsets (8, 12, 16) and validated only
 * that indices were in range and `dist` was a plausible positive number. That
 * is not a check on MEANING, and the live cut proved the difference: routes
 * came back with no error at all, every vehicle profile agreeing, every path a
 * straight line.
 *
 * The mechanism is worth spelling out, because it is the nastiest failure this
 * package can have. If the generator orders the record differently — terrain
 * before slope, say — then `slope` reads a terrain byte plus padding, which as
 * a float is a denormal indistinguishable from zero, and `terrain` reads the
 * first byte of the real slope float, which is some arbitrary value like 143.
 * A terrain class of 143 is not in any profile's table, so every edge gets the
 * default multiplier of 1; a slope of ~0 removes the only other term. Every
 * edge then costs exactly its length, every profile produces the same answer,
 * and the cheapest path is the straightest one. No exception, no warning,
 * nothing in the console — just a router that is really a ruler.
 *
 * The nodes are the fixed point that makes this detectable: their coordinates
 * were validated against the cell's own bbox, so the true `dist` field MUST
 * agree with the great-circle distance between the endpoints it names, and the
 * true `slope` field MUST agree with the rise between their elevations over
 * that distance. Those are strong enough constraints to identify the fields
 * outright rather than trust a docstring.
 *
 * Returns null when no offset holds a plausible distance — which also makes
 * this the validator for stride and endianness, since a wrong stride cannot
 * produce distances that match the geometry either.
 */
function detectEdgeFields(
  view: DataView,
  layout: Layout,
  edgeCount: number,
  nodes: {
    nodeCount: number;
    lon: Float32Array;
    lat: Float32Array;
    elev: Float32Array;
  },
): EdgeFields | null {
  const { offset, stride, littleEndian } = layout;
  const { nodeCount, lon, lat, elev } = nodes;

  // Sample across the whole file: a wrong stride drifts, so late records fail
  // even when the first few happen to pass.
  const sampleCount = Math.min(48, edgeCount);
  const samples: Array<{ at: number; from: number; to: number; ground: number }> = [];

  for (let s = 0; s < sampleCount; s++) {
    const i = Math.floor((s * (edgeCount - 1)) / Math.max(1, sampleCount - 1));
    const at = offset + i * stride;
    if (at + stride > view.byteLength) {return null;}

    const from = view.getUint32(at, littleEndian);
    const to = view.getUint32(at + 4, littleEndian);
    if (from >= nodeCount || to >= nodeCount) {return null;}

    const ground = haversineM(lon[from], lat[from], lon[to], lat[to]);
    // Self-loops and coincident nodes carry no information about the layout.
    if (ground > 0) {samples.push({ at, from, to, ground });}
  }

  if (samples.length < 3) {return null;}

  /** Every 4-byte-aligned float slot after the two indices. */
  const floatOffsets: number[] = [];
  for (let o = 8; o + 4 <= stride; o += 4) {floatOffsets.push(o);}

  // ── dist: the offset whose values match great-circle distance ─────────────

  let distOffset = -1;
  let distError = Infinity;

  for (const candidate of floatOffsets) {
    const errors = samples.map(({ at, ground }) => {
      const value = view.getFloat32(at + candidate, littleEndian);
      if (!Number.isFinite(value) || value <= 0) {return Infinity;}
      return Math.abs(value - ground) / ground;
    });
    const score = median(errors);
    if (score < distError) {
      distError = score;
      distOffset = candidate;
    }
  }

  if (distOffset < 0 || distError > DIST_TOLERANCE) {return null;}

  // ── slope: the offset matching rise over run ──────────────────────────────

  let slopeOffset = -1;
  let slopeError: number | null = null;

  for (const candidate of floatOffsets) {
    if (candidate === distOffset) {continue;}
    const errors = samples.map(({ at, from, to, ground }) => {
      const value = view.getFloat32(at + candidate, littleEndian);
      if (!Number.isFinite(value)) {return Infinity;}
      const expected = (elev[to] - elev[from]) / ground;
      if (!Number.isFinite(expected)) {return Infinity;}
      return Math.abs(value - expected);
    });
    const score = median(errors);
    if (slopeError === null || score < slopeError) {
      slopeError = score;
      slopeOffset = candidate;
    }
  }

  if (slopeOffset < 0 || slopeError === null || slopeError > SLOPE_TOLERANCE) {
    // Elevations may be flat, or the generator may define slope differently
    // (as a percentage, or as raw rise). Fall back rather than refuse the whole
    // cell — but say so, because a mis-taken slope is a silent cost error.
    slopeOffset = DOCUMENTED_EDGE_FIELDS.slope;
    slopeError = null;
  }

  // ── terrain: a small class id in a byte no float is using ─────────────────

  const used = new Set<number>();
  for (const base of [distOffset, slopeOffset]) {
    for (let b = 0; b < 4; b++) {used.add(base + b);}
  }

  let terrainOffset = -1;
  let terrainValues: number[] = [];

  for (let o = 8; o < stride; o++) {
    if (used.has(o)) {continue;}
    const values = new Set<number>();
    let plausible = true;
    for (const { at } of samples) {
      const value = view.getUint8(at + o);
      if (value > MAX_PLAUSIBLE_TERRAIN) {
        plausible = false;
        break;
      }
      values.add(value);
    }
    if (!plausible) {continue;}
    // Prefer a byte that actually varies: padding is all zeroes, and a terrain
    // column that never changes is indistinguishable from padding anyway.
    if (terrainOffset < 0 || values.size > terrainValues.length) {
      terrainOffset = o;
      terrainValues = [...values].sort((a, b) => a - b);
    }
  }

  if (terrainOffset < 0) {
    terrainOffset = DOCUMENTED_EDGE_FIELDS.terrain;
    terrainValues = [];
  }

  return {
    distOffset,
    slopeOffset,
    terrainOffset,
    distError,
    slopeError,
    terrainValues,
  };
}

/**
 * Report the detected field layout once per shape.
 *
 * Loud when it disagrees with the documented order, because that means the
 * generator and its own format string have diverged — and the cost of not
 * noticing is a router that returns straight lines.
 */
const reportedFields = new Set<string>();

function reportEdgeFields(cell: string, fields: EdgeFields): void {
  const documented =
    fields.distOffset === DOCUMENTED_EDGE_FIELDS.dist &&
    fields.slopeOffset === DOCUMENTED_EDGE_FIELDS.slope &&
    fields.terrainOffset === DOCUMENTED_EDGE_FIELDS.terrain;

  const signature = `${fields.distOffset}/${fields.slopeOffset}/${fields.terrainOffset}/${fields.slopeError === null}`;
  if (reportedFields.has(signature)) {return;}
  reportedFields.add(signature);

  const where =
    `dist@${fields.distOffset} slope@${fields.slopeOffset} ` +
    `terrain@${fields.terrainOffset} (terrain values seen: ` +
    `${fields.terrainValues.join(", ") || "none"})`;

  if (!documented) {
    console.warn(
      `[decho-pathfinding] ${cell}: edges.bin does NOT use the documented field ` +
        `order — detected ${where}. Reading the documented offsets would have ` +
        "given every edge the same cost, and every route a straight line. " +
        "Worth correcting the format string in the pipeline.",
    );
    return;
  }

  if (fields.slopeError === null) {
    console.warn(
      `[decho-pathfinding] ${cell}: could not confirm the slope field against ` +
        "the node elevations, so the documented offset is being used. Slope " +
        "costs may be wrong; check that slope is rise/run and not a percentage.",
    );
    return;
  }

  console.info(
    `[decho-pathfinding] edges.bin fields verified against geometry: ${where}, ` +
      `dist within ${(fields.distError * 100).toFixed(2)}% of great-circle, ` +
      `slope within ${fields.slopeError.toFixed(4)}`,
  );
}

export function parseCellGraph(
  meta: CellMeta,
  nodeBuffer: ArrayBuffer,
  edgeBuffer: ArrayBuffer,
): CellGraph {
  assertKnownLayout(meta);

  const { cell, nodeCount, edgeCount, bbox } = meta;

  if (nodeCount <= 0) {
    throw new MalformedGraphError(cell, "cell declares no nodes", { nodeCount });
  }

  const nodeView = new DataView(nodeBuffer);
  const edgeView = new DataView(edgeBuffer);

  // ── Nodes ────────────────────────────────────────────────────────────────
  //
  // Sanity means "inside the cell's own bbox". A wrong stride or endianness
  // produces coordinates in the hundreds or NaN, never a near-miss, so a
  // generous tolerance costs nothing and tolerates a generator that places
  // nodes exactly on the boundary.
  const pad = 0.05;
  const inBbox = (lon: number, lat: number) =>
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= bbox.west - pad &&
    lon <= bbox.east + pad &&
    lat >= bbox.south - pad &&
    lat <= bbox.north + pad;

  const nodeLayout = resolveLayout(
    cell,
    "nodes",
    nodeBuffer.byteLength,
    nodeCount,
    NODE_MIN_STRIDE,
    ({ offset, stride, littleEndian }) => {
      // Sample rather than scan: 16 records spread across the file catch a
      // wrong stride (which drifts, so late records fail even when the first
      // passes) at a fraction of the cost.
      const samples = Math.min(16, nodeCount);
      for (let s = 0; s < samples; s++) {
        const i = Math.floor((s * (nodeCount - 1)) / Math.max(1, samples - 1));
        const at = offset + i * stride;
        if (at + NODE_MIN_STRIDE > nodeBuffer.byteLength) {return false;}
        if (
          !inBbox(
            nodeView.getFloat32(at, littleEndian),
            nodeView.getFloat32(at + 4, littleEndian),
          )
        ) {
          return false;
        }
      }
      return true;
    },
  );

  const lon = new Float32Array(nodeCount);
  const lat = new Float32Array(nodeCount);
  const elev = new Float32Array(nodeCount);
  const flags = new Uint8Array(nodeCount);

  for (let i = 0; i < nodeCount; i++) {
    const at = nodeLayout.offset + i * nodeLayout.stride;
    lon[i] = nodeView.getFloat32(at, nodeLayout.littleEndian);
    lat[i] = nodeView.getFloat32(at + 4, nodeLayout.littleEndian);
    elev[i] = nodeView.getFloat32(at + 8, nodeLayout.littleEndian);
    flags[i] = nodeView.getUint8(at + 12);
  }

  // ── Edges ────────────────────────────────────────────────────────────────

  if (edgeCount === 0) {
    return assemble(meta, {
      lon,
      lat,
      elev,
      flags,
      offsets: new Uint32Array(nodeCount + 1),
      edgeTo: new Uint32Array(0),
      edgeDist: new Float32Array(0),
      edgeSlope: new Float32Array(0),
      edgeTerrain: new Uint8Array(0),
    });
  }

  // Which offsets inside the record hold dist, slope and terrain is DERIVED,
  // not assumed — see detectEdgeFields for why that turned out to matter.
  let fields: EdgeFields | null = null;

  const edgeLayout = resolveLayout(
    cell,
    "edges",
    edgeBuffer.byteLength,
    edgeCount,
    EDGE_MIN_STRIDE,
    (candidate) => {
      const detected = detectEdgeFields(edgeView, candidate, edgeCount, {
        nodeCount,
        lon,
        lat,
        elev,
      });
      if (!detected) {return false;}
      fields = detected;
      return true;
    },
  );

  // resolveLayout only returns after a candidate validated, and validating is
  // what sets this.
  const edgeFields = fields as unknown as EdgeFields;

  // CSR is built by counting sort on `from`: one pass to count degrees, a
  // prefix sum, then one pass to place. Edges arrive grouped by source in
  // practice, but nothing in the format promises that, and relying on it would
  // be another unchecked assumption.
  const offsets = new Uint32Array(nodeCount + 1);
  for (let e = 0; e < edgeCount; e++) {
    const at = edgeLayout.offset + e * edgeLayout.stride;
    offsets[edgeView.getUint32(at, edgeLayout.littleEndian) + 1] += 1;
  }
  for (let i = 0; i < nodeCount; i++) {
    offsets[i + 1] += offsets[i];
  }

  const edgeTo = new Uint32Array(edgeCount);
  const edgeDist = new Float32Array(edgeCount);
  const edgeSlope = new Float32Array(edgeCount);
  const edgeTerrain = new Uint8Array(edgeCount);
  const cursor = offsets.slice(0, nodeCount);

  for (let e = 0; e < edgeCount; e++) {
    const at = edgeLayout.offset + e * edgeLayout.stride;
    const from = edgeView.getUint32(at, edgeLayout.littleEndian);
    const to = edgeView.getUint32(at + 4, edgeLayout.littleEndian);
    if (from >= nodeCount || to >= nodeCount) {
      throw new MalformedGraphError(
        cell,
        `edge ${e} references node ${from >= nodeCount ? from : to} of ${nodeCount}`,
        { edge: e, from, to, nodeCount },
      );
    }
    const slot = cursor[from]++;
    edgeTo[slot] = to;
    edgeDist[slot] = edgeView.getFloat32(
      at + edgeFields.distOffset,
      edgeLayout.littleEndian,
    );
    edgeSlope[slot] = edgeView.getFloat32(
      at + edgeFields.slopeOffset,
      edgeLayout.littleEndian,
    );
    edgeTerrain[slot] = edgeView.getUint8(at + edgeFields.terrainOffset);
  }

  reportEdgeFields(cell, edgeFields);

  return assemble(meta, {
    lon,
    lat,
    elev,
    flags,
    offsets,
    edgeTo,
    edgeDist,
    edgeSlope,
    edgeTerrain,
  });
}

function assemble(
  meta: CellMeta,
  arrays: {
    lon: Float32Array;
    lat: Float32Array;
    elev: Float32Array;
    flags: Uint8Array;
    offsets: Uint32Array;
    edgeTo: Uint32Array;
    edgeDist: Float32Array;
    edgeSlope: Float32Array;
    edgeTerrain: Uint8Array;
  },
): CellGraph {
  const bytes =
    arrays.lon.byteLength +
    arrays.lat.byteLength +
    arrays.elev.byteLength +
    arrays.flags.byteLength +
    arrays.offsets.byteLength +
    arrays.edgeTo.byteLength +
    arrays.edgeDist.byteLength +
    arrays.edgeSlope.byteLength +
    arrays.edgeTerrain.byteLength;

  return {
    key: meta.cell,
    col: meta.col,
    row: meta.row,
    bbox: meta.bbox,
    spacingM: meta.spacing_m,
    maxSlope: meta.max_slope,
    nodeCount: meta.nodeCount,
    edgeCount: arrays.edgeTo.length,
    bytes,
    ...arrays,
  };
}
