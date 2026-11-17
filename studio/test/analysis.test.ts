import { describe, expect, it } from "vitest";
import type { Geometry, Polygon, Position } from "geojson";
import * as turf from "@turf/turf";
import type { StudioFeature } from "../src/project/types";
import { compile, ExpressionError, tryCompile } from "../src/analysis/expression";
import { classify, colorRamp, RAMP_NAMES } from "../src/analysis/classify";
import { selectByExpression, selectByLocation } from "../src/analysis/select";
import { summarize } from "../src/analysis/stats";
import {
  boundingBoxes, buffer, centroids, checkTopology, clip, convexHull, countPointsInPolygons, difference, dissolve,
  dissolveAll, intersect, mergeFeatures, nearest, pointsAlongLines, simplify, spatialJoin, splitByLine, TOOLS,
  union, type ToolContext,
} from "../src/analysis/processing";

let n = 0;
function f(geometry: Geometry, properties: Record<string, unknown> = {}): StudioFeature {
  return { type: "Feature", id: `t${++n}`, geometry, properties };
}
const pt = (x: number, y: number, p: Record<string, unknown> = {}) => f({ type: "Point", coordinates: [x, y] }, p);
const line = (coords: Position[], p: Record<string, unknown> = {}) => f({ type: "LineString", coordinates: coords }, p);
function square(x0: number, y0: number, size: number): Polygon {
  return { type: "Polygon", coordinates: [[[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size], [x0, y0]]] };
}
const sq = (x0: number, y0: number, size: number, p: Record<string, unknown> = {}) => f(square(x0, y0, size), p);
const area = (g: Geometry) => turf.area(g);

const ev = (src: string, props: Record<string, unknown> = {}, geom: Geometry = { type: "Point", coordinates: [10, 60] }) =>
  compile(src).evaluate(f(geom, props));

