/**
 * Geoprocessing tools, in the spirit of QGIS's Processing toolbox.
 *
 * Every tool takes features and returns new ones (fresh ids, inputs never
 * mutated) plus the fields of the result. Distances are metres. Geometry a
 * tool cannot handle (invalid rings, a type the tool does not apply to) is
 * skipped and counted in `message` rather than thrown.
 */
import * as turf from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";
import { newId, type StudioFeature } from "../project/types";
import { toNumber } from "./expression";
import { bboxesOverlap, geometryBBox, geometryDistanceM, isPolygonal, simpleParts, spatialPredicate } from "./select";

export interface ToolResult {
  features: StudioFeature[];
  fields: string[];
  message?: string;
}

type Poly = Polygon | MultiPolygon;

// ── Helpers ────────────────────────────────────────────────────────────────

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function make(geometry: Geometry, properties: Record<string, unknown>): StudioFeature {
  return { type: "Feature", id: newId("f"), geometry: clone(geometry), properties: { ...properties } };
}

function feat<G extends Geometry>(g: G): Feature<G> {
  return { type: "Feature", geometry: g, properties: {} };
}

function fc<G extends Geometry>(gs: G[]): FeatureCollection<G> {
  return { type: "FeatureCollection", features: gs.map(feat) };
}

function fieldsOf(features: StudioFeature[]): string[] {
  const seen = new Set<string>();
  for (const f of features) {for (const k of Object.keys(f.properties)) {seen.add(k);}}
  return [...seen];
}

function result(features: StudioFeature[], notes: Array<string | false | null | undefined> = [], fields?: string[]): ToolResult {
  const msgs = notes.filter((n): n is string => !!n);
  if (features.length === 0) {msgs.unshift("The result is empty.");}
  const r: ToolResult = { features, fields: fields ?? fieldsOf(features) };
  if (msgs.length) {r.message = msgs.join(" ");}
  return r;
}

function skippedNote(n: number, why: string): string | null {
  return n > 0 ? `Skipped ${n} feature${n === 1 ? "" : "s"} (${why}).` : null;
}

function polyParts(g: Geometry | null): Polygon[] {
  return simpleParts(g).filter((p): p is Polygon => p.type === "Polygon" && p.coordinates.length > 0 && p.coordinates[0].length >= 4);
}

function fromPolygons(parts: Polygon[]): Poly | null {
  if (parts.length === 0) {return null;}
  if (parts.length === 1) {return parts[0];}
  return { type: "MultiPolygon", coordinates: parts.map((p) => p.coordinates) };
}

/** Union of polygonal geometries; null when there is nothing (or it fails). */
export function unionPolygons(geoms: Geometry[]): Poly | null {
  const parts = geoms.flatMap(polyParts);
  if (parts.length === 0) {return null;}
  if (parts.length === 1) {return clone(parts[0]);}
  try {
    return turf.union(fc(parts))?.geometry ?? null;
  } catch {
    // One bad part should not sink the rest: add them one at a time.
    let acc: Poly | null = null;
    for (const p of parts) {
      try {
        acc = acc ? turf.union(fc<Poly>([acc, p]))?.geometry ?? acc : p;
      } catch {
        // skip this part
      }
    }
    return acc;
  }
}

function intersectPoly(a: Poly, b: Poly): Poly | null {
  return turf.intersect(fc<Poly>([a, b]))?.geometry ?? null;
}

function differencePoly(a: Poly, erase: Poly[]): Poly | null {
  if (erase.length === 0) {return a;}
  return turf.difference(fc<Poly>([a, ...erase]))?.geometry ?? null;
}

function lineParts(g: Geometry | null): LineString[] {
  return simpleParts(g).filter((p): p is LineString => p.type === "LineString" && p.coordinates.length >= 2);
}

function fromLines(parts: LineString[]): LineString | MultiLineString | null {
  if (parts.length === 0) {return null;}
  if (parts.length === 1) {return parts[0];}
  return { type: "MultiLineString", coordinates: parts.map((p) => p.coordinates) };
}

function fromPoints(pts: Position[]): Geometry | null {
  if (pts.length === 0) {return null;}
  if (pts.length === 1) {return { type: "Point", coordinates: pts[0] };}
  return { type: "MultiPoint", coordinates: pts };
}

function pointPositions(g: Geometry | null): Position[] {
  return simpleParts(g).filter((p) => p.type === "Point").map((p) => (p as { coordinates: Position }).coordinates);
}

function inside(p: Position, mask: Poly): boolean {
  return turf.booleanPointInPolygon(p, mask);
}

