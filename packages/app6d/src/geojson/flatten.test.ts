import { describe, expect, it } from "vitest";

import { pathPoints } from "../engine/geometry";
import { flattenPath } from "./flatten";

// Normalised to +0: trigonometry produces -0 at an arc's endpoints, and
// toEqual distinguishes it because Object.is(-0, 0) is false. It makes no
// difference downstream — JSON.stringify(-0) is "0" — so this is the test's
// arithmetic to fix, not the flattener's.
const round = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
};
const xy = (points: { x: number; y: number }[]) =>
  points.map((p) => [round(p.x), round(p.y)]);

describe("flattenPath", () => {
  it("leaves straight lines exactly alone", () => {
    // The overwhelming majority of the catalog is polylines, and flattening
    // must not perturb them: a boundary drawn 3 cm off is a boundary drawn
    // wrong.
    const [sub] = flattenPath("M0,0 L10,0 L10,10");
    expect(xy(sub.points)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(sub.closed).toBe(false);
  });

  it("follows relative commands", () => {
    const [sub] = flattenPath("m5,5 l10,0 l0,10 h-10 v-10");
    expect(xy(sub.points)).toEqual([
      [5, 5],
      [15, 5],
      [15, 15],
      [5, 15],
      [5, 5],
    ]);
  });

  it("treats repeated coordinate pairs after M as linetos", () => {
    // "M0,0 10,0 10,10" is legal and means M then two implicit L. Read as
    // three movetos it would produce three single-point subpaths.
    const subpaths = flattenPath("M0,0 10,0 10,10");
    expect(subpaths).toHaveLength(1);
    expect(xy(subpaths[0].points)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it("closes on Z and reports it", () => {
    const [sub] = flattenPath("M0,0 L10,0 L10,10 Z");
    expect(sub.closed).toBe(true);
    expect(xy(sub.points)[0]).toEqual([0, 0]);
    const closedPts = xy(sub.points);
    expect(closedPts[closedPts.length - 1]).toEqual([0, 0]);
  });

  it("splits multiple subpaths", () => {
    // lineWithGap produces exactly this shape, and a renderer that joined the
    // two halves would draw a line straight through the gap it made.
    const subpaths = flattenPath("M0,0 L4,0 M6,0 L10,0");
    expect(subpaths).toHaveLength(2);
    expect(xy(subpaths[0].points)).toEqual([
      [0, 0],
      [4, 0],
    ]);
    expect(xy(subpaths[1].points)).toEqual([
      [6, 0],
      [10, 0],
    ]);
  });

  it("puts curve points ON the curve, which is the whole reason it exists", () => {
    // A quadratic from (0,0) to (10,0) with control (5,10) passes through
    // (5,5) at t=0.5 — half the control point's height. pathPoints would
    // report (5,10), which is not on the curve at all.
    const [sub] = flattenPath("M0,0 Q5,10 10,0");
    const ys = sub.points.map((p) => p.y);
    const peak = Math.max(...ys);
    expect(peak).toBeGreaterThan(4.5);
    expect(peak).toBeLessThan(5.1);

    // And that is exactly what the engine's own positions helper does report,
    // which is correct for its purpose and wrong for this one.
    expect(pathPoints("M0,0 Q5,10 10,0").some((p) => p.y === 10)).toBe(true);
  });

  it("keeps a cubic's endpoints and bulges between them", () => {
    const [sub] = flattenPath("M0,0 C0,10 10,10 10,0");
    expect(xy([sub.points[0]])).toEqual([[0, 0]]);
    expect(xy([sub.points[sub.points.length - 1]])).toEqual([[10, 0]]);
    // A cubic with both controls at height 10 peaks at 7.5, not 10.
    const peak = Math.max(...sub.points.map((p) => p.y));
    expect(peak).toBeGreaterThan(7);
    expect(peak).toBeLessThan(7.6);
  });

  it("reflects the control point for S and T", () => {
    // A smooth continuation should be symmetric about x=10. If the reflection
    // is dropped, the second half flattens out.
    const [sub] = flattenPath("M0,0 Q5,10 10,0 T20,0");
    const firstPeak = Math.max(
      ...sub.points.filter((p) => p.x <= 10).map((p) => p.y),
    );
    const secondTrough = Math.min(
      ...sub.points.filter((p) => p.x >= 10).map((p) => p.y),
    );
    expect(firstPeak).toBeGreaterThan(4.5);
    expect(secondTrough).toBeLessThan(-4.5);
  });

  it("samples an arc along the arc, not across it", () => {
    // A semicircle from (0,0) to (10,0) with r=5 sweeping should reach y=5 (or
    // -5) in the middle. A chord would stay at y=0 throughout.
    const [sub] = flattenPath("M0,0 A5,5 0 0,1 10,0");
    const extreme = Math.max(...sub.points.map((p) => Math.abs(p.y)));
    expect(extreme).toBeGreaterThan(4.8);
    expect(xy([sub.points[sub.points.length - 1]])).toEqual([[10, 0]]);
  });

  it("honours the sweep flag", () => {
    const up = flattenPath("M0,0 A5,5 0 0,1 10,0")[0].points;
    const down = flattenPath("M0,0 A5,5 0 0,0 10,0")[0].points;
    expect(Math.sign(up[2].y)).toBe(-Math.sign(down[2].y));
  });

  it("scales radii that are too small to span the endpoints", () => {
    // The specification requires this rather than dropping the arc. Silently
    // losing an arc is worse than drawing it a little wide.
    const [sub] = flattenPath("M0,0 A1,1 0 0,1 10,0");
    expect(sub.points.length).toBeGreaterThan(2);
    expect(xy([sub.points[sub.points.length - 1]])).toEqual([[10, 0]]);
    expect(sub.points.every((p) => Number.isFinite(p.y))).toBe(true);
  });

  it("treats a zero radius as a straight line", () => {
    const [sub] = flattenPath("M0,0 A0,0 0 0,1 10,0");
    expect(xy(sub.points)).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });

  it("reads exponents and run-together numbers", () => {
    const [sub] = flattenPath("M0,0L1.5.5");
    expect(xy(sub.points)).toEqual([
      [0, 0],
      [1.5, 0.5],
    ]);
    expect(flattenPath("M0,0 L1e1,0")[0].points[1].x).toBe(10);
  });

  it("drops duplicate consecutive points", () => {
    // Zero-length segments are a degenerate ring in GeoJSON and a wasted
    // vertex everywhere else.
    const [sub] = flattenPath("M0,0 L0,0 L10,0");
    expect(xy(sub.points)).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });

  it("survives empty and malformed input without hanging", () => {
    expect(flattenPath("")).toEqual([]);
    expect(flattenPath("   ")).toEqual([]);
    // An unrecognised command must not spin on its operands.
    expect(() => flattenPath("M0,0 X1,2 L5,5")).not.toThrow();
  });

  it("subdivides more finely for a tighter tolerance", () => {
    const coarse = flattenPath("M0,0 C0,50 50,50 50,0", { tolerance: 5 });
    const fine = flattenPath("M0,0 C0,50 50,50 50,0", { tolerance: 0.05 });
    expect(fine[0].points.length).toBeGreaterThan(coarse[0].points.length);
  });
});
