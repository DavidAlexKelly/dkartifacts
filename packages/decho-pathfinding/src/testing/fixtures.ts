/**
 * Synthetic cells, byte-for-byte in the real format.
 *
 * The parser, the stitcher and the search are the three places in this package
 * where a mistake produces a plausible answer rather than an error, and none of
 * them can be tested against the real dataset from a unit test: the chunks are
 * megabytes, behind auth, and their contents are not known in advance.
 *
 * So the tests build cells whose right answer is known by construction — a
 * regular node lattice with chosen elevations, terrain and holes — and encode
 * them exactly as nodes.bin/edges.bin, including the ability to emit a PADDED
 * stride or BIG-ENDIAN words. That last part is the point: it is the only way
 * to prove that the layout detection in format.ts works, rather than that it
 * happens to agree with the encoder.
 *
 * Not exported from the package barrel — it is built into dist so that a
 * consumer's own tests can reach it by deep import if they want to, but it is
 * not part of the supported surface.
 */

import type { CellMeta } from "../core/format";
import { haversineM } from "../core/geo";
import { cellBounds, cellKey, type CellGrid } from "../core/grid";

export interface SyntheticCellSpec {
  grid: CellGrid;
  col: number;
  row: number;
  /** Nodes per axis. The lattice is inset half a step from every edge. */
  size: number;
  /** Metres above sea level. Defaults to flat. */
  elevation?: (lon: number, lat: number) => number;
  /** Terrain class per node pair; the edge takes the lower of its ends. */
  terrain?: (i: number, j: number) => number;
  /** Nodes to omit, mirroring how the generator drops impassable ground. */
  omit?: (i: number, j: number) => boolean;
  /** Eight-way connectivity. Defaults to four-way, which keeps costs obvious. */
  diagonals?: boolean;
  maxSlope?: number;
}

export interface EncodingSpec {
  nodeStride?: number;
  edgeStride?: number;
  littleEndian?: boolean;
  headerBytes?: number;
  /**
   * Where dist, slope and terrain sit inside an edge record.
   *
   * Defaults to the documented order. Overriding it is how the tests reproduce
   * the failure that made the parser derive these offsets instead of trusting
   * them: a generator that writes terrain before slope produces a file the
   * documented offsets read as "slope 0, terrain 143", which costs every edge
   * the same and turns every route into a straight line.
   */
  edgeFieldOffsets?: { dist: number; slope: number; terrain: number };
}

export interface SyntheticCell {
  meta: CellMeta;
  nodes: ArrayBuffer;
  edges: ArrayBuffer;
  /** (i, j) -> node index, or -1 where omitted. Row-major, i = column. */
  indexOf: (i: number, j: number) => number;
  lon: number[];
  lat: number[];
}