/** Midpoint along a line, for deciding which side of a mask a piece is on. */
function lineMid(l: LineString): Position {
  const len = turf.length(feat(l), { units: "meters" });
  if (len === 0) {return l.coordinates[0];}
  return turf.along(l, len / 2, { units: "meters" }).geometry.coordinates;
}

/** The part of a geometry inside (keepInside) or outside a polygonal mask. */
function clipToMask(g: Geometry, mask: Poly, keepInside: boolean): Geometry | null {
  const polys = polyParts(g);
  const lines = lineParts(g);
  const pts = pointPositions(g);
  const out: Geometry[] = [];
  if (polys.length) {
    const p = fromPolygons(polys)!;
    const r = keepInside ? intersectPoly(p, mask) : differencePoly(p, [mask]);
    if (r) {out.push(r);}
  }
  if (lines.length) {
    const kept: LineString[] = [];
    for (const l of lines) {
      const pieces = turf.lineSplit(feat(l), feat(mask)).features.map((x) => x.geometry);
      for (const piece of pieces.length ? pieces : [l]) {
        if (piece.coordinates.length < 2) {continue;}
        if (inside(lineMid(piece), mask) === keepInside) {kept.push(piece);}
      }
    }
    const r = fromLines(kept);
    if (r) {out.push(r);}
  }
  if (pts.length) {
    const r = fromPoints(pts.filter((p) => inside(p, mask) === keepInside));
    if (r) {out.push(r);}
  }
  if (out.length === 0) {return null;}
  return out.length === 1 ? out[0] : { type: "GeometryCollection", geometries: out };
}

/** Merge geometries into one: polygons are unioned, lines and points collected. */
function mergeGeometries(geoms: Geometry[]): Geometry | null {
  const polys = geoms.flatMap(polyParts);
  const lines = geoms.flatMap(lineParts);
  const pts = geoms.flatMap(pointPositions);
  const out: Geometry[] = [];
  const u = unionPolygons(polys);
  if (u) {out.push(u);}
  const l = fromLines(lines);
  if (l) {out.push(l);}
  const p = fromPoints(pts);
  if (p) {out.push(p);}
  if (out.length === 0) {return null;}
  return out.length === 1 ? out[0] : { type: "GeometryCollection", geometries: out };
}

function geomOf(f: StudioFeature): Geometry | null {
  return f.geometry ?? null;
}

// ── Tools ──────────────────────────────────────────────────────────────────

export function buffer(features: StudioFeature[], distanceM: number, steps = 8, dissolve = false): ToolResult {
  if (!Number.isFinite(distanceM)) {return result([], ["Buffer distance must be a number."]);}
  const out: StudioFeature[] = [];
  let bad = 0;
  for (const f of features) {
    const g = geomOf(f);
    if (!g) {
      bad++;
      continue;
    }
    try {
      const b = turf.buffer(feat(g), distanceM, { units: "meters", steps: Math.max(1, Math.round(steps)) });
      if (b && b.geometry && polyParts(b.geometry).length) {out.push(make(b.geometry, f.properties));}
      else if (distanceM >= 0) {bad++;}
    } catch {
      bad++;
    }
  }
  if (dissolve) {
    const u = unionPolygons(out.map((f) => f.geometry));
    return result(u ? [make(u, {})] : [], [skippedNote(bad, "could not be buffered")], []);
  }
  return result(out, [skippedNote(bad, "could not be buffered")], fieldsOf(features));
}

function maskOf(features: StudioFeature[]): Poly | null {
  return unionPolygons(features.map((f) => f.geometry));
}

function clipOrErase(input: StudioFeature[], maskFeatures: StudioFeature[], keepInside: boolean): ToolResult {
  const mask = maskOf(maskFeatures);
  const fields = fieldsOf(input);
  if (!mask) {
    if (keepInside) {return result([], ["The clip layer has no polygons."], fields);}
    return result(input.map((f) => make(f.geometry, f.properties)), ["The erase layer has no polygons; nothing was removed."], fields);
  }
  const mb = geometryBBox(mask);
  const out: StudioFeature[] = [];
  let bad = 0;
  for (const f of input) {
    const g = geomOf(f);
    if (!g) {
      bad++;
      continue;
    }
    if (!bboxesOverlap(geometryBBox(g), mb)) {
      if (!keepInside) {out.push(make(g, f.properties));}
      continue;
    }
    try {
      const r = clipToMask(g, mask, keepInside);
      if (r) {out.push(make(r, f.properties));}
    } catch {
      bad++;
    }
  }
  return result(out, [skippedNote(bad, "invalid geometry")], fields);
}

