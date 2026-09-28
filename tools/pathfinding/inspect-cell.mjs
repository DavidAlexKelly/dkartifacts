/**
 * Describe what is actually inside a pathfinding cell.
 *
 * Routing can be wrong in a way that produces no error at all: if `terrain`
 * decodes to a constant and `slope` to zero, every edge costs `dist`, every
 * vehicle profile agrees, and the "shortest path" is a straight line. That is
 * indistinguishable from a working router until you look at the numbers, so
 * this prints them.
 *
 *   node tools/pathfinding/inspect-cell.mjs [cell] [datasetRid]
 *   node tools/pathfinding/inspect-cell.mjs c091_r018
 *
 * Reads through the Code Workspace's own credentials ($FOUNDRY_TOKEN against
 * the internal API host), so it needs no OAuth app and no Resources grant —
 * which also makes it the quickest way to tell a data problem from a
 * permissions one.
 */

const DEFAULT_RID = "ri.foundry.main.dataset.35f5ccc8-2cd1-4133-bb56-f87527ef314a";

const CELL = process.argv[2] ?? "c091_r018";
const RID = process.argv[3] ?? DEFAULT_RID;
const HOST = process.env.FOUNDRY_PYTHON_OSDK_HOSTNAME;
const TOKEN = process.env.FOUNDRY_TOKEN;

if (!HOST || !TOKEN) {
  console.error(
    "Needs FOUNDRY_PYTHON_OSDK_HOSTNAME and FOUNDRY_TOKEN — run this inside a Code Workspace terminal.",
  );
  process.exit(1);
}

