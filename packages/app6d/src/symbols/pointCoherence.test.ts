/**
 * Every part of a point marker must follow its anchor.
 *
 * The axis symbols have spineCoherence.test.ts for this; the inverted-cone
 * point markers are the same hazard in a different shape. Their draw rules say
 * the anchor is the TIP, and several of them are rotated in 90 degree
 * increments to keep the box off the ground it refers to — so a symbol that
 * held its box, its taper or its label as absolute coordinates would leave
 * them behind the first time it was placed or turned, and the tip would stop
 * meaning "here".
 *
 * The family is found by params rather than by name, so symbols added later
 * are covered without touching this file.
 */
import { describe, expect, it } from "vitest";

import { P, dist, pathPoints } from "../engine/geometry";
import { applyHandle, getHandles, getParts, paramsFor } from "../engine/render";
import { resolveUnitAnchorHandle } from "../core/tacticOrders";
import { coneFrame } from "./families";
import { APP6D_CATALOG } from "./index";
import type { Pt } from "../engine/geometry";

/**
 * Every coordinate a part draws.
 *
 * Via the engine's own path reader: these symbols draw rings, and the five
 * numbers in `A rx ry rotation large sweep x y` are not a position. Pairing
 * them off blindly turns a ring into a scatter of points near the origin,
 * which would then pass every "did it follow the anchor" assertion here by
 * being nowhere near anything.
 */
function pointsOf(part: { kind: string; d?: string; pos?: Pt }): Pt[] {
  if (part.kind === "text" && part.pos) {
    return [part.pos];
  }
  return part.d ? pathPoints(part.d) : [];
}

const coneSymbols = APP6D_CATALOG.list().filter((name) => {
  const p = paramsFor(APP6D_CATALOG, name);
  return p.tip && typeof p.size === "number";
});

/** Somewhere the authored coordinates emphatically are not. */
const MOVED_TIP = P(7200, 6400);
const PARAM_BOX = 2048;

describe("inverted-cone point markers follow their tip", () => {
  it("finds the family", () => {
    expect(coneSymbols.length).toBeGreaterThanOrEqual(10);
  });

  for (const name of coneSymbols) {
    const params = paramsFor(APP6D_CATALOG, name);
    const reach = coneFrame(params).height * 1.5;

    it(`${name} draws nothing left behind when the tip moves`, () => {
      for (const part of getParts(APP6D_CATALOG, name, { ...params, tip: MOVED_TIP })) {
        for (const point of pointsOf(part)) {
          expect(dist(point, MOVED_TIP)).toBeLessThan(reach);
        }
      }
    });

    it(`${name} turns about its tip, not about its box`, () => {
      // The tip is the location being marked. Rotating the graphic aside must
      // not move it — and the box must actually go somewhere, or "rotated in
      // 90 degree increments" is being quietly ignored.
      const upright = getParts(APP6D_CATALOG, name, params);
      const turned = getParts(APP6D_CATALOG, name, { ...params, rotation: 90 });
      for (const part of turned) {
        for (const point of pointsOf(part)) {
          expect(dist(point, params.tip as Pt)).toBeLessThan(reach);
        }
      }
      const topOf = (parts: ReturnType<typeof getParts>): Pt => pointsOf(parts[0])[2];
      expect(dist(topOf(upright), topOf(turned))).toBeGreaterThan(coneFrame(params).height);
    });

    it(`${name} anchors a unit to its tip`, () => {
      const handles = getHandles(APP6D_CATALOG, name);
      const tip = handles.find((h) => h.id === "tip");
      expect(tip?.kind).toBe("point");
      expect(dist(tip!.pos, params.tip as Pt)).toBe(0);
      // unitAnchor: 'start' has to resolve to the tip and say so by id —
      // attaching a unit re-applies every other handle around the named one.
      const anchor = resolveUnitAnchorHandle(APP6D_CATALOG, name);
      expect(anchor?.id).toBe("tip");
      expect(dist(anchor!.pos, params.tip as Pt)).toBe(0);
    });

    it(`${name} is authored inside the parameter box`, () => {
      for (const part of getParts(APP6D_CATALOG, name)) {
        for (const point of pointsOf(part)) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(PARAM_BOX);
          expect(point.y).toBeLessThanOrEqual(PARAM_BOX);
        }
      }
    });
  }
});