/** The parts of input features inside the clip polygons. */
export function clip(input: StudioFeature[], clipFeatures: StudioFeature[]): ToolResult {
  return clipOrErase(input, clipFeatures, true);
}

/** The parts of input features outside the erase polygons. */
export function difference(input: StudioFeature[], eraseFeatures: StudioFeature[]): ToolResult {
  return clipOrErase(input, eraseFeatures, false);
}

function prefixed(props: Record<string, unknown>, taken: Set<string>, prefix: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {out[taken.has(k) ? prefix + k : k] = v;}
  return out;
}

/** Overlaps of every a with every polygon of b, carrying the attributes of both ("b_" on clashes). */
export function intersect(a: StudioFeature[], b: StudioFeature[]): ToolResult {
  const aFields = fieldsOf(a);
  const taken = new Set(aFields);
  const bPolys = b.filter((f) => isPolygonal(f.geometry));
  const bBoxes = bPolys.map((f) => geometryBBox(f.geometry));
  const out: StudioFeature[] = [];
  let bad = 0;
  for (const fa of a) {
    const g = geomOf(fa);
    if (!g) {continue;}
    const ab = geometryBBox(g);
    bPolys.forEach((fb, j) => {
      if (!bboxesOverlap(ab, bBoxes[j])) {return;}
      try {
        const r = clipToMask(g, fb.geometry as Poly, true);
        if (r) {out.push(make(r, { ...fa.properties, ...prefixed(fb.properties, taken, "b_") }));}
      } catch {
        bad++;
      }
    });
  }
  const fields = [...aFields, ...fieldsOf(bPolys).map((k) => (taken.has(k) ? "b_" + k : k))];
  return result(out, [
    bPolys.length < b.length && `${b.length - bPolys.length} non-polygon feature(s) of the overlay layer were ignored.`,
    bad > 0 && `${bad} pair(s) could not be intersected.`,
  ], [...new Set(fields)]);
}

/** Everything merged into one feature: polygons unioned, lines and points collected. */
export function dissolveAll(features: StudioFeature[]): ToolResult {
  const g = mergeGeometries(features.map((f) => f.geometry).filter(Boolean));
  return result(g ? [make(g, { count: features.length })] : [], [], ["count"]);
}

export const union = dissolveAll;

/** One feature per distinct value of field, keeping that field. */
export function dissolve(features: StudioFeature[], field: string): ToolResult {
  const groups = new Map<string, { value: unknown; geoms: Geometry[] }>();
  for (const f of features) {
    if (!f.geometry) {continue;}
    const v = f.properties[field] ?? null;
    const key = v === null ? "\u0000null" : typeof v === "object" ? JSON.stringify(v) : `${typeof v}:${String(v)}`;
    let g = groups.get(key);
    if (!g) {
      g = { value: v, geoms: [] };
      groups.set(key, g);
    }
    g.geoms.push(f.geometry);
  }
  const out: StudioFeature[] = [];
  for (const g of groups.values()) {
    const m = mergeGeometries(g.geoms);
    if (m) {out.push(make(m, { [field]: g.value, count: g.geoms.length }));}
  }
  return result(out, [], [field, "count"]);
}

export type JoinPredicate = "intersects" | "within" | "contains";
export type JoinMode = "first" | "count" | { sum: string } | { mean: string };

/**
 * Attributes from `join` onto each `target` feature it relates to by the
 * predicate (target within join, etc.). "first" copies the first match's
 * attributes ("join_" on clashes); "count", sum and mean aggregate.
 */