async function read(path) {
  const url = `https://${HOST}/api/v2/datasets/${encodeURIComponent(
    RID,
  )}/files/${encodeURIComponent(path)}/content`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (res.status === 403 || res.status === 404) {
    // Measured 2026-09-01: the workspace token reaches the proxy (an ontology
    // call returns 403, not a connection error) but cannot read datasets
    // through it, and Foundry answers 404 rather than 403 for a resource you
    // may not see. So this is far more likely to be scope than a typo.
    throw new Error(
      `${res.status} for ${path}. The Code Workspace token may not carry ` +
        "dataset read scope — in that case use the browser instead: the app " +
        "logs the detected layout and the verified field offsets on the first " +
        "cell it parses.",
    );
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${path}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

const meta = JSON.parse((await read(`pathfinding/${CELL}/meta.json`)).toString());
const nodes = await read(`pathfinding/${CELL}/nodes.bin`);
const edges = await read(`pathfinding/${CELL}/edges.bin`);

console.log(
  "meta:",
  JSON.stringify(
    {
      cell: meta.cell,
      bbox: meta.bbox,
      spacing_m: meta.spacing_m,
      max_slope: meta.max_slope,
      nodeCount: meta.nodeCount,
      edgeCount: meta.edgeCount,
      terrainClasses: meta.terrainClasses,
      format: meta.format,
    },
    null,
    2,
  ),
);

/** Same arithmetic the parser does: stride from the count, header from the rest. */
function layout(buffer, count, minStride, label) {
  for (let stride = minStride; stride <= 128; stride++) {
    const remainder = buffer.length - stride * count;
    if (remainder < 0) break;
    if (remainder <= 256) return { stride, header: remainder };
  }
  throw new Error(`no plausible layout for ${label}`);
}

const n = layout(nodes, meta.nodeCount, 13, "nodes");
const e = layout(edges, meta.edgeCount, 17, "edges");
console.log(
  `\nnodes.bin ${nodes.length} B -> ${n.stride}-byte records after ${n.header}-byte header`,
);
console.log(
  `edges.bin ${edges.length} B -> ${e.stride}-byte records after ${e.header}-byte header`,
);
console.log(
  "node header:",
  nodes.subarray(0, n.header),
  JSON.stringify(nodes.subarray(0, n.header).toString("latin1")),
);
console.log(
  "edge header:",
  edges.subarray(0, e.header),
  JSON.stringify(edges.subarray(0, e.header).toString("latin1")),
);

// ── Nodes ────────────────────────────────────────────────────────────────────

const flagHist = new Map();
let minLon = Infinity,
  maxLon = -Infinity,
  minLat = Infinity,
  maxLat = -Infinity;
let minElev = Infinity,
  maxElev = -Infinity;

for (let i = 0; i < meta.nodeCount; i++) {
  const at = n.header + i * n.stride;
  const lon = nodes.readFloatLE(at);
  const lat = nodes.readFloatLE(at + 4);
  const elev = nodes.readFloatLE(at + 8);
  const flags = nodes.readUInt8(at + 12);
  if (lon < minLon) minLon = lon;
  if (lon > maxLon) maxLon = lon;
  if (lat < minLat) minLat = lat;
  if (lat > maxLat) maxLat = lat;
  if (elev < minElev) minElev = elev;
  if (elev > maxElev) maxElev = elev;
  flagHist.set(flags, (flagHist.get(flags) ?? 0) + 1);
}

console.log("\nnodes:");
console.log(
  `  lon  ${minLon.toFixed(4)} .. ${maxLon.toFixed(4)}   (bbox ${meta.bbox.west} .. ${meta.bbox.east})`,
);
console.log(
  `  lat  ${minLat.toFixed(4)} .. ${maxLat.toFixed(4)}   (bbox ${meta.bbox.south} .. ${meta.bbox.north})`,
);
console.log(`  elev ${minElev.toFixed(1)} .. ${maxElev.toFixed(1)}`);
console.log("  flags:", [...flagHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
console.log("  bytes after flags in node 0:", [
  ...nodes.subarray(n.header + 13, n.header + n.stride),
]);

// ── Edges ────────────────────────────────────────────────────────────────────

const terrainHist = new Map();
let minDist = Infinity,
  maxDist = -Infinity,
  sumDist = 0;
let minSlope = Infinity,
  maxSlope = -Infinity,
  sumAbsSlope = 0,
  zeroSlope = 0;
let badIndex = 0;

for (let i = 0; i < meta.edgeCount; i++) {
  const at = e.header + i * e.stride;
  const from = edges.readUInt32LE(at);
  const to = edges.readUInt32LE(at + 4);
  const dist = edges.readFloatLE(at + 8);
  const slope = edges.readFloatLE(at + 12);
  const terrain = edges.readUInt8(at + 16);
  if (from >= meta.nodeCount || to >= meta.nodeCount) badIndex++;
  if (dist < minDist) minDist = dist;
  if (dist > maxDist) maxDist = dist;
  sumDist += dist;
  if (slope < minSlope) minSlope = slope;
  if (slope > maxSlope) maxSlope = slope;
  sumAbsSlope += Math.abs(slope);
  if (slope === 0) zeroSlope++;
  terrainHist.set(terrain, (terrainHist.get(terrain) ?? 0) + 1);
}

console.log("\nedges:");
console.log(`  out-of-range indices: ${badIndex}`);
console.log(
  `  dist  ${minDist.toFixed(1)} .. ${maxDist.toFixed(1)}  mean ${(sumDist / meta.edgeCount).toFixed(1)}`,
);
console.log(
  `  slope ${minSlope.toFixed(4)} .. ${maxSlope.toFixed(4)}  mean|slope| ${(sumAbsSlope / meta.edgeCount).toFixed(4)}  exactly zero: ${zeroSlope} (${((100 * zeroSlope) / meta.edgeCount).toFixed(1)}%)`,
);
console.log(
  "  terrain:",
  [...terrainHist.entries()].sort((a, b) => b[1] - a[1]),
);
console.log(
  "  first 3 records:",
  [0, 1, 2].map((i) => {
    const at = e.header + i * e.stride;
    return {
      from: edges.readUInt32LE(at),
      to: edges.readUInt32LE(at + 4),
      dist: +edges.readFloatLE(at + 8).toFixed(2),
      slope: +edges.readFloatLE(at + 12).toFixed(4),
      terrain: edges.readUInt8(at + 16),
      tail: [...edges.subarray(at + 17, at + e.stride)],
    };
  }),
);