export function buildSyntheticCell(
  spec: SyntheticCellSpec,
  encoding: EncodingSpec = {},
): SyntheticCell {
  const {
    grid,
    col,
    row,
    size,
    elevation = () => 0,
    terrain = () => 1,
    omit = () => false,
    diagonals = false,
    maxSlope = 0.4,
  } = spec;

  const bbox = cellBounds(grid, col, row);
  const step = grid.cellDeg / size;

  const lon: number[] = [];
  const lat: number[] = [];
  const elev: number[] = [];
  const index = new Int32Array(size * size).fill(-1);

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      if (omit(i, j)) {continue;}
      const nodeLon = bbox.west + (i + 0.5) * step;
      const nodeLat = bbox.north - (j + 0.5) * step;
      index[j * size + i] = lon.length;
      lon.push(nodeLon);
      lat.push(nodeLat);
      elev.push(elevation(nodeLon, nodeLat));
    }
  }

  const indexOf = (i: number, j: number) =>
    i < 0 || j < 0 || i >= size || j >= size ? -1 : index[j * size + i];

  const offsets: Array<[number, number]> = diagonals
    ? [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]
    : [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];

  interface Edge {
    from: number;
    to: number;
    dist: number;
    slope: number;
    terrain: number;
  }
  const edges: Edge[] = [];

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const a = indexOf(i, j);
      if (a < 0) {continue;}
      for (const [di, dj] of offsets) {
        const b = indexOf(i + di, j + dj);
        if (b < 0) {continue;}
        const dist = haversineM(lon[a], lat[a], lon[b], lat[b]);
        const slope = (elev[b] - elev[a]) / dist;
        // Both directions are stored, each with its own signed slope — the
        // real files do the same, which is why the parser must not treat the
        // edge list as undirected.
        if (Math.abs(slope) > maxSlope) {continue;}
        edges.push({
          from: a,
          to: b,
          dist,
          slope,
          terrain: Math.min(terrain(i, j), terrain(i + di, j + dj)),
        });
      }
    }
  }

  // Nominal node spacing: what the generator would have aimed for, measured
  // across the middle of the cell so latitude convergence is accounted for.
  const midLat = (bbox.north + bbox.south) / 2;
  const spacingM = haversineM(bbox.west, midLat, bbox.west + step, midLat);

  const meta: CellMeta = {
    cell: cellKey(col, row),
    col,
    row,
    bbox,
    spacing_m: spacingM,
    max_slope: maxSlope,
    nodeCount: lon.length,
    edgeCount: edges.length,
    terrainClasses: { "1": "open", "2": "road" },
    costModel: "dist_m * (1 + k_vehicle * slope) * m[vehicle][terrain]",
    format: {
      nodes: "NODE v1: lon,f32 lat,f32 elev,f32 flags,u8",
      edges: "EDGE v1: from,u32 to,u32 dist,f32 slope,f32 terrain,u8",
    },
  };

  const littleEndian = encoding.littleEndian ?? true;
  const headerBytes = encoding.headerBytes ?? 0;
  const nodeStride = encoding.nodeStride ?? 13;
  const edgeStride = encoding.edgeStride ?? 17;

  const nodeBuffer = new ArrayBuffer(headerBytes + lon.length * nodeStride);
  const nodeView = new DataView(nodeBuffer);
  for (let n = 0; n < lon.length; n++) {
    const at = headerBytes + n * nodeStride;
    nodeView.setFloat32(at, lon[n], littleEndian);
    nodeView.setFloat32(at + 4, lat[n], littleEndian);
    nodeView.setFloat32(at + 8, elev[n], littleEndian);
    nodeView.setUint8(at + 12, 0);
  }

  const fieldOffsets = encoding.edgeFieldOffsets ?? {
    dist: 8,
    slope: 12,
    terrain: 16,
  };

  const edgeBuffer = new ArrayBuffer(headerBytes + edges.length * edgeStride);
  const edgeView = new DataView(edgeBuffer);
  for (let e = 0; e < edges.length; e++) {
    const at = headerBytes + e * edgeStride;
    edgeView.setUint32(at, edges[e].from, littleEndian);
    edgeView.setUint32(at + 4, edges[e].to, littleEndian);
    edgeView.setFloat32(at + fieldOffsets.dist, edges[e].dist, littleEndian);
    edgeView.setFloat32(at + fieldOffsets.slope, edges[e].slope, littleEndian);
    edgeView.setUint8(at + fieldOffsets.terrain, edges[e].terrain);
  }

  return { meta, nodes: nodeBuffer, edges: edgeBuffer, indexOf, lon, lat };
}

/**
 * A stand-in for the dataset: cell key -> its three files, ready to be served
 * by a mocked byte layer.
 */
export function syntheticDataset(
  cells: SyntheticCell[],
  pathTemplate = "pathfinding/{cell}",
): Map<string, ArrayBuffer> {
  const files = new Map<string, ArrayBuffer>();
  for (const cell of cells) {
    const dir = pathTemplate.replace("{cell}", cell.meta.cell);
    files.set(
      `${dir}/meta.json`,
      new TextEncoder().encode(JSON.stringify(cell.meta)).buffer as ArrayBuffer,
    );
    files.set(`${dir}/nodes.bin`, cell.nodes);
    files.set(`${dir}/edges.bin`, cell.edges);
  }
  return files;
}