export function spatialJoin(target: StudioFeature[], join: StudioFeature[], predicate: JoinPredicate, mode: JoinMode): ToolResult {
  const tFields = fieldsOf(target);
  const taken = new Set(tFields);
  const jBoxes = join.map((f) => (f.geometry ? geometryBBox(f.geometry) : null));
  const jFields = fieldsOf(join);
  let added: string[];
  if (mode === "first") {added = jFields.map((k) => (taken.has(k) ? "join_" + k : k));}
  else if (mode === "count") {added = ["join_count"];}
  else if ("sum" in mode) {added = [`sum_${mode.sum}`];}
  else {added = [`mean_${mode.mean}`];}
  let matched = 0;
  const out = target.map((t) => {
    const props: Record<string, unknown> = { ...t.properties };
    const tg = t.geometry;
    const hits = tg
      ? join.filter((j, i) => j.geometry && bboxesOverlap(geometryBBox(tg), jBoxes[i]) && spatialPredicate(tg, j.geometry, predicate))
      : [];
    if (hits.length) {matched++;}
    if (mode === "first") {
      for (const k of added) {props[k] = null;}
      if (hits[0]) {Object.assign(props, prefixed(hits[0].properties, taken, "join_"));}
    } else if (mode === "count") {
      props.join_count = hits.length;
    } else {
      const field = "sum" in mode ? mode.sum : mode.mean;
      const nums = hits.map((h) => toNumber(h.properties[field])).filter((n): n is number => n !== null);
      const sum = nums.reduce((s, n) => s + n, 0);
      props[added[0]] = "sum" in mode ? sum : nums.length ? sum / nums.length : null;
    }
    return make(t.geometry, props);
  });
  return result(out, [`${matched} of ${target.length} feature(s) matched.`], [...new Set([...tFields, ...added])]);
}

/** For each input, the nearest target: near_id, near_dist_m and (with a label field) near_label. */
export function nearest(input: StudioFeature[], targets: StudioFeature[], targetLabelField?: string): ToolResult {
  const usable = targets.filter((t) => t.geometry);
  const fields = [...fieldsOf(input), "near_id", "near_dist_m", ...(targetLabelField ? ["near_label"] : [])];
  if (usable.length === 0) {return result(input.map((f) => make(f.geometry, f.properties)), ["The target layer is empty."], [...new Set(fields)]);}
  const out = input.map((f) => {
    let best: StudioFeature | null = null;
    let bestD = Infinity;
    if (f.geometry) {
      for (const t of usable) {
        if (t.id === f.id && targets === input) {continue;}
        const d = geometryDistanceM(f.geometry, t.geometry);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
    }
    const props: Record<string, unknown> = { ...f.properties, near_id: best?.id ?? null, near_dist_m: best ? bestD : null };
    if (targetLabelField) {props.near_label = best ? best.properties[targetLabelField] ?? null : null;}
    return make(f.geometry, props);
  });
  return result(out, [], [...new Set(fields)]);
}

/** Each polygon with the number of points inside it, in `field`. */
export function countPointsInPolygons(polygons: StudioFeature[], points: StudioFeature[], field = "count"): ToolResult {
  const pts = points.flatMap((p) => pointPositions(p.geometry));
  const out: StudioFeature[] = [];
  let skipped = 0;
  for (const f of polygons) {
    if (!isPolygonal(f.geometry)) {
      skipped++;
      continue;
    }
    const poly = f.geometry as Poly;
    const b = geometryBBox(poly);
    let n = 0;
    if (b) {
      for (const p of pts) {
        if (p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] && inside(p, poly)) {n++;}
      }
    }
    out.push(make(poly, { ...f.properties, [field]: n }));
  }
  return result(out, [skippedNote(skipped, "not polygons")], [...new Set([...fieldsOf(polygons), field])]);
}

/** A point at the centre of each feature (centre of mass for polygons). */
export function centroids(features: StudioFeature[]): ToolResult {
  const out: StudioFeature[] = [];
  let bad = 0;
  for (const f of features) {
    if (!f.geometry) {
      bad++;
      continue;
    }
    try {
      let c = isPolygonal(f.geometry) ? turf.centerOfMass(feat(f.geometry)) : turf.centroid(feat(f.geometry));
      if (!c.geometry.coordinates.every(Number.isFinite)) {c = turf.centroid(feat(f.geometry));}
      if (c.geometry.coordinates.every(Number.isFinite)) {out.push(make(c.geometry, f.properties));}
      else {bad++;}
    } catch {
      bad++;
    }
  }
  return result(out, [skippedNote(bad, "no usable geometry")], fieldsOf(features));
}

/** The smallest convex polygon around every feature, as one feature. */
export function convexHull(features: StudioFeature[]): ToolResult {
  const geoms = features.map((f) => f.geometry).filter(Boolean);
  if (geoms.length === 0) {return result([], [], []);}
  try {
    const h = turf.convex({ type: "FeatureCollection", features: geoms.map(feat) });
    if (!h) {return result([], ["A hull needs at least three points that are not in a line."], []);}
    return result([make(h.geometry, { count: features.length })], [], ["count"]);
  } catch {
    return result([], ["The hull could not be computed."], []);
  }
}

