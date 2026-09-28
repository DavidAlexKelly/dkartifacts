/**
 * Every part of an axis symbol must follow its spine.
 *
 * A spine is re-fitted the moment a symbol is placed on a map — to a route, to
 * a drag, to a unit that has moved. Any sub-geometry authored as absolute
 * coordinates stays behind at the position the symbol was drawn in, and the
 * result is a graphic half of which tracks the unit while the other half sits
 * in open country, reading as geometry belonging to some other symbol.
 *
 * This catches that for the whole family at once, including symbols added
 * later: bend the spine somewhere far from where it was authored, and assert
 * nothing the symbol draws is left behind.
 */
import { describe, expect, it } from "vitest";

import { P, dist, pathPoints } from "../engine/geometry";
import { getParts, paramsFor } from "../engine/render";
import { APP6D_CATALOG } from "./index";
import type { Pt } from "../engine/geometry";

/**
 * Every coordinate a part draws.
 *
 * Via the engine's own path reader, which knows that the five numbers in
 * `A rx ry rotation large sweep x y` are not a position — the scalloped lines
 * are drawn as arcs, and pairing numbers off blindly would place them near the
 * origin and quietly pass every assertion below.
 */
function pointsOf(part: { kind: string; d?: string; pos?: Pt }): Pt[] {
  if (part.kind === "text" && part.pos) {
    return [part.pos];
  }
  return part.d ? pathPoints(part.d) : [];
}

/** Shortest distance from a point to a polyline. */
function distanceToSpine(point: Pt, spine: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < spine.length; i++) {
    const a = spine[i];
    const b = spine[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lengthSq = abx * abx + aby * aby;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSq),
          );
    best = Math.min(best, dist(point, P(a.x + t * abx, a.y + t * aby)));
  }
  return best;
}

const spineSymbols = APP6D_CATALOG.list().filter((name) =>
  Array.isArray(paramsFor(APP6D_CATALOG, name).spine),
);

/** Somewhere the authored coordinates emphatically are not. */
const MOVED_SPINE: Pt[] = [
  P(6000, 7000),
  P(6000, 6400),
  P(6600, 6000),
  P(7400, 6000),
];

describe("axis symbols follow their spine", () => {
  it("finds the family", () => {
    expect(spineSymbols.length).toBeGreaterThan(5);
  });

  for (const name of spineSymbols) {
    it(`${name} draws nothing left behind when the spine moves`, () => {
      const params = paramsFor(APP6D_CATALOG, name);
      const moved = getParts(APP6D_CATALOG, name, {
        ...params,
        spine: MOVED_SPINE,
      });

      // Generous: the head, the body offsets and a label's own extent all sit
      // legitimately off the centreline. Stray geometry is not marginally
      // outside this — it is thousands of units away, back where the symbol
      // was authored.
      const tolerance =
        (params.halfWidth ?? 0) +
        (params.headLen ?? 0) +
        (params.headHalf ?? 0) +
        (params.labelSize ?? 0) +
        (params.fire?.braceHalf ?? 0) +
        (params.fire?.standoff ?? 0) +
        (params.fire?.stemLen ?? 0) +
        400;

      for (const part of moved) {
        for (const point of pointsOf(part)) {
          expect(distanceToSpine(point, MOVED_SPINE)).toBeLessThan(tolerance);
        }
      }
    });
  }
});

describe("deriving did not change the authored symbols", () => {
  // The coordinates these two used to carry, verbatim. Deriving them was only
  // defensible if it reproduces the symbol as drawn — so prove it, rather than
  // asserting it in a comment.
  it("svg-main-attack's notch is where it was hand-authored", () => {
    const parts = getParts(APP6D_CATALOG, "svg-main-attack");
    const notch = parts[parts.length - 1];
    const points = pointsOf(notch);
    expect(points).toHaveLength(3);
    const expected = [P(1228, 320), P(1529, 580), P(1228, 841)];
    for (let i = 0; i < 3; i++) {
      // Within a unit, not to the unit: the authored notch was asymmetric by
      // exactly one — 320 sits 260 above the axis and 841 sits 261 below —
      // which is the hand-drawing artefact that deriving it removes. At a
      // symbol 2048 units across, and at any zoom a map renders it at, one
      // unit is invisible; the asymmetry was never intentional.
      expect(dist(points[i], expected[i])).toBeLessThanOrEqual(1);
    }
  });

  it("svg-counterattack-by-fire's brace is where it was hand-authored", () => {
    const parts = getParts(APP6D_CATALOG, "svg-counterattack-by-fire");
    // The brace is built around `pos`, which used to be the absolute
    // P(1688, 609): the stem runs from it along the axis.
    const stem = parts[2];
    const [start] = pointsOf(stem);
    expect(dist(start, P(1688, 609))).toBeLessThan(1);
  });
});
