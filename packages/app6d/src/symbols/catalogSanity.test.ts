/**
 * What every symbol in the catalog owes, whoever wrote it and whenever.
 *
 * The family tests prove the families behave. This proves the catalog does —
 * including symbols that belong to no family, and the next hundred, since it
 * enumerates rather than lists. Four things, each of which has a failure mode
 * that reaches the map:
 *
 *  - It draws something. A definition that generates nothing renders as a
 *    symbol that vanished, and looks like a data problem, not a code one.
 *  - Its coordinates are finite. A NaN reaches the DOM as a path attribute
 *    the browser silently drops — one arm of a symbol simply missing.
 *  - It is authored roughly inside the 0-2048 parameter box. Everything is
 *    placed relative to that box, so a symbol drawn far outside it appears
 *    offset from the point it was placed at.
 *  - Its point handles land where they are dragged. A handle that ignores its
 *    own drag is the most confusing thing a map editor can do.
 */
import { describe, expect, it } from "vitest";

import { P, dist, pathPoints } from "../engine/geometry";
import { applyHandle, getHandles, getParts, paramsFor } from "../engine/render";
import { resolveUnitAnchorHandle } from "../core/tacticOrders";
import { APP6D_CATALOG } from "./index";
import type { Pt } from "../engine/geometry";

const names = APP6D_CATALOG.list();

/** Generous: labels and arrowheads legitimately overhang the box a little. */
const BOX_MIN = -250;
const BOX_MAX = 2298;

const pointsOf = (part: { kind: string; d?: string; pos?: Pt }): Pt[] =>
  part.kind === "text" && part.pos ? [part.pos] : part.d ? pathPoints(part.d) : [];

describe("every symbol in the catalog", () => {
  it("has symbols to check", () => {
    expect(names.length).toBeGreaterThan(100);
  });

  for (const name of names) {
    it(`${name} draws finite geometry inside the parameter box`, () => {
      const parts = getParts(APP6D_CATALOG, name);
      expect(parts.length).toBeGreaterThan(0);

      let drawn = 0;
      for (const part of parts) {
        for (const point of pointsOf(part)) {
          drawn++;
          expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
          expect(point.x).toBeGreaterThan(BOX_MIN);
          expect(point.x).toBeLessThan(BOX_MAX);
          expect(point.y).toBeGreaterThan(BOX_MIN);
          expect(point.y).toBeLessThan(BOX_MAX);
        }
      }
      expect(drawn).toBeGreaterThan(0);
    });

    it(`${name} resolves an anchor for an attached unit`, () => {
      // The harness's /symbols page rings this position and the mil map glues
      // units to it. Undefined here is not a crash anywhere — it is a symbol
      // that silently cannot be attached to anything, which is the kind of gap
      // that gets noticed on a map rather than in a console.
      const anchor = resolveUnitAnchorHandle(APP6D_CATALOG, name);
      expect(anchor, `${name} has no resolvable unit anchor`).toBeDefined();
      expect(Number.isFinite(anchor!.pos.x) && Number.isFinite(anchor!.pos.y)).toBe(true);
    });

    it(`${name} has handles that go where they are dragged`, () => {
      const handles = getHandles(APP6D_CATALOG, name);
      expect(handles.length).toBeGreaterThan(0);

      for (const handle of handles.filter((h) => h.kind === "point")) {
        const target = P(handle.pos.x + 300, handle.pos.y - 220);
        const next = applyHandle(APP6D_CATALOG, name, paramsFor(APP6D_CATALOG, name), handle.id, target);
        const moved = getHandles(APP6D_CATALOG, name, next).find((h) => h.id === handle.id);
        expect(moved, `${name}: handle ${handle.id} disappeared after being dragged`).toBeDefined();
        expect(dist(moved!.pos, target)).toBeLessThan(1);
      }
    });
  }
});