/** Each feature's bounding box as a polygon. */
export function boundingBoxes(features: StudioFeature[]): ToolResult {
  const out: StudioFeature[] = [];
  let bad = 0;
  for (const f of features) {
    const b = f.geometry ? geometryBBox(f.geometry) : null;
    if (!b) {
      bad++;
      continue;
    }
    out.push(make(turf.bboxPolygon(b).geometry, f.properties));
  }
  return result(out, [skippedNote(bad, "no usable geometry")], fieldsOf(features));
}

function mapCoords(g: Geometry, fn: (p: Position) => Position): Geometry {
  const c = clone(g);
  turf.coordEach(feat(c), (p) => {
    const q = fn(p);
    p[0] = q[0];
    p[1] = q[1];
  });
  return c;
}

/**
 * Douglas-Peucker with a tolerance in metres. Longitude is scaled by the
 * cosine of the feature's latitude first so the tolerance is the same in
 * every direction; rings keep at least four vertices.
 */
export function simplify(features: StudioFeature[], toleranceM: number): ToolResult {
  const out: StudioFeature[] = [];
  let bad = 0;
  let before = 0, after = 0;
  const count = (g: Geometry) => {
    let n = 0;
    turf.coordEach(feat(g), () => {
      n++;
    });
    return n;
  };
  for (const f of features) {
    const g = f.geometry;
    if (!g) {
      bad++;
      continue;
    }
    const b = geometryBBox(g);
    if (!b || g.type === "Point" || g.type === "MultiPoint" || !(toleranceM > 0)) {
      out.push(make(g, f.properties));
      continue;
    }
    const k = Math.max(0.01, Math.cos((((b[1] + b[3]) / 2) * Math.PI) / 180));
    try {
      // Simplification only drops vertices, so the kept ones map back to their exact originals.
      const original = new Map<string, Position>();
      const scaled = mapCoords(g, (p) => {
        const q = [p[0] * k, p[1]];
        original.set(`${q[0]},${q[1]}`, p.slice());
        return q;
      });
      const s = turf.simplify(scaled, { tolerance: toleranceM / 111320, highQuality: true, mutate: true });
      const back = mapCoords(s, (p) => original.get(`${p[0]},${p[1]}`) ?? [p[0] / k, p[1]]);
      before += count(g);
      after += count(back);
      out.push(make(back, f.properties));
    } catch {
      bad++;
    }
  }
  return result(out, [before > 0 && `Vertices: ${before} → ${after}.`, skippedNote(bad, "could not be simplified")], fieldsOf(features));
}

const MAX_POINTS = 100000;

/** Points every intervalM along lines (and polygon outlines), starting at each start; distance_m says where. */
export function pointsAlongLines(features: StudioFeature[], intervalM: number): ToolResult {
  if (!(intervalM > 0)) {return result([], ["The interval must be greater than 0."]);}
  const out: StudioFeature[] = [];
  let capped = false;
  for (const f of features) {
    const g = f.geometry;
    if (!g) {continue;}
    const lines: LineString[] = [
      ...lineParts(g),
      ...polyParts(g).flatMap((p) => p.coordinates.map((r): LineString => ({ type: "LineString", coordinates: r }))),
    ];
    for (const l of lines) {
      const len = turf.length(feat(l), { units: "meters" });
      for (let d = 0; d <= len + 1e-9; d += intervalM) {
        if (out.length >= MAX_POINTS) {
          capped = true;
          break;
        }
        const p = turf.along(l, Math.min(d, len), { units: "meters" });
        out.push(make(p.geometry, { ...f.properties, distance_m: Math.min(d, len) }));
      }
    }
  }
  return result(out, [capped && `Stopped at ${MAX_POINTS} points; use a longer interval.`], [...new Set([...fieldsOf(features), "distance_m"])]);
}

/** A hairline polygon along a line, 1e-8° (about a millimetre) wide, to cut polygons with. */
function blade(line: Position[]): Polygon | null {
  const pts = line.filter((p, i) => i === 0 || p[0] !== line[i - 1][0] || p[1] !== line[i - 1][1]);
  if (pts.length < 2) {return null;}
  const eps = 1e-8;
  const offset = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [p[0] - (dy / len) * eps, p[1] + (dx / len) * eps];
  });
  return { type: "Polygon", coordinates: [[...pts, ...offset.reverse(), pts[0]]] };
}

/**
 * Split a polygon or line feature where a line crosses it. Polygons come
 * back as the pieces on either side (separated by a hairline about 1 mm
 * wide); lines as the stretches between crossings. A feature the line does
 * not cross comes back whole.
 */
