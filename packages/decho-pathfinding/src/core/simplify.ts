/**
 * Douglas–Peucker, in metres.
 *
 * A shortest path over a 1500 m grid with eight-way connectivity is, visually,
 * a staircase: every second vertex is a 45° kink that carries no information
 * and that a user reads as the router being confused. Dropping vertices that
 * lie within a tolerance of the line they sit on removes the staircase and
 * nothing else — the path still passes through the same terrain, because every
 * retained vertex is an original node.
 *
 * Tolerance is in METRES rather than degrees, which is why this projects
 * locally first: a degree tolerance would be four times stricter in longitude
 * at 75° north than at the equator, so the same setting would behave
 * differently in different parts of the same route.
 *
 * Iterative rather than recursive: a long route is tens of thousands of
 * vertices and the recursive form can exhaust the stack on the pathological
 * input (a nearly straight line), which is also the most common one.
 */

import { metresPerLatDegree, metresPerLonDegree } from "./geo";

/** Waypoints are [lat, lon] — the shape @acc/app6d/orders' OrderRoute uses. */
export type Waypoint = [number, number];

export function simplifyPath(
  points: readonly Waypoint[],
  toleranceM: number,
): Waypoint[] {
  if (toleranceM <= 0 || points.length <= 2) {return points.slice();}

  const anchorLat = points[0][0];
  const mPerLat = metresPerLatDegree();
  const mPerLon = metresPerLonDegree(anchorLat);

  const xs = new Float64Array(points.length);
  const ys = new Float64Array(points.length);
  for (let i = 0; i < points.length; i++) {
    xs[i] = points[i][1] * mPerLon;
    ys[i] = points[i][0] * mPerLat;
  }

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const toleranceSq = toleranceM * toleranceM;

  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    if (last <= first + 1) {continue;}

    const x1 = xs[first];
    const y1 = ys[first];
    const dx = xs[last] - x1;
    const dy = ys[last] - y1;
    const lengthSq = dx * dx + dy * dy;

    let worst = -1;
    let worstDistSq = toleranceSq;

    for (let i = first + 1; i < last; i++) {
      const px = xs[i] - x1;
      const py = ys[i] - y1;

      // Perpendicular distance to the segment, with the degenerate
      // zero-length case (a closed loop, or duplicate endpoints) falling back
      // to distance from the shared endpoint rather than dividing by zero.
      let distSq: number;
      if (lengthSq === 0) {
        distSq = px * px + py * py;
      } else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSq));
        const ox = px - t * dx;
        const oy = py - t * dy;
        distSq = ox * ox + oy * oy;
      }

      if (distSq > worstDistSq) {
        worstDistSq = distSq;
        worst = i;
      }
    }

    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }

  const out: Waypoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) {out.push(points[i]);}
  }
  return out;
}
