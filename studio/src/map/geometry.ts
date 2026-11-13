/**
 * Geometry helpers for editing and measuring. Vertices are addressed by a
 * path into the coordinate arrays: [] for a Point, [i] for a LineString,
 * [ring, i] for a Polygon, [part, ...] for Multi* geometries.
 */
import type { Geometry, Position } from "geojson";
import { haversine } from "../data/elevation";

export type Path = number[];

export interface Vertex {
  path: Path;
  coord: Position;
}

type Coords = Position | Coords[];

function coordsOf(g: Geometry): Coords {
  if (g.type === "GeometryCollection") {throw new Error("GeometryCollection is not editable");}
  return g.coordinates as Coords;
}

function isRingDepth(g: Geometry, depth: number): boolean {
  // Rings are closed; their last vertex repeats the first and is not shown.
  return (g.type === "Polygon" && depth === 1) || (g.type === "MultiPolygon" && depth === 2);
}

export function vertices(g: Geometry): Vertex[] {
  if (g.type === "GeometryCollection") {return [];}
  if (g.type === "Point") {return [{ path: [], coord: g.coordinates }];}
  const out: Vertex[] = [];
  const walk = (c: Coords, path: Path, depth: number) => {
    if (typeof (c as Position)[0] === "number") {
      out.push({ path, coord: c as Position });
      return;
    }
    const arr = c as Coords[];
    const n = isRingDepth(g, depth) ? arr.length - 1 : arr.length;
    for (let i = 0; i < n; i++) {walk(arr[i], [...path, i], depth + 1);}
  };
  walk(coordsOf(g), [], 0);
  return out;
}

/** Midpoints of every segment, as insertion points: inserting at `path` puts a vertex before it. */
export function midpoints(g: Geometry): Vertex[] {
  if (g.type === "Point" || g.type === "MultiPoint" || g.type === "GeometryCollection") {return [];}
  const out: Vertex[] = [];
  const walk = (c: Coords, path: Path, depth: number) => {
    const arr = c as Coords[];
    if (typeof (arr[0] as Position)[0] === "number") {
      const pts = arr as Position[];
      for (let i = 0; i < pts.length - 1; i++) {
        out.push({ path: [...path, i + 1], coord: [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2] });
      }
      return;
    }
    arr.forEach((child, i) => walk(child, [...path, i], depth + 1));
  };
  walk(coordsOf(g), [], 0);
  return out;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function parentAndIndex(root: Coords, path: Path): { parent: Position[]; index: number } {
  let node = root as Coords[];
  for (let i = 0; i < path.length - 1; i++) {node = node[path[i]] as Coords[];}
  return { parent: node as Position[], index: path[path.length - 1] };
}

export function moveVertex(g: Geometry, path: Path, to: Position): Geometry {
  const out = clone(g);
  if (out.type === "Point") {
    out.coordinates = to;
    return out;
  }
  const { parent, index } = parentAndIndex(coordsOf(out), path);
  parent[index] = to;
  if (isRingDepth(out, path.length - 1) && index === 0) {parent[parent.length - 1] = to;}
  return out;
}

export function insertVertex(g: Geometry, path: Path, at: Position): Geometry {
  const out = clone(g);
  const { parent, index } = parentAndIndex(coordsOf(out), path);
  parent.splice(index, 0, at);
  return out;
}

/** Remove a vertex if the geometry stays valid; null if it would not. */
export function deleteVertex(g: Geometry, path: Path): Geometry | null {
  if (g.type === "Point") {return null;}
  const out = clone(g);
  const { parent, index } = parentAndIndex(coordsOf(out), path);
  const ring = isRingDepth(out, path.length - 1);
  const min = ring ? 4 : 2;
  if (parent.length - 1 < min) {return null;}
  parent.splice(index, 1);
  if (ring && index === 0) {parent[parent.length - 1] = parent[0];}
  return out;
}

export function lengthM(line: Position[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) {total += haversine(line[i - 1] as [number, number], line[i] as [number, number]);}
  return total;
}

/** Area of a ring on the sphere, in m² (the method in mapbox/geojson-area). */
export function ringAreaM2(ring: Position[]): number {
  const R = 6378137;
  const rad = Math.PI / 180;
  let area = 0;
  const n = ring.length;
  if (n < 3) {return 0;}
  for (let i = 0; i < n; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % n];
    const p3 = ring[(i + 2) % n];
    area += (p3[0] * rad - p1[0] * rad) * Math.sin(p2[1] * rad);
  }
  return Math.abs((area * R * R) / 2);
}

export function polygonAreaM2(rings: Position[][]): number {
  if (rings.length === 0) {return 0;}
  return rings.slice(1).reduce((a, r) => a - ringAreaM2(r), ringAreaM2(rings[0]));
}

export function bbox(geoms: Geometry[]): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const visit = (c: Coords) => {
    if (typeof (c as Position)[0] === "number") {
      const p = c as Position;
      w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]);
      return;
    }
    (c as Coords[]).forEach(visit);
  };
  for (const g of geoms) {
    if (g.type === "GeometryCollection") {g.geometries.forEach((x) => bbox([x]) && visit(coordsOf(x)));}
    else {visit(coordsOf(g));}
  }
  return w === Infinity ? null : [w, s, e, n];
}

export function formatLength(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 100000 ? 0 : 2)} km` : `${m.toFixed(0)} m`;
}

export function formatArea(m2: number): string {
  return m2 >= 1e6 ? `${(m2 / 1e6).toFixed(m2 >= 1e8 ? 0 : 2)} km²` : `${m2.toFixed(0)} m²`;
}