describe("expression parser", () => {
  it("respects precedence", () => {
    expect(ev("1 + 2 * 3")).toBe(7);
    expect(ev("(1 + 2) * 3")).toBe(9);
    expect(ev("-2 * 3 + 10 % 4")).toBe(-4);
    expect(ev("2 - 3 - 4")).toBe(-5);
    expect(ev("true OR false AND false")).toBe(true);
    expect(ev("NOT 1 = 2 AND 3 > 2")).toBe(true);
    expect(ev("1 + 1 = 2 OR x")).toBe(true);
    expect(ev("'a' || 1 + 2")).toBe("a3");
  });

  it("reads fields, quoted and bare", () => {
    const p = { pop: 1500, "my field": "x", Name: "Oslo" };
    expect(ev('"pop" > 1000 AND pop < 2000', p)).toBe(true);
    expect(ev('"my field" = \'x\'', p)).toBe(true);
    expect(ev("Name", p)).toBe("Oslo");
    expect(ev("'it''s'")).toBe("it's");
    expect(compile('"a" + b * coalesce("c", a)').fields).toEqual(["a", "b", "c"]);
  });

  it("handles comparisons and numeric strings", () => {
    expect(ev("x <> 3", { x: 4 })).toBe(true);
    expect(ev("x != 4", { x: 4 })).toBe(false);
    expect(ev("x >= '10'", { x: 10 })).toBe(true);
    expect(ev("'b' > 'a'")).toBe(true);
  });

  it("LIKE and ILIKE", () => {
    expect(ev("name LIKE 'Os%'", { name: "Oslo" })).toBe(true);
    expect(ev("name LIKE 'os%'", { name: "Oslo" })).toBe(false);
    expect(ev("name ILIKE 'os%'", { name: "Oslo" })).toBe(true);
    expect(ev("name LIKE 'O_lo'", { name: "Oslo" })).toBe(true);
    expect(ev("name NOT LIKE '%x%'", { name: "Oslo" })).toBe(true);
    expect(ev("name LIKE 'a.c'", { name: "abc" })).toBe(false);
  });

  it("IN and BETWEEN", () => {
    expect(ev("k IN ('a', 'b')", { k: "b" })).toBe(true);
    expect(ev("k NOT IN ('a', 'b')", { k: "c" })).toBe(true);
    expect(ev("v IN (1, 2, 3)", { v: 2 })).toBe(true);
    expect(ev("v BETWEEN 1 AND 3", { v: 3 })).toBe(true);
    expect(ev("v BETWEEN 1 AND 3 AND true", { v: 4 })).toBe(false);
    expect(ev("v NOT BETWEEN 1 AND 3", { v: 4 })).toBe(true);
  });

  it("has SQL null semantics", () => {
    expect(ev("x = 1", { x: null })).toBeNull();
    expect(ev("x IS NULL", {})).toBe(true);
    expect(ev("x IS NOT NULL", { x: 0 })).toBe(true);
    expect(ev("x > 1 OR true", {})).toBe(true);
    expect(ev("x > 1 AND false", {})).toBe(false);
    expect(ev("NOT (x > 1)", {})).toBeNull();
    expect(ev("x + 1", {})).toBeNull();
    expect(ev("x IN (1, null)", { x: 2 })).toBeNull();
    expect(ev("1 / 0")).toBeNull();
  });

  it("functions", () => {
    expect(ev("LENGTH('abc')")).toBe(3);
    expect(ev("upper('a') || lower('B') || trim('  c ')")).toBe("Abc");
    expect(ev("substr('hello', 2, 3)")).toBe("ell");
    expect(ev("substr('hello', -3)")).toBe("llo");
    expect(ev("concat('a', null, 1)")).toBe("a1");
    expect(ev("coalesce(x, y, 'z')", { y: 5 })).toBe(5);
    expect(ev("round(3.14159, 2)")).toBe(3.14);
    expect(ev("round(2.5)")).toBe(3);
    expect(ev("abs(-2) + floor(1.7) + ceil(1.2) + sqrt(16)")).toBe(9);
    expect(ev("min(3, 1, 2) + max(3, 1, 2)")).toBe(4);
    expect(ev("to_number('12.5') * 2")).toBe(25);
    expect(ev("to_string(12) || 'x'")).toBe("12x");
    expect(ev("if(x > 1, 'big', 'small')", { x: 2 })).toBe("big");
    expect(ev("regexp_match('abc123', '[0-9]+$')")).toBe(true);
  });

  it("reports errors with positions", () => {
    const err = (src: string) => {
      try {
        compile(src);
      } catch (e) {
        expect(e).toBeInstanceOf(ExpressionError);
        return e as ExpressionError;
      }
      throw new Error(`no error for ${src}`);
    };
    expect(err("1 +").position).toBe(3);
    expect(err("foo(1)").message).toMatch(/Unknown function foo/);
    expect(err("a = (1 + 2").message).toMatch(/Expected '\)'/);
    expect(err("x = 'abc").position).toBe(4);
    expect(err("1 2").position).toBe(2);
    expect(err("a IS 3").message).toMatch(/NULL/);
    expect(err("round()").message).toMatch(/round\(\) takes 1 to 2/);
    expect(err("$nope").message).toMatch(/Unknown variable/);
    expect(err("a # b").position).toBe(2);
    const r = tryCompile("1 +* 2");
    expect(r.ok).toBe(false);
    if (!r.ok) {expect(r.error.position).toBe(3);}
    expect(tryCompile("1 + 2").ok).toBe(true);
  });

  it("geometry variables", () => {
    // 0.01° square at 60°N: ~ 1113 m × 556 m.
    const a = ev("$area", {}, square(10, 60, 0.01)) as number;
    expect(a).toBeGreaterThan(600000);
    expect(a).toBeLessThan(640000);
    // 1° of longitude along the equator is ~111.3 km.
    const l = ev("$length", {}, { type: "LineString", coordinates: [[0, 0], [1, 0]] }) as number;
    expect(l).toBeGreaterThan(111000);
    expect(l).toBeLessThan(111500);
    const p = ev("$perimeter", {}, square(10, 60, 0.01)) as number;
    expect(p).toBeGreaterThan(3300);
    expect(p).toBeLessThan(3400);
    expect(ev("round($x, 3) || ',' || round($y, 3)", {}, square(10, 60, 0.01))).toBe("10.005,60.005");
    expect(ev("$geometry_type", {}, square(0, 0, 1))).toBe("Polygon");
    expect(compile("$id").evaluate(pt(0, 0))).toMatch(/^t/);
  });
});

