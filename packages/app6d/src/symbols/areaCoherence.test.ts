/**
 * A drawn area's label block stays inside the area.
 *
 * These symbols are the case the publication itself warns about: the label
 * "shall be movable and scalable as a block within the area". Movable is the
 * trap. Store the block's position as a point and it stays where it was
 * authored — so the ring gets redrawn around real terrain a hundred kilometres
 * away and the "NFA" caption sits over open country, meaning nothing, or worse,
 * meaning it over somewhere else.
 *
 * Holding it as a fraction of the ring's extent is what makes that impossible,
 * and this is the test that says so: redraw the ring somewhere else, at a
 * different size, and the label has to be inside it — including after the user
 * has dragged it off-centre.
 */
import { describe, expect, it } from "vitest";

import { P } from "../engine/geometry";
import { applyHandle, getHandles, getParts, paramsFor } from "../engine/render";
import { areaLabelPos, ringCentre } from "./families";
import { resolveUnitAnchorHandle } from "../core/tacticOrders";
import { APP6D_CATALOG } from "./index";
import type { Pt } from "../engine/geometry";

const areaSymbols = APP6D_CATALOG.list().filter((name) =>
  Array.isArray(paramsFor(APP6D_CATALOG, name).ring),
);

/** Somewhere else, and half the size. */
const MOVED_RING: Pt[] = [P(6000, 7000), P(6400, 6900), P(6600, 7300), P(6100, 7500)];

const inside = (point: Pt, ring: Pt[]): boolean => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      hit = !hit;
    }
  }
  return hit;
};

const textPositions = (name: string, overrides?: Record<string, unknown>): Pt[] =>
  getParts(APP6D_CATALOG, name, overrides)
    .filter((part) => part.kind === "text")
    .map((part) => (part as { pos: Pt }).pos);

describe("drawn areas keep their label block", () => {
  it("finds the family", () => {
    expect(areaSymbols.length).toBeGreaterThanOrEqual(10);
  });

  for (const name of areaSymbols) {
    // Some of these carry no text of their own — an irregular target's only
    // label is the target number, which is the caller's — so the block is
    // supplied here rather than assumed. What is being tested is the family's
    // placement of a block, not whether a particular symbol ships with one.
    const withLabel = { label: ["XX", "YY"] };

    it(`${name} labels the middle of the area it is given`, () => {
      const positions = textPositions(name, { ...withLabel, ring: MOVED_RING });
      expect(positions.length).toBeGreaterThan(0);
      for (const pos of positions) {
        expect(inside(pos, MOVED_RING)).toBe(true);
      }
    });

    it(`${name} draws no text, and offers no label handle, until it is given one`, () => {
      expect(textPositions(name, { label: [] })).toHaveLength(0);
      const handles = getHandles(APP6D_CATALOG, name, { label: [] });
      expect(handles.filter((h) => h.id === "label")).toHaveLength(0);
    });

    it(`${name} carries an off-centre label across to a new ring`, () => {
      // Drag the block towards one corner, then redraw the area elsewhere: the
      // block should still be in the area, and still off-centre the same way.
      const params = paramsFor(APP6D_CATALOG, name, withLabel);
      const ring = params.ring as Pt[];
      const centre = ringCentre(ring);
      const dragged = applyHandle(APP6D_CATALOG, name, params, "label",
        P(centre.x + 200, centre.y - 150));
      expect(dragged.labelOffset).toBeDefined();

      const moved = { ...dragged, ring: MOVED_RING };
      for (const pos of textPositions(name, moved)) {
        expect(inside(pos, MOVED_RING)).toBe(true);
      }
      const off = areaLabelPos(moved);
      const movedCentre = ringCentre(MOVED_RING);
      expect(off.x).toBeGreaterThan(movedCentre.x);
      expect(off.y).toBeLessThan(movedCentre.y);
    });

    it(`${name} has one handle per ring point, plus the centre and the label`, () => {
      const params = paramsFor(APP6D_CATALOG, name, withLabel);
      const handles = getHandles(APP6D_CATALOG, name, withLabel);
      expect(handles.filter((h) => h.kind === "point"))
        .toHaveLength((params.ring as Pt[]).length + 1);
      expect(handles.filter((h) => h.id === "center")).toHaveLength(1);
      expect(handles.filter((h) => h.id === "label")).toHaveLength(1);
    });

    it(`${name} moves as a block from its centre, and that is its unit anchor`, () => {
      // The anchor an order attaches a unit to has to be a handle, not a
      // derived centroid: attaching re-applies every other handle, which needs
      // the anchor's id. It also has to move the whole area, or dragging the
      // unit would leave the area behind it.
      const params = paramsFor(APP6D_CATALOG, name);
      const ring = params.ring as Pt[];
      const anchor = resolveUnitAnchorHandle(APP6D_CATALOG, name);
      expect(anchor?.id).toBe("center");

      const target = P(anchor!.pos.x + 4000, anchor!.pos.y - 2500);
      const moved = applyHandle(APP6D_CATALOG, name, params, "center", target);
      const movedRing = moved.ring as Pt[];
      expect(movedRing).toHaveLength(ring.length);
      // Same shape, somewhere else: every point shifted by the same delta.
      for (let i = 0; i < ring.length; i++) {
        expect(movedRing[i].x - ring[i].x).toBeCloseTo(target.x - anchor!.pos.x, 6);
        expect(movedRing[i].y - ring[i].y).toBeCloseTo(target.y - anchor!.pos.y, 6);
      }
      expect(inside(areaLabelPos(moved), movedRing)).toBe(true);
    });
  }
});