export function splitByLine(feature: StudioFeature, line: Geometry | Feature<Geometry>): ToolResult {
  const cutter = "geometry" in line && line.type === "Feature" ? line.geometry : (line as Geometry);
  const cuts = lineParts(cutter);
  const fields = Object.keys(feature.properties);
  if (!feature.geometry) {return result([], ["The feature has no geometry."], fields);}
  if (cuts.length === 0) {return result([make(feature.geometry, feature.properties)], ["The splitter has no lines."], fields);}
  const g = feature.geometry;
  const out: Geometry[] = [];
  try {
    let polys = polyParts(g);
    for (const c of cuts) {
      const bl = blade(c.coordinates);
      if (!bl) {continue;}
      polys = polys.flatMap((p) => {
        if (!bboxesOverlap(geometryBBox(p), geometryBBox(c))) {return [p];}
        const pieces = polyParts(differencePoly(p, [bl]));
        return pieces.length > 1 ? pieces : [p];
      });
    }
    out.push(...polys);
    let lines = lineParts(g);
    for (const c of cuts) {
      lines = lines.flatMap((l) => {
        const pieces = turf.lineSplit(feat(l), feat(c)).features.map((x) => x.geometry).filter((x) => x.coordinates.length >= 2);
        return pieces.length > 1 ? pieces : [l];
      });
    }
    out.push(...lines);
    const pts = pointPositions(g);
    if (pts.length) {out.push(fromPoints(pts)!);}
  } catch {
    return result([make(g, feature.properties)], ["The feature could not be split (invalid geometry?)."], fields);
  }
  const notSplit = out.length <= 1;
  return result(out.map((x) => make(x, feature.properties)), [notSplit && "The line does not cross the feature; it was not split."], fields);
}

/** All features merged into one, with the first feature's attributes. */
export function mergeFeatures(features: StudioFeature[]): ToolResult {
  const g = mergeGeometries(features.map((f) => f.geometry).filter(Boolean));
  if (!g) {return result([], [], fieldsOf(features));}
  return result([make(g, features[0]?.properties ?? {})], [], fieldsOf(features));
}

const MIN_PROBLEM_M2 = 0.01;

/**
 * Topology problems in a polygon layer: invalid geometry, overlaps between
 * pairs, and gaps (holes in the union bordered by two or more features).
 * Each problem is a feature with { problem, a, b } where a and b are ids.
 */
export function checkTopology(polygons: StudioFeature[]): ToolResult {
  const out: StudioFeature[] = [];
  const valid: StudioFeature[] = [];
  for (const f of polygons) {
    if (!isPolygonal(f.geometry)) {continue;}
    let ok = false;
    try {
      ok = turf.booleanValid(f.geometry) && turf.kinks(f.geometry as Poly).features.length === 0;
    } catch {
      ok = false;
    }
    if (ok) {valid.push(f);}
    else {out.push(make(f.geometry, { problem: "invalid", a: f.id, b: null }));}
  }
  const boxes = valid.map((f) => geometryBBox(f.geometry));
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (!bboxesOverlap(boxes[i], boxes[j])) {continue;}
      try {
        const x = intersectPoly(valid[i].geometry as Poly, valid[j].geometry as Poly);
        if (x && turf.area(feat(x)) > MIN_PROBLEM_M2) {out.push(make(x, { problem: "overlap", a: valid[i].id, b: valid[j].id }));}
      } catch {
        // pair could not be compared
      }
    }
  }
  const u = unionPolygons(valid.map((f) => f.geometry));
  for (const part of polyParts(u)) {
    for (const ring of part.coordinates.slice(1)) {
      const hole: Polygon = { type: "Polygon", coordinates: [ring] };
      if (turf.area(feat(hole)) <= MIN_PROBLEM_M2) {continue;}
      const hb = geometryBBox(hole);
      const touching = valid.filter((f, i) => bboxesOverlap(boxes[i], hb) && spatialPredicate(f.geometry, hole, "intersects"));
      if (touching.length >= 2) {out.push(make(hole, { problem: "gap", a: touching[0].id, b: touching[1].id }));}
    }
  }
  const r = result(out, [], ["problem", "a", "b"]);
  if (out.length === 0) {r.message = "No topology problems found.";}
  return r;
}

// ── Registry for the UI ────────────────────────────────────────────────────

export type InputGeometry = "point" | "line" | "polygon" | "any";

export interface ToolInput {
  name: string;
  label: string;
  kind: "layer" | "number" | "field" | "choice" | "text";
  /** For layers: which geometry the tool expects. */
  geometry?: InputGeometry;
  /** For choices. */
  options?: string[];
  default?: unknown;
  optional?: boolean;
  /** For fields: the name of the layer input whose fields to offer. */
  layer?: string;
}