describe("classify", () => {
  const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  it("equal interval", () => {
    expect(classify(vals, "equal", 3)).toEqual([4, 7, 10]);
  });
  it("quantile", () => {
    expect(classify(vals, "quantile", 4)).toEqual([3, 5, 8, 10]);
  });
  it("jenks finds natural clusters", () => {
    expect(classify([1, 2, 3, 20, 21, 22, 50, 51, 52], "jenks", 3)).toEqual([3, 22, 52]);
    const big = Array.from({ length: 5000 }, (_, i) => (i < 2500 ? i % 10 : 1000 + (i % 10)));
    const b = classify(big, "jenks", 2);
    expect(b[0]).toBeLessThan(100);
    expect(b[1]).toBe(1009);
  });
  it("stddev", () => {
    const b = classify(vals, "stddev", 4);
    expect(b).toHaveLength(4);
    expect(b[1]).toBeCloseTo(5.5);
    expect(b[3]).toBe(10);
    for (let i = 1; i < b.length; i++) {expect(b[i]).toBeGreaterThanOrEqual(b[i - 1]);}
  });
  it("is graceful with odd input", () => {
    expect(classify([], "jenks", 5)).toEqual([]);
    expect(classify([NaN, Infinity], "quantile", 3)).toEqual([]);
    expect(classify([5, 5, 5], "jenks", 3)).toEqual([5, 5, 5]);
    expect(classify([1, NaN, 2], "equal", 2)).toEqual([1.5, 2]);
    expect(classify([1, 2], "jenks", 4)).toHaveLength(4);
    expect(classify([1, 1, 1, 1, 9], "quantile", 3)).toEqual([1, 1, 9]);
  });
  it("colour ramps", () => {
    expect(RAMP_NAMES).toContain("viridis");
    for (const r of RAMP_NAMES) {
      const c = colorRamp(r, 5);
      expect(c).toHaveLength(5);
      for (const x of c) {expect(x).toMatch(/^#[0-9a-f]{6}$/);}
    }
    expect(colorRamp("viridis", 2)).toEqual(["#440154", "#fde725"]);
    expect(colorRamp("blues", 1)).toHaveLength(1);
    expect(colorRamp("reds", 0)).toEqual([]);
  });
});

describe("selection", () => {
  const feats = [pt(10, 60, { v: 1 }), pt(10.5, 60.5, { v: 5 }), pt(20, 0, { v: null })];
  it("by expression", () => {
    expect(selectByExpression(feats, "v > 2")).toEqual([feats[1].id]);
    expect(selectByExpression(feats, "v IS NULL")).toEqual([feats[2].id]);
    expect(() => selectByExpression(feats, "v >")).toThrow(ExpressionError);
  });
  it("by location", () => {
    const ref = [square(9.9, 59.9, 0.2)];
    expect(selectByLocation(feats, ref, "intersects")).toEqual([feats[0].id]);
    expect(selectByLocation(feats, ref, "within")).toEqual([feats[0].id]);
    expect(selectByLocation(feats, ref, "disjoint")).toEqual([feats[1].id, feats[2].id]);
    // (10.5, 60.5) is ~45 km from the square's corner at (10.1, 60.1).
    expect(selectByLocation(feats, ref, "withinDistance", 60000)).toEqual([feats[0].id, feats[1].id]);
    expect(selectByLocation(feats, ref, "withinDistance", 30000)).toEqual([feats[0].id]);
    const polys = [sq(0, 0, 10), sq(20, 20, 1)];
    expect(selectByLocation(polys, [{ type: "Point", coordinates: [5, 5] }], "contains")).toEqual([polys[0].id]);
    const lines = [line([[1, 1], [2, 2]]), line([[1, 1], [20, 2]])];
    expect(selectByLocation(lines, [square(0, 0, 10)], "within")).toEqual([lines[0].id]);
  });
});

describe("stats", () => {
  it("summarizes numbers and text", () => {
    const fs = [1, 2, 3, 4, null, "10"].map((v) => pt(0, 0, { v }));
    const s = summarize(fs, "v");
    expect(s.count).toBe(5);
    expect(s.nulls).toBe(1);
    expect(s.numeric).toMatchObject({ sum: 20, mean: 4, min: 1, max: 10, median: 3 });
    expect(s.numeric!.stdev).toBeCloseTo(3.5355, 3);
    const t = summarize(["a", "b", "a", undefined].map((v) => pt(0, 0, v === undefined ? {} : { v })), "v");
    expect(t.numeric).toBeNull();
    expect(t.unique[0]).toEqual({ value: "a", count: 2 });
    expect(t.nulls).toBe(1);
  });
});

describe("processing", () => {
  const A = sq(10, 60, 0.01, { name: "A", kind: "x" });
  const B = sq(10.005, 60, 0.01, { name: "B", kind: "x" });
  const C = sq(10.1, 60, 0.01, { name: "C", kind: "y" });
  const aArea = area(A.geometry);

  it("buffer", () => {
    const p = pt(10, 60, { a: 1 });
    const r = buffer([p], 100, 16);
    expect(r.features).toHaveLength(1);
    expect(r.features[0].id).not.toBe(p.id);
    expect(r.features[0].properties.a).toBe(1);
    expect(area(r.features[0].geometry)).toBeGreaterThan(Math.PI * 100 * 100 * 0.97);
    expect(area(r.features[0].geometry)).toBeLessThan(Math.PI * 100 * 100 * 1.01);
    const d = buffer([A, B], 10, 8, true);
    expect(d.features).toHaveLength(1);
    expect(d.features[0].geometry.type).toBe("Polygon");
    expect(p.geometry.type).toBe("Point"); // input not mutated
  });

  it("clip and difference", () => {
    const r = clip([B, C, pt(10.002, 60.002), line([[9.99, 60.005], [10.02, 60.005]])], [A]);
    expect(r.features).toHaveLength(3);
    expect(area(r.features[0].geometry) / aArea).toBeCloseTo(0.5, 2);
    const clippedLine = r.features.find((x) => x.geometry.type === "LineString")!;
    expect(turf.length(clippedLine, { units: "meters" })).toBeCloseTo(557, -1);
    const d = difference([B, C], [A]);
    expect(d.features).toHaveLength(2);
    expect(area(d.features[0].geometry) / aArea).toBeCloseTo(0.5, 2);
    expect(area(d.features[1].geometry) / aArea).toBeCloseTo(1, 3);
    expect(clip([C], [A]).message).toMatch(/empty/);
  });

  it("intersect carries both attribute sets", () => {
    const r = intersect([A], [B, C]);
    expect(r.features).toHaveLength(1);
    expect(r.features[0].properties).toMatchObject({ name: "A", b_name: "B", b_kind: "x" });
    expect(r.fields).toEqual(["name", "kind", "b_name", "b_kind"]);
    expect(area(r.features[0].geometry) / aArea).toBeCloseTo(0.5, 2);
  });

  it("union and dissolve", () => {
    const u = union([A, B, C]);
    expect(u.features).toHaveLength(1);
    expect(u.features[0].geometry.type).toBe("MultiPolygon");
    expect(area(u.features[0].geometry) / aArea).toBeCloseTo(2.5, 2);
    expect(dissolveAll([]).message).toMatch(/empty/);
    const d = dissolve([A, B, C], "kind");
    expect(d.features).toHaveLength(2);
    const x = d.features.find((q) => q.properties.kind === "x")!;
    expect(x.geometry.type).toBe("Polygon");
    expect(area(x.geometry) / aArea).toBeCloseTo(1.5, 2);
  });

  it("spatial join", () => {
    const pts = [pt(10.002, 60.002, { v: 2 }), pt(10.003, 60.003, { v: 4 }), pt(10.102, 60.002, { v: 10 })];
    const c = spatialJoin([A, C], pts, "intersects", "count");
    expect(c.features.map((q) => q.properties.join_count)).toEqual([2, 1]);
    const s = spatialJoin([A, C], pts, "contains", { sum: "v" });
    expect(s.features.map((q) => q.properties.sum_v)).toEqual([6, 10]);
    const m = spatialJoin([A, C], pts, "intersects", { mean: "v" });
    expect(m.features[0].properties.mean_v).toBe(3);
    const first = spatialJoin(pts, [A, C], "within", "first");
    expect(first.features.map((q) => q.properties.name)).toEqual(["A", "A", "C"]);
    expect(first.features[0].properties.v).toBe(2);
  });

  it("nearest", () => {
    const targets = [pt(0, 0, { label: "origin" }), pt(1, 0, { label: "east" })];
    const r = nearest([pt(0.9, 0)], targets, "label");
    expect(r.features[0].properties.near_id).toBe(targets[1].id);
    expect(r.features[0].properties.near_label).toBe("east");
    expect(r.features[0].properties.near_dist_m as number).toBeCloseTo(11132, -2);
    const toPoly = nearest([pt(10.005, 60.02)], [A]);
    // 0.01° of latitude north of the square's top edge is ~1113 m.
    expect(toPoly.features[0].properties.near_dist_m as number).toBeCloseTo(1113, -1);
  });

  it("count points in polygons", () => {
    const pts = [pt(10.002, 60.002), pt(10.003, 60.003), f({ type: "MultiPoint", coordinates: [[10.004, 60.004], [50, 50]] })];
    const r = countPointsInPolygons([A, C], pts, "n");
    expect(r.features.map((q) => q.properties.n)).toEqual([3, 0]);
    expect(r.fields).toContain("n");
  });

  it("centroids, hull, bounding boxes", () => {
    const c = centroids([A, line([[0, 0], [2, 0]])]);
    expect((c.features[0].geometry as { coordinates: number[] }).coordinates[0]).toBeCloseTo(10.005, 6);
    expect((c.features[1].geometry as { coordinates: number[] }).coordinates).toEqual([1, 0]);
    const h = convexHull([pt(0, 0), pt(1, 0), pt(0, 1), pt(0.2, 0.2)]);
    expect(h.features).toHaveLength(1);
    expect(area(h.features[0].geometry) / area(square(0, 0, 1))).toBeCloseTo(0.5, 2);
    expect(convexHull([pt(0, 0)]).features).toHaveLength(0);
    const b = boundingBoxes([line([[0, 0], [1, 2]], { k: 1 })]);
    expect(turf.bbox(b.features[0].geometry)).toEqual([0, 0, 1, 2]);
    expect(b.features[0].properties.k).toBe(1);
  });

  it("simplify", () => {
    // A wiggly line with 1 m bumps along 1 km.
    const coords: Position[] = Array.from({ length: 101 }, (_, i) => [10 + i * 0.0002, 60 + (i % 2) * 0.000009]);
    const l = line(coords);
    const r = simplify([l], 5);
    expect((r.features[0].geometry as { coordinates: Position[] }).coordinates.length).toBeLessThan(5);
    expect(simplify([l], 0.1).features[0].geometry).toEqual(l.geometry);
    const ring = simplify([A], 1000);
    expect(ring.features[0].geometry.type).toBe("Polygon");
    expect(l.geometry).toEqual({ type: "LineString", coordinates: coords });
  });

  it("points along lines", () => {
    const l = line([[0, 0], [0.01, 0]], { id: 7 }); // ~1113 m
    const r = pointsAlongLines([l], 250);
    expect(r.features).toHaveLength(5);
    expect(r.features.map((q) => q.properties.distance_m)).toEqual([0, 250, 500, 750, 1000]);
    expect(r.features[0].properties.id).toBe(7);
    expect(pointsAlongLines([l], 0).features).toHaveLength(0);
  });

  it("split by line", () => {
    const cut: Geometry = { type: "LineString", coordinates: [[10.005, 59.99], [10.005, 60.02]] };
    const r = splitByLine(A, cut);
    expect(r.features).toHaveLength(2);
    const total = r.features.reduce((s, q) => s + area(q.geometry), 0);
    expect(total / aArea).toBeCloseTo(1, 4);
    for (const q of r.features) {expect(area(q.geometry) / aArea).toBeCloseTo(0.5, 3);}
    expect(r.features[0].properties.name).toBe("A");
    const ls = splitByLine(line([[10, 60.005], [10.01, 60.005]]), cut);
    expect(ls.features).toHaveLength(2);
    const miss = splitByLine(C, cut);
    expect(miss.features).toHaveLength(1);
    expect(miss.message).toMatch(/not split/);
    // A MultiPolygon is split part by part.
    const mp = f({ type: "MultiPolygon", coordinates: [square(10, 60, 0.01).coordinates, square(10.1, 60, 0.01).coordinates] });
    expect(splitByLine(mp, cut).features).toHaveLength(3);
  });

  it("merge features", () => {
    const r = mergeFeatures([A, C]);
    expect(r.features).toHaveLength(1);
    expect(r.features[0].geometry.type).toBe("MultiPolygon");
    expect(r.features[0].properties.name).toBe("A");
    const l = mergeFeatures([line([[0, 0], [1, 1]]), line([[2, 2], [3, 3]])]);
    expect(l.features[0].geometry.type).toBe("MultiLineString");
  });

  it("check topology", () => {
    // Four squares around a hole, one overlapping its neighbour, one bow-tie.
    // Whole degrees, so shared edges are exactly equal in floating point.
    const s = 1;
    const ring = [
      sq(10, 60, s), sq(10 + s, 60, s), sq(10 + 2 * s, 60, s),
      sq(10, 60 + s, s), sq(10 + 2 * s, 60 + s, s),
      sq(10, 60 + 2 * s, s), sq(10 + s, 60 + 2 * s, s), sq(10 + 2 * s, 60 + 2 * s, s),
    ];
    const over = sq(13.5, 60, s);
    const neighbour = sq(14, 60, s);
    const bowtie = f({ type: "Polygon", coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] });
    const r = checkTopology([...ring, over, neighbour, bowtie]);
    const kinds = r.features.map((q) => q.properties.problem).sort();
    expect(kinds).toEqual(["gap", "invalid", "overlap"]);
    const gap = r.features.find((q) => q.properties.problem === "gap")!;
    expect(area(gap.geometry) / area(square(11, 61, s))).toBeCloseTo(1, 2);
    const ov = r.features.find((q) => q.properties.problem === "overlap")!;
    expect([ov.properties.a, ov.properties.b]).toEqual([over.id, neighbour.id]);
    expect(r.features.find((q) => q.properties.problem === "invalid")!.properties.a).toBe(bowtie.id);
    expect(checkTopology([A, C]).message).toMatch(/No topology problems/);
  });

  it("handles MultiPolygons and invalid geometry without throwing", () => {
    const mp = f({ type: "MultiPolygon", coordinates: [square(10, 60, 0.01).coordinates, square(10.1, 60, 0.01).coordinates] });
    expect(area(clip([mp], [sq(9, 59, 2)]).features[0].geometry) / aArea).toBeCloseTo(2, 2);
    const broken = f({ type: "Polygon", coordinates: [[[0, 0], [1, 1]]] });
    expect(() => buffer([broken, A], 10)).not.toThrow();
    expect(() => clip([broken], [A])).not.toThrow();
    expect(() => checkTopology([broken])).not.toThrow();
  });
});

describe("tool registry", () => {
  const poly = [sq(10, 60, 0.01, { kind: "x", v: 1 }), sq(10.005, 60, 0.01, { kind: "x", v: 2 })];
  const pts = [pt(10.002, 60.002, { v: 3 }), pt(10.012, 60.002, { v: 4 })];
  const lines = [line([[10.007, 59.99], [10.007, 60.02]], { v: 5 })];
  const layers: Record<string, { features: StudioFeature[]; fields: string[]; title: string }> = {
    poly: { features: poly, fields: ["kind", "v"], title: "Polygons" },
    pts: { features: pts, fields: ["v"], title: "Points" },
    lines: { features: lines, fields: ["v"], title: "Lines" },
  };
  const ctx: ToolContext = { layer: (id) => layers[id] };
  const pick = (geometry?: string) => (geometry === "point" ? "pts" : geometry === "line" ? "lines" : "poly");

  it("every tool runs with its defaults", () => {
    const ids = new Set<string>();
    for (const tool of TOOLS) {
      expect(ids.has(tool.id)).toBe(false);
      ids.add(tool.id);
      const params: Record<string, unknown> = {};
      for (const input of tool.inputs) {
        if (input.kind === "layer") {params[input.name] = (tool.id === "pointsAlongLines" || (tool.id === "difference" && input.name === "input")) ? "lines" : pick(input.geometry);}
        else if (input.kind === "field") {params[input.name] = "v";}
        else if (input.default !== undefined) {params[input.name] = input.default;}
      }
      if (tool.id === "dissolve") {params.field = "kind";}
      const r = tool.run(params, ctx);
      expect(Array.isArray(r.features), tool.id).toBe(true);
      expect(Array.isArray(r.fields), tool.id).toBe(true);
      if (tool.id !== "checkTopology") {expect(r.features.length, tool.id).toBeGreaterThan(0);}
    }
    expect(ids.size).toBe(17);
  });

  it("split tool and missing layers", () => {
    const split = TOOLS.find((t) => t.id === "splitByLine")!;
    expect(split.run({ input: "poly", lines: "lines" }, ctx).features).toHaveLength(4);
    expect(() => TOOLS[0].run({ input: "nope", distance: 1 }, ctx)).toThrow(/not found/);
  });
});
