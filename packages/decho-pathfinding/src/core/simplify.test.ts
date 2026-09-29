import { describe, expect, it } from "vitest";

import { haversineM } from "./geo.js";
import { simplifyPath, type Waypoint } from "./simplify.js";

describe("simplifying a path", () => {
  it("collapses a straight line to its endpoints", () => {
    const points: Waypoint[] = [];
    for (let i = 0; i <= 20; i++) {points.push([60, 24 + i * 0.01]);}
    expect(simplifyPath(points, 100)).toEqual([points[0], points[20]]);
  });

  /** The grid staircase this exists for: a 45° run of alternating steps. */
  it("removes the staircase but keeps the corner", () => {
    const points: Waypoint[] = [];
    for (let i = 0; i < 10; i++) {
      points.push([60 + i * 0.01, 24 + i * 0.01]);
      points.push([60 + i * 0.01, 24 + (i + 1) * 0.01]);
    }
    points.push([60.5, 24.1]); // a genuine turn at the end

    const simplified = simplifyPath(points, 2000);
    expect(simplified.length).toBeLessThan(points.length / 2);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
  });

  it("keeps every retained vertex within the tolerance of the original line", () => {
    const points: Waypoint[] = [
      [60, 24],
      [60.01, 24.02],
      [60.02, 24.04],
      [60.05, 24.02],
      [60.08, 24],
    ];
    const tolerance = 500;
    const simplified = simplifyPath(points, tolerance);

    // Every dropped point must be within tolerance of the simplified polyline.
    for (const [lat, lon] of points) {
      let nearest = Infinity;
      for (let i = 1; i < simplified.length; i++) {
        nearest = Math.min(
          nearest,
          pointToSegmentM([lat, lon], simplified[i - 1], simplified[i]),
        );
      }
      expect(nearest).toBeLessThanOrEqual(tolerance * 1.01);
    }
  });

  it("is a no-op at zero tolerance or below three points", () => {
    const points: Waypoint[] = [
      [60, 24],
      [60.01, 24.01],
      [60.02, 24.02],
    ];
    expect(simplifyPath(points, 0)).toEqual(points);
    expect(simplifyPath(points.slice(0, 2), 1000)).toEqual(points.slice(0, 2));
  });
});

/** Crude but independent of the implementation under test. */
function pointToSegmentM(p: Waypoint, a: Waypoint, b: Waypoint): number {
  const steps = 64;
  let best = Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = a[0] + (b[0] - a[0]) * t;
    const lon = a[1] + (b[1] - a[1]) * t;
    best = Math.min(best, haversineM(p[1], p[0], lon, lat));
  }
  return best;
}
