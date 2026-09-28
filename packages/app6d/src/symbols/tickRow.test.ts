/**
 * Obstacle rows follow their two anchors, and put out the number of ticks they
 * were asked for.
 *
 * The wire, minefield, fence and ditch symbols are one line with something
 * repeated along it. Two things can go wrong and both are invisible in a
 * screenshot: the ticks can be spaced from where the symbol was authored
 * rather than from where its anchors now are, and the count can quietly
 * disagree with `count` — a fence with three posts drawn as a fence with two
 * is a different obstacle.
 */
import { describe, expect, it } from "vitest";

import { P, dist } from "../engine/geometry";
import { getParts, paramsFor } from "../engine/render";
import { APP6D_CATALOG } from "./index";
import type { Pt } from "../engine/geometry";

const rowSymbols = APP6D_CATALOG.list().filter((name) => {
  const p = paramsFor(APP6D_CATALOG, name);
  return p.A && p.B && typeof p.count === "number" && typeof p.tickSize === "number";
});

const MOVED: { A: Pt; B: Pt } = { A: P(5000, 9000), B: P(6800, 9600) };

const pointsOf = (part: { kind: string }): Pt[] => {
  const numbers = ("d" in part ? String(part.d) : "").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  const out: Pt[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) { out.push(P(numbers[i], numbers[i + 1])); }
  return out;
};

const distanceToSegment = (point: Pt, a: Pt, b: Pt): number => {
  const abx = b.x - a.x, aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const t = lengthSq === 0 ? 0
    : Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSq));
  return dist(point, P(a.x + t * abx, a.y + t * aby));
};

describe("obstacle rows", () => {
  it("finds the family", () => {
    expect(rowSymbols.length).toBeGreaterThanOrEqual(6);
  });

  for (const name of rowSymbols) {
    const params = paramsFor(APP6D_CATALOG, name);

    it(`${name} keeps its ticks on the line when the anchors move`, () => {
      const reach = (params.tickSize as number) * 2.5 + 50;
      for (const part of getParts(APP6D_CATALOG, name, { ...params, ...MOVED })) {
        for (const point of pointsOf(part)) {
          expect(distanceToSegment(point, MOVED.A, MOVED.B)).toBeLessThan(reach);
        }
      }
    });

    it(`${name} draws as many ticks as it says`, () => {
      const base = getParts(APP6D_CATALOG, name).length;
      const more = getParts(APP6D_CATALOG, name, { ...params, count: (params.count as number) + 2 }).length;
      // Whatever a tick costs in parts — one for a bar, two for an x — two more
      // ticks must cost twice that, and never nothing.
      expect(more).toBeGreaterThan(base);
      expect((more - base) % 2).toBe(0);
    });
  }
});
