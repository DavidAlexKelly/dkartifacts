import { describe, expect, it } from "vitest";

import type { Part } from "../engine/types";
import {
  emptyFeatureCollection,
  mergeFeatureCollections,
  partsToGeoJSON,
  type Position,
} from "./index";

/** Parts are generated in a pixel-ish space; this stands in for unproject. */
const toLngLat = (pt: { x: number; y: number }): Position => [
  pt.x / 1000,
  pt.y / 1000,
];

describe("partsToGeoJSON", () => {
  it("turns a stroke into a LineString and keeps its dash state", () => {
    const parts: Part[] = [{ kind: "stroke", d: "M0,0 L1000,0", dashed: true }];
    const fc = partsToGeoJSON(parts, toLngLat);

    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry).toEqual({
      type: "LineString",
      coordinates: [
        [0, 0],
        [1, 0],
      ],
    });
    // A layer styles a hundred orders with one expression over these, rather
    // than being one layer per symbol.
    expect(fc.features[0].properties).toMatchObject({
      kind: "stroke",
      dashed: true,
    });
  });

  it("turns a fill into a closed Polygon ring", () => {
    const parts: Part[] = [{ kind: "fill", d: "M0,0 L1000,0 L1000,1000 Z" }];
    const [feature] = partsToGeoJSON(parts, toLngLat).features;

    expect(feature.geometry.type).toBe("Polygon");
    const ring = (feature.geometry as { coordinates: Position[][] })
      .coordinates[0];
    // GeoJSON requires the ring be explicitly closed even though Z closed the
    // path implicitly.
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring.length).toBeGreaterThanOrEqual(4);
  });

  it("leaves a stroked ring as a LineString, not a Polygon", () => {
    // An outline is an outline: made a Polygon, a fill layer would paint its
    // interior and a boundary would become a shaded area.
    const parts: Part[] = [
      { kind: "stroke", d: "M0,0 L1000,0 L1000,1000 Z", dashed: false },
    ];
    const [feature] = partsToGeoJSON(parts, toLngLat).features;
    expect(feature.geometry.type).toBe("LineString");
  });

  it("emits a Point for text, carrying what a symbol layer needs", () => {
    const parts: Part[] = [
      { kind: "text", text: "OBJ", pos: { x: 500, y: 500 }, size: 16, rotate: 45 },
    ];
    const [feature] = partsToGeoJSON(parts, toLngLat).features;

    expect(feature.geometry).toEqual({ type: "Point", coordinates: [0.5, 0.5] });
    expect(feature.properties).toMatchObject({
      kind: "text",
      text: "OBJ",
      size: 16,
      rotate: 45,
    });
  });

  it("splits one part's subpaths into separate features", () => {
    // lineWithGap produces exactly this, and joining the halves would draw a
    // line through the gap it made.
    const parts: Part[] = [
      { kind: "stroke", d: "M0,0 L400,0 M600,0 L1000,0", dashed: false },
    ];
    expect(partsToGeoJSON(parts, toLngLat).features).toHaveLength(2);
  });

  it("merges the caller's properties onto every feature", () => {
    const parts: Part[] = [
      { kind: "stroke", d: "M0,0 L1000,0", dashed: false },
      { kind: "fill", d: "M0,0 L1000,0 L1000,1000 Z" },
    ];
    const fc = partsToGeoJSON(parts, toLngLat, {
      properties: { orderId: "abc", colour: "#c00" },
    });
    for (const feature of fc.features) {
      expect(feature.properties).toMatchObject({
        orderId: "abc",
        colour: "#c00",
      });
    }
  });

  it("drops degenerate geometry rather than emitting it", () => {
    // A zero-length line and a two-point ring are both invalid GeoJSON, and
    // both turn up from a symbol scaled to nothing.
    const parts: Part[] = [
      { kind: "stroke", d: "M5,5", dashed: false },
      { kind: "stroke", d: "M5,5 L5,5", dashed: false },
      { kind: "fill", d: "M0,0 L1000,0 Z" },
    ];
    expect(partsToGeoJSON(parts, toLngLat).features).toEqual([]);
  });

  it("flattens curves through the converter, not just the flattener", () => {
    const parts: Part[] = [
      { kind: "stroke", d: "M0,0 Q500,1000 1000,0", dashed: false },
    ];
    const [feature] = partsToGeoJSON(parts, toLngLat).features;
    const coords = (feature.geometry as { coordinates: Position[] }).coordinates;
    expect(coords.length).toBeGreaterThan(3);
    // The peak sits at half the control point's height, i.e. on the curve.
    const peak = Math.max(...coords.map((c) => c[1]));
    expect(peak).toBeGreaterThan(0.45);
    expect(peak).toBeLessThan(0.51);
  });

  it("passes the tolerance through to the flattener", () => {
    const parts: Part[] = [
      { kind: "stroke", d: "M0,0 C0,5000 5000,5000 5000,0", dashed: false },
    ];
    const coarse = partsToGeoJSON(parts, toLngLat, { tolerance: 50 });
    const fine = partsToGeoJSON(parts, toLngLat, { tolerance: 0.5 });
    const count = (fc: typeof coarse) =>
      (fc.features[0].geometry as { coordinates: Position[] }).coordinates
        .length;
    expect(count(fine)).toBeGreaterThan(count(coarse));
  });
});

describe("collection helpers", () => {
  it("clears a source without a special case", () => {
    expect(emptyFeatureCollection()).toEqual({
      type: "FeatureCollection",
      features: [],
    });
  });

  it("merges many symbols into one source's data", () => {
    const one = partsToGeoJSON(
      [{ kind: "stroke", d: "M0,0 L1000,0", dashed: false }],
      toLngLat,
      { properties: { orderId: "a" } },
    );
    const two = partsToGeoJSON(
      [{ kind: "stroke", d: "M0,0 L0,1000", dashed: false }],
      toLngLat,
      { properties: { orderId: "b" } },
    );
    const merged = mergeFeatureCollections(one, two);

    expect(merged.features).toHaveLength(2);
    expect(merged.features.map((f) => f.properties.orderId)).toEqual(["a", "b"]);
  });
});