export interface LayerData {
  features: StudioFeature[];
  fields: string[];
  title: string;
}

export interface ToolContext {
  layer(id: string): LayerData | null | undefined;
}

export interface ToolDef {
  id: string;
  title: string;
  description: string;
  inputs: ToolInput[];
  run(params: Record<string, unknown>, ctx: ToolContext): ToolResult;
}

function layerParam(params: Record<string, unknown>, ctx: ToolContext, name: string): LayerData {
  const id = params[name];
  if (typeof id !== "string" || !id) {throw new Error(`Choose a layer for "${name}".`);}
  const l = ctx.layer(id);
  if (!l) {throw new Error(`Layer not found: ${id}`);}
  return l;
}

function numberParam(params: Record<string, unknown>, name: string, fallback?: number): number {
  const v = params[name];
  const n = v === undefined || v === null || v === "" ? fallback : toNumber(v);
  if (n === undefined || n === null) {throw new Error(`"${name}" must be a number.`);}
  return n;
}

function textParam(params: Record<string, unknown>, name: string, fallback?: string): string {
  const v = params[name];
  if (typeof v === "string" && v !== "") {return v;}
  if (fallback !== undefined) {return fallback;}
  throw new Error(`Choose a value for "${name}".`);
}

const L = (name: string, label: string, geometry: InputGeometry = "any"): ToolInput => ({ name, label, kind: "layer", geometry });