/**
 * The other half of the point graphics: the ones anchored at their centre
 * rather than at a tip — Destroy and its neighbours, and the static control
 * measures (#6 Contact Point, #7 Coordinating Point, #8 Decision Point, #19
 * Waypoint, #107 Air Control Point). Same hazard, same test: they are built
 * from local coordinates around `center`, so anything that forgot to go
 * through that transform stays behind.
 */
const glyphSymbols = APP6D_CATALOG.list().filter((name) => {
  const p = paramsFor(APP6D_CATALOG, name);
  return p.center && typeof p.scale === "number" && typeof p.rotation === "number";
});

const MOVED_CENTRE = P(8100, 5200);

describe("centre-anchored point glyphs follow their centre", () => {
  it("finds the family", () => {
    expect(glyphSymbols.length).toBeGreaterThanOrEqual(8);
  });

  for (const name of glyphSymbols) {
    const params = paramsFor(APP6D_CATALOG, name);
    const centre = params.center as Pt;
    // How far this symbol legitimately reaches, measured from itself rather
    // than guessed: a star's points and a label's own extent differ by a lot.
    const reach = Math.max(
      ...getParts(APP6D_CATALOG, name).flatMap((part) =>
        pointsOf(part).map((point) => dist(point, centre)),
      ),
    ) * 1.05 + 50;

    it(`${name} draws nothing left behind when the centre moves`, () => {
      for (const part of getParts(APP6D_CATALOG, name, { ...params, center: MOVED_CENTRE })) {
        for (const point of pointsOf(part)) {
          expect(dist(point, MOVED_CENTRE)).toBeLessThan(reach);
        }
      }
    });

    it(`${name} scales about its centre`, () => {
      const half = getParts(APP6D_CATALOG, name, { ...params, scale: 0.5 });
      for (const part of half) {
        for (const point of pointsOf(part)) {
          expect(dist(point, centre)).toBeLessThan(reach * 0.55);
        }
      }
    });

    it(`${name} anchors a unit to its centre`, () => {
      const anchor = resolveUnitAnchorHandle(APP6D_CATALOG, name);
      expect(anchor?.id).toBe("center");
      expect(dist(anchor!.pos, centre)).toBe(0);
    });
  }
});

describe("the cone's size/rotate handle", () => {
  const name = "svg-checkpoint";
  const params = paramsFor(APP6D_CATALOG, name);
  const tip = params.tip as Pt;

  it("puts the top edge under the cursor, upright", () => {
    const target = P(tip.x, tip.y - 1000);
    const next = applyHandle(APP6D_CATALOG, name, params, "sizeRotate", target);
    expect(next.rotation).toBeCloseTo(0);
    expect(next.size).toBeCloseTo(500); // 1000 / (taper 2/3 + box 4/3)
    expect(dist(coneFrame(next).top, target)).toBeLessThan(1e-6);
    expect(dist(next.tip as Pt, tip)).toBe(0);
  });

  it("puts the top edge under the cursor, turned", () => {
    const target = P(tip.x + 900, tip.y);
    const next = applyHandle(APP6D_CATALOG, name, params, "sizeRotate", target);
    expect(next.rotation).toBeCloseTo(90);
    expect(dist(coneFrame(next).top, target)).toBeLessThan(1e-6);
  });

  it("refuses to collapse the symbol to nothing", () => {
    const next = applyHandle(APP6D_CATALOG, name, params, "sizeRotate", tip);
    expect(next.size).toBeGreaterThan(0);
  });
});
