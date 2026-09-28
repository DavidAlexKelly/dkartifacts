import { describe, expect, it } from "vitest";

import { APP6D_CATALOG } from "../symbols";
import { resolveTacticSidc } from "../core/tacticOrders";
import { TACTIC_TASK_CATALOG } from "../core/tacticTaskCatalog";
import type { PlacedOrder } from "../maplibre/types";
import {
  orderToGeoJSON,
  ordersToGeoJSON,
  type OrderToGeoJsonContext,
} from "./index";

/**
 * A stand-in for Web Mercator, and the zoom dependence is the point.
 *
 * Pixels per degree DOUBLE with each zoom level, exactly as a slippy map's do.
 * A fixed scale here would make the zoom test below assert the opposite of the
 * truth: `milxTransformFor` scales the symbol by 2^(zoom - base) so that it
 * keeps a constant size ON THE GROUND, and only a projection that scales too
 * can show that.
 */
const ctxAt = (zoom: number): OrderToGeoJsonContext => {
  const pxPerDegree = (256 * Math.pow(2, zoom)) / 360;
  return {
    project: ([lng, lat]) => ({ x: lng * pxPerDegree, y: -lat * pxPerDegree }),
    unproject: (pt) => [pt.x / pxPerDegree, -pt.y / pxPerDegree],
    zoom,
  };
};
const ctx = ctxAt(11);

/** The first doctrinal task the catalog can actually draw. */
const drawable = TACTIC_TASK_CATALOG.map((task) => ({
  task,
  sidc: resolveTacticSidc(APP6D_CATALOG, task.name),
})).find((entry) => entry.sidc);

const order = (overrides: Partial<PlacedOrder> = {}): PlacedOrder => ({
  id: "order-1",
  from: [9, 61],
  to: [9.1, 61.05],
  colour: "#c43c30",
  tacticSidc: drawable?.sidc,
  tacticLabel: drawable?.task.name,
  ...overrides,
});

const lngsOf = (fc: { features: { geometry: unknown }[] }): number[] =>
  fc.features.flatMap((f) => {
    const g = f.geometry as
      | { type: "LineString"; coordinates: [number, number][] }
      | { type: "Polygon"; coordinates: [number, number][][] }
      | { type: "Point"; coordinates: [number, number] };
    if (g.type === "LineString") {return g.coordinates.map((c) => c[0]);}
    if (g.type === "Polygon") {return g.coordinates[0].map((c) => c[0]);}
    return [g.coordinates[0]];
  });

describe("orderToGeoJSON", () => {
  it("has a drawable task to test with", () => {
    // Without this the rest would pass vacuously rather than fail.
    expect(drawable?.sidc).toBeTruthy();
  });

  it("produces finite geography near the anchor for a real catalog symbol", () => {
    const fc = orderToGeoJSON(APP6D_CATALOG, order(), ctx);
    expect(fc.features.length).toBeGreaterThan(0);

    for (const lng of lngsOf(fc)) {
      expect(Number.isFinite(lng)).toBe(true);
      // Anchored at 9E, a symbol spans metres to kilometres — not continents.
      // A broken transform lands in the Atlantic, or at NaN.
      expect(Math.abs(lng - 9)).toBeLessThan(1);
    }
  });

  it("carries the order's identity onto every feature, for data-driven styling", () => {
    const fc = orderToGeoJSON(APP6D_CATALOG, order(), ctx);
    for (const feature of fc.features) {
      expect(feature.properties).toMatchObject({
        orderId: "order-1",
        colour: "#c43c30",
      });
    }
  });

  it("moves with its anchor", () => {
    const here = Math.min(...lngsOf(orderToGeoJSON(APP6D_CATALOG, order(), ctx)));
    const there = Math.min(
      ...lngsOf(
        orderToGeoJSON(
          APP6D_CATALOG,
          order({ from: [10, 62], to: [10.1, 62.05] }),
          ctx,
        ),
      ),
    );
    expect(there - here).toBeCloseTo(1, 1);
  });

  it("covers the SAME ground at every zoom, which is the whole design", () => {
    // This is the property a 3D renderer depends on, and it is the one I had
    // backwards. `renderOnMap` takes `zoom` and scales by 2^(zoom - base) so
    // that a symbol grows on SCREEN as you zoom in and therefore stays put on
    // the GROUND. The overlay was never screen-sized; converting to geography
    // inherits ground-fixed sizing for free rather than changing it.
    //
    // Baked geometry that shifted with zoom would be the bug: pan out and
    // every control measure would silently cover different terrain.
    const spread = (zoom: number) => {
      const lngs = lngsOf(orderToGeoJSON(APP6D_CATALOG, order(), ctxAt(zoom)));
      return Math.max(...lngs) - Math.min(...lngs);
    };
    expect(spread(13)).toBeCloseTo(spread(11), 6);
    expect(spread(8)).toBeCloseTo(spread(11), 6);
  });

  it("respects milxScale", () => {
    const extent = (milxScale: number) => {
      const lngs = lngsOf(
        orderToGeoJSON(APP6D_CATALOG, order({ milxScale }), ctx),
      );
      return Math.max(...lngs) - Math.min(...lngs);
    };
    expect(extent(2)).toBeGreaterThan(extent(1));
  });

  it("returns nothing rather than throwing when there is no symbol to draw", () => {
    expect(
      orderToGeoJSON(APP6D_CATALOG, order({ tacticSidc: undefined }), ctx)
        .features,
    ).toEqual([]);
    expect(
      orderToGeoJSON(APP6D_CATALOG, order({ tacticSidc: "NOT-A-SIDC" }), ctx)
        .features,
    ).toEqual([]);
  });

  it("survives an anchor the projection cannot place", () => {
    // A camera mid-flight, or a point behind the globe's horizon.
    const broken: OrderToGeoJsonContext = {
      ...ctx,
      project: () => ({ x: NaN, y: NaN }),
    };
    expect(orderToGeoJSON(APP6D_CATALOG, order(), broken).features).toEqual([]);
  });

  it("merges many orders into one collection for one source", () => {
    const fc = ordersToGeoJSON(
      APP6D_CATALOG,
      [order({ id: "a" }), order({ id: "b" })],
      ctx,
    );
    expect(new Set(fc.features.map((f) => f.properties.orderId))).toEqual(
      new Set(["a", "b"]),
    );
  });
});
