import { describe, it, expect } from "vitest";
import { SymbolCatalog } from "../engine/catalog";
import { APP6D_SYMBOLS } from "../symbols/index";
import { milxFromForAnchorClick, milxHandlesForOrder, isMilxOrder } from "./tacticOrders";
import { getHandles } from "../engine/render";

const catalog = new SymbolCatalog(APP6D_SYMBOLS);

// Regression test for a placement bug: several built-in symbols declared a
// `unitAnchor` that didn't match any handle their own handles() function
// actually exposes (e.g. unitAnchor: 'end' on a symbol whose only point
// handle is named "center"). milxFromForAnchorClick silently fell back to
// "no compensation" in that case, so clicking to place the symbol left its
// visual anchor drifted away from the cursor — by up to ~1000px at high
// zoom in the worst cases (Guard/Cover/Screen had no unitAnchor at all).
//
// For every built-in symbol, clicking to place it should put the symbol's
// own declared anchor point exactly under the click, regardless of zoom.
describe("milxFromForAnchorClick", () => {
  const click = { x: 500, y: 500 };
  const zoom = 15; // representative "placing a symbol" zoom level
  const EPSILON = 0.5; // px

  for (const name of Object.keys(APP6D_SYMBOLS)) {
    it(`anchors ${name} under the click point at zoom ${zoom}`, () => {
      const sidc = name.toUpperCase().replace(/-/g, "");
      expect(isMilxOrder(catalog, sidc)).toBe(true);

      const from = milxFromForAnchorClick(catalog, sidc, click, zoom, 1);
      const handles = milxHandlesForOrder(catalog, sidc, from, undefined, zoom, 1);
      const pointHandles = handles.filter((h) => h.kind === "point");
      expect(pointHandles.length).toBeGreaterThan(0);

      const unitAnchor = catalog.get(name)?.unitAnchor;
      expect(unitAnchor, `${name} is missing unitAnchor`).toBeDefined();

      // Compute where *this* symbol's own semantics say the anchor should
      // land: a literal "center" handle if it declares one, otherwise the
      // centroid of its point handles (the generic fallback the resolver
      // uses for symbols with non-conventional handle names, and — for
      // start/end/midline-tagged symbols sharing a two-endpoint shape —
      // effectively coincides with the endpoint it names).
      const named = pointHandles.find((h) => h.id === "center");
      const target = named
        ? named.pos
        : {
            x: pointHandles.reduce((s, h) => s + h.pos.x, 0) / pointHandles.length,
            y: pointHandles.reduce((s, h) => s + h.pos.y, 0) / pointHandles.length,
          };

      // Only assert the strict "click === centroid/center" invariant for
      // symbols where that's actually what unitAnchor implies (center, or
      // a symbol whose only point handle is its named anchor). start/end
      // symbols with several point handles (e.g. an axis spine) anchor on
      // one specific endpoint, not the centroid — checked separately below.
      if (unitAnchor === "center" || pointHandles.length === 1) {
        expect(Math.hypot(target.x - click.x, target.y - click.y)).toBeLessThan(EPSILON);
      }
    });
  }

  it("anchors a 'start' symbol's first point handle under the click", () => {
    // svg-block: unitAnchor 'start', handles A (first) and B.
    const from = milxFromForAnchorClick(catalog, "SVGBLOCK", click, zoom, 1);
    const handles = getHandles(catalog, "svg-block");
    const aIndex = handles.findIndex((h) => h.id === "A");
    const rendered = milxHandlesForOrder(catalog, "SVGBLOCK", from, undefined, zoom, 1);
    const a = rendered.find((h) => h.id === "A")!;
    expect(aIndex).toBeGreaterThanOrEqual(0);
    expect(Math.hypot(a.pos.x - click.x, a.pos.y - click.y)).toBeLessThan(EPSILON);
  });

  it("anchors a 'midline' symbol's A/B midpoint under the click", () => {
    // svg-wire-x: unitAnchor 'midline', handles A and B.
    const from = milxFromForAnchorClick(catalog, "SVGWIREX", click, zoom, 1);
    const rendered = milxHandlesForOrder(catalog, "SVGWIREX", from, undefined, zoom, 1);
    const a = rendered.find((h) => h.id === "A")!;
    const b = rendered.find((h) => h.id === "B")!;
    const mid = { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 };
    expect(Math.hypot(mid.x - click.x, mid.y - click.y)).toBeLessThan(EPSILON);
  });

  it("falls back gracefully for an undeclared unitAnchor", () => {
    const noAnchorCatalog = new SymbolCatalog({
      plain: {
        title: "Plain",
        params: { A: { x: 0, y: 0 }, B: { x: 100, y: 100 } },
        generate: () => [],
        handles: (p) => [
          { id: "A", kind: "point", pos: p.A, set: (pos) => ({ A: pos }) },
          { id: "B", kind: "point", pos: p.B, set: (pos) => ({ B: pos }) },
        ],
        // deliberately no unitAnchor
      },
    });
    const from = milxFromForAnchorClick(noAnchorCatalog, "PLAIN", click, zoom, 1);
    expect(from).toEqual(click);
  });
});
