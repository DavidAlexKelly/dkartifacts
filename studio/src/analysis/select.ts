/**
 * Selection: by expression and by location. The spatial predicates and the
 * geometry-to-geometry distance here are also what processing.ts joins with.
 */
import * as turf from "@turf/turf";
import type { Feature, Geometry, Position } from "geojson";
import type { StudioFeature } from "../project/types";
import { compile, truthy } from "./expression";

export type LocationPredicate = "intersects" | "within" | "contains" | "disjoint" | "withinDistance";

type BBox = [number, number, number, number];

function feat(g: Geometry): Feature<Geometry> {
  return { type: "Feature", geometry: g, properties: {} };
}

/** Ids of the features the expression is true for. Throws ExpressionError on bad source. */
export function selectByExpression(features: StudioFeature[], source: string): string[] {
  const expr = compile(source);
  const out: string[] = [];
  for (const f of features) {
    try {
      if (truthy(expr.evaluate(f))) {out.push(f.id);}
    } catch {
      // A feature the expression cannot be evaluated on is not selected.
    }
  }
  return out;
}

// ── Geometry helpers ───────────────────────────────────────────────────────

export function geometryBBox(g: Geometry): BBox | null {
  try {
    const b = turf.bbox(g) as number[];
    return b.every(Number.isFinite) ? [b[0], b[1], b[2], b[3]] : null;
  } catch {
    return null;
  }
}

export function bboxesOverlap(a: BBox | null, b: BBox | null, padDeg = 0): boolean {
  if (!a || !b) {return false;}
  return a[0] - padDeg <= b[2] && b[0] - padDeg <= a[2] && a[1] - padDeg <= b[3] && b[1] - padDeg <= a[3];
}

/** Flatten a geometry into simple parts (Point, LineString, Polygon). */
export function simpleParts(g: Geometry | null): Geometry[] {
  if (!g) {return [];}
  switch (g.type) {
    case "MultiPoint":
      return g.coordinates.map((c) => ({ type: "Point", coordinates: c }));
    case "MultiLineString":
      return g.coordinates.map((c) => ({ type: "LineString", coordinates: c }));
    case "MultiPolygon":
      return g.coordinates.map((c) => ({ type: "Polygon", coordinates: c }));
    case "GeometryCollection":
      return g.geometries.flatMap(simpleParts);
    default:
      return [g];
  }
}

function allPositions(g: Geometry): Position[] {
  const out: Position[] = [];
  turf.coordEach(feat(g), (c) => {
    out.push(c);
  });
  return out;
}

export function isPolygonal(g: Geometry | null): boolean {
  return !!g && (g.type === "Polygon" || g.type === "MultiPolygon");
}

function safeIntersects(a: Geometry, b: Geometry): boolean {
  try {
    return turf.booleanIntersects(a, b);
  } catch {
    return false;
  }
}

/** a lies within b: no part of a is outside b. */
function within(a: Geometry, b: Geometry): boolean {
  const pa = simpleParts(a);
  const pb = simpleParts(b);
  if (pa.length === 0 || pb.length === 0) {return false;}
  // Each part of a must be within some part of b (or, for polygonal b, within b as a whole).
  return pa.every((x) => {
    for (const y of pb) {
      try {
        if (turf.booleanWithin(x, y)) {return true;}
      } catch {
        // Unsupported pair: fall back to the vertex test below.
      }
    }
    if (isPolygonal(b)) {
      const pts = allPositions(x);
      return pts.length > 0 && pts.every((p) => turf.booleanPointInPolygon(p, b as never));
    }
    return false;
  });
}

/** Whether a stands in the relation to b. withinDistance needs distanceM. */
export function spatialPredicate(a: Geometry, b: Geometry, predicate: LocationPredicate, distanceM = 0): boolean {
  switch (predicate) {
    case "intersects":
      return bboxesOverlap(geometryBBox(a), geometryBBox(b)) && safeIntersects(a, b);
    case "disjoint":
      return !(bboxesOverlap(geometryBBox(a), geometryBBox(b)) && safeIntersects(a, b));
    case "within":
      return bboxesOverlap(geometryBBox(a), geometryBBox(b)) && within(a, b);
    case "contains":
      return bboxesOverlap(geometryBBox(a), geometryBBox(b)) && within(b, a);
    case "withinDistance": {
      // Cheap reject: 1° of latitude is ~111 km; longitude degrees are never longer.
      const pad = distanceM / 111000 / Math.max(0.01, Math.cos(maxAbsLat(a, b) * Math.PI / 180));
      if (!bboxesOverlap(geometryBBox(a), geometryBBox(b), pad)) {return false;}
      return geometryDistanceM(a, b) <= distanceM;
    }
    default:
      throw new Error(`Unknown predicate: ${String(predicate)}`);
  }
}

function maxAbsLat(a: Geometry, b: Geometry): number {
  const ba = geometryBBox(a);
  const bb = geometryBBox(b);
  return Math.min(89, Math.max(Math.abs(ba?.[1] ?? 0), Math.abs(ba?.[3] ?? 0), Math.abs(bb?.[1] ?? 0), Math.abs(bb?.[3] ?? 0)));
}

/** Distance in metres from a point to a simple geometry part (0 inside a polygon). */
function pointToPartM(p: Position, part: Geometry): number {
  if (part.type === "Point") {return turf.distance(p, part.coordinates, { units: "meters" });}
  if (part.type === "LineString") {
    if (part.coordinates.length === 1) {return turf.distance(p, part.coordinates[0], { units: "meters" });}
    return turf.pointToLineDistance(p, turf.lineString(part.coordinates), { units: "meters" });
  }
  if (part.type === "Polygon") {
    if (turf.booleanPointInPolygon(p, part)) {return 0;}
    let best = Infinity;
    for (const ring of part.coordinates) {
      if (ring.length >= 2) {best = Math.min(best, turf.pointToLineDistance(p, turf.lineString(ring), { units: "meters" }));}
    }
    return best;
  }
  return Infinity;
}

/**
 * Shortest distance between two geometries in metres; 0 when they
 * intersect. Two disjoint segments are closest at an endpoint of one of
 * them, so measuring every vertex of each against the other is exact.
 */
export function geometryDistanceM(a: Geometry, b: Geometry): number {
  if (safeIntersects(a, b)) {return 0;}
  const pa = simpleParts(a);
  const pb = simpleParts(b);
  let best = Infinity;
  try {
    for (const x of pa) {
      for (const y of pb) {
        for (const p of allPositions(x)) {best = Math.min(best, pointToPartM(p, y));}
        if (x.type !== "Point") {for (const p of allPositions(y)) {best = Math.min(best, pointToPartM(p, x));}}
      }
    }
  } catch {
    return Infinity;
  }
  return best;
}

/**
 * Ids of features standing in the relation to at least one reference
 * geometry ("disjoint": to none of them, i.e. disjoint from all).
 */
export function selectByLocation(
  features: StudioFeature[],
  reference: Geometry[],
  predicate: LocationPredicate,
  distanceM = 0,
): string[] {
  const refs = reference.filter((g): g is Geometry => !!g);
  const out: string[] = [];
  for (const f of features) {
    if (!f.geometry) {continue;}
    const g = f.geometry;
    const hit = predicate === "disjoint"
      ? refs.every((r) => spatialPredicate(g, r, "disjoint"))
      : refs.some((r) => spatialPredicate(g, r, predicate, distanceM));
    if (hit) {out.push(f.id);}
  }
  return out;
}