export const TOOLS: ToolDef[] = [
  {
    id: "buffer",
    title: "Buffer",
    description: "Polygons around each feature at a distance in metres (negative shrinks polygons).",
    inputs: [
      L("input", "Input layer"),
      { name: "distance", label: "Distance (m)", kind: "number", default: 100 },
      { name: "steps", label: "Segments per quarter circle", kind: "number", default: 8 },
      { name: "dissolve", label: "Dissolve result", kind: "choice", options: ["no", "yes"], default: "no" },
    ],
    run: (p, ctx) => buffer(layerParam(p, ctx, "input").features, numberParam(p, "distance"), numberParam(p, "steps", 8), p.dissolve === "yes" || p.dissolve === true),
  },
  {
    id: "clip",
    title: "Clip",
    description: "The parts of the input inside the clip layer's polygons.",
    inputs: [L("input", "Input layer"), L("overlay", "Clip layer", "polygon")],
    run: (p, ctx) => clip(layerParam(p, ctx, "input").features, layerParam(p, ctx, "overlay").features),
  },
  {
    id: "difference",
    title: "Difference",
    description: "The parts of the input outside the erase layer's polygons.",
    inputs: [L("input", "Input layer"), L("overlay", "Erase layer", "polygon")],
    run: (p, ctx) => difference(layerParam(p, ctx, "input").features, layerParam(p, ctx, "overlay").features),
  },
  {
    id: "intersect",
    title: "Intersection",
    description: "Where the input overlaps the overlay's polygons, with the attributes of both.",
    inputs: [L("input", "Input layer"), L("overlay", "Overlay layer", "polygon")],
    run: (p, ctx) => intersect(layerParam(p, ctx, "input").features, layerParam(p, ctx, "overlay").features),
  },
  {
    id: "union",
    title: "Dissolve all",
    description: "Merge every feature into one; polygons are unioned.",
    inputs: [L("input", "Input layer")],
    run: (p, ctx) => dissolveAll(layerParam(p, ctx, "input").features),
  },
  {
    id: "dissolve",
    title: "Dissolve by field",
    description: "One feature per distinct value of a field.",
    inputs: [L("input", "Input layer"), { name: "field", label: "Field", kind: "field", layer: "input" }],
    run: (p, ctx) => dissolve(layerParam(p, ctx, "input").features, textParam(p, "field")),
  },
  {
    id: "spatialJoin",
    title: "Join attributes by location",
    description: "Copy or summarise attributes of the join layer onto the features they relate to.",
    inputs: [
      L("input", "Target layer"),
      L("join", "Join layer"),
      { name: "predicate", label: "Where the target", kind: "choice", options: ["intersects", "within", "contains"], default: "intersects" },
      { name: "mode", label: "Take", kind: "choice", options: ["first", "count", "sum", "mean"], default: "first" },
      { name: "field", label: "Field to sum or average", kind: "field", layer: "join", optional: true },
    ],
    run: (p, ctx) => {
      const predicate = textParam(p, "predicate", "intersects") as JoinPredicate;
      if (!["intersects", "within", "contains"].includes(predicate)) {throw new Error(`Unknown predicate: ${predicate}`);}
      const m = textParam(p, "mode", "first");
      let mode: JoinMode;
      if (m === "first" || m === "count") {mode = m;}
      else if (m === "sum") {mode = { sum: textParam(p, "field") };}
      else if (m === "mean") {mode = { mean: textParam(p, "field") };}
      else {throw new Error(`Unknown mode: ${m}`);}
      return spatialJoin(layerParam(p, ctx, "input").features, layerParam(p, ctx, "join").features, predicate, mode);
    },
  },
  {
    id: "nearest",
    title: "Nearest feature",
    description: "For each feature, the id of and distance to the nearest feature of another layer.",
    inputs: [
      L("input", "Input layer"),
      L("targets", "Target layer"),
      { name: "label", label: "Target field to copy", kind: "field", layer: "targets", optional: true },
    ],
    run: (p, ctx) => nearest(layerParam(p, ctx, "input").features, layerParam(p, ctx, "targets").features, typeof p.label === "string" && p.label ? p.label : undefined),
  },
  {
    id: "countPointsInPolygons",
    title: "Count points in polygons",
    description: "Each polygon with the number of points that fall in it.",
    inputs: [L("polygons", "Polygon layer", "polygon"), L("points", "Point layer", "point"), { name: "field", label: "Count field", kind: "text", default: "count" }],
    run: (p, ctx) => countPointsInPolygons(layerParam(p, ctx, "polygons").features, layerParam(p, ctx, "points").features, textParam(p, "field", "count")),
  },
  {
    id: "centroids",
    title: "Centroids",
    description: "A point at the centre of each feature.",
    inputs: [L("input", "Input layer")],
    run: (p, ctx) => centroids(layerParam(p, ctx, "input").features),
  },
  {
    id: "convexHull",
    title: "Convex hull",
    description: "The smallest convex polygon around all features.",
    inputs: [L("input", "Input layer")],
    run: (p, ctx) => convexHull(layerParam(p, ctx, "input").features),
  },
  {
    id: "boundingBoxes",
    title: "Bounding boxes",
    description: "Each feature's bounding box as a rectangle.",
    inputs: [L("input", "Input layer")],
    run: (p, ctx) => boundingBoxes(layerParam(p, ctx, "input").features),
  },
  {
    id: "simplify",
    title: "Simplify",
    description: "Remove vertices that deviate less than a tolerance in metres.",
    inputs: [L("input", "Input layer"), { name: "tolerance", label: "Tolerance (m)", kind: "number", default: 10 }],
    run: (p, ctx) => simplify(layerParam(p, ctx, "input").features, numberParam(p, "tolerance")),
  },
  {
    id: "pointsAlongLines",
    title: "Points along lines",
    description: "Points at a fixed interval along lines and polygon outlines.",
    inputs: [L("input", "Line layer", "line"), { name: "interval", label: "Interval (m)", kind: "number", default: 100 }],
    run: (p, ctx) => pointsAlongLines(layerParam(p, ctx, "input").features, numberParam(p, "interval")),
  },
  {
    id: "splitByLine",
    title: "Split with lines",
    description: "Split polygons and lines where the lines of another layer cross them.",
    inputs: [L("input", "Input layer"), L("lines", "Splitting lines", "line")],
    run: (p, ctx) => {
      const input = layerParam(p, ctx, "input");
      const lines = layerParam(p, ctx, "lines").features.flatMap((f) => lineParts(f.geometry));
      const cutter = fromLines(lines);
      if (!cutter) {return result([], ["The splitting layer has no lines."], input.fields);}
      const features = input.features.flatMap((f) => splitByLine(f, cutter).features);
      const r = result(features, [], [...new Set([...input.fields, ...fieldsOf(features)])]);
      if (features.length) {r.message = `${input.features.length} feature(s) became ${features.length}.`;}
      return r;
    },
  },
  {
    id: "mergeFeatures",
    title: "Merge features",
    description: "Combine all features into one multi-part feature with the first one's attributes.",
    inputs: [L("input", "Input layer")],
    run: (p, ctx) => mergeFeatures(layerParam(p, ctx, "input").features),
  },
  {
    id: "checkTopology",
    title: "Check topology",
    description: "Find invalid polygons, overlaps between polygons and gaps enclosed by them.",
    inputs: [L("input", "Polygon layer", "polygon")],
    run: (p, ctx) => checkTopology(layerParam(p, ctx, "input").features),
  },
];
