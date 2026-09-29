import { describe, expect, it } from "vitest";

import {
  BUILDINGS_SOURCE_LAYER,
  buildingBaseExpression,
  buildingHeightExpression,
  buildings3d,
  describeBuildingCoverage,
  type QueryableMap,
} from "./buildings.js";
import { mergeExtensionStyle, type ExtensionContext, type ExtensionMap } from "./extensions.js";

const ctx: ExtensionContext = {
  maplibregl: { addProtocol: () => undefined, removeProtocol: () => undefined },
  basemapSourceId: "protomaps",
  basemapMaxZoom: 12,
};

interface LayerSpec {
  id: string;
  type: string;
  source?: string;
  "source-layer"?: string;
  minzoom?: number;
  filter?: unknown;
  paint?: Record<string, unknown>;
}

const styleOf = async (extension: ReturnType<typeof buildings3d>) =>
  (await extension.style?.(ctx)) ?? {};

const layerOf = async (
  extension: ReturnType<typeof buildings3d>,
): Promise<LayerSpec> => ((await styleOf(extension)).layers?.[0] as LayerSpec);

describe("buildings3d", () => {
  it("reads the basemap's own source rather than adding one", async () => {
    // The whole point: the height data is already in the tiles being
    // downloaded, so this costs no new bytes and no new dataset.
    const contribution = await styleOf(buildings3d());
    expect(contribution.sources).toBeUndefined();

    const layer = await layerOf(buildings3d());
    expect(layer.source).toBe("protomaps");
    expect(layer["source-layer"]).toBe(BUILDINGS_SOURCE_LAYER);
    expect(layer.type).toBe("fill-extrusion");
  });

  it("goes under the labels", async () => {
    expect((await styleOf(buildings3d())).before).toBe("labels");
  });

  it("extrudes from height and min_height", async () => {
    const paint = (await layerOf(buildings3d())).paint ?? {};
    expect(paint["fill-extrusion-height"]).toEqual([
      "coalesce",
      ["get", "height"],
      9,
    ]);
    expect(paint["fill-extrusion-base"]).toEqual([
      "coalesce",
      ["get", "min_height"],
      0,
    ]);
  });

  it("falls back to a default height, because most OSM buildings have none", () => {
    expect(buildingHeightExpression(9)).toEqual([
      "coalesce",
      ["get", "height"],
      9,
    ]);
    expect(buildingHeightExpression(9, 1.5)).toEqual([
      "*",
      1.5,
      ["coalesce", ["get", "height"], 9],
    ]);
    // No pointless multiplication at the honest exaggeration.
    expect(buildingBaseExpression()).toEqual(["coalesce", ["get", "min_height"], 0]);
    expect(buildingBaseExpression(2)).toEqual([
      "*",
      2,
      ["coalesce", ["get", "min_height"], 0],
    ]);
  });

  it("excludes address points, and parts unless asked", async () => {
    // kind=address features are points in the same source-layer. Extruding a
    // point draws nothing, but filtering says what is meant.
    expect((await layerOf(buildings3d())).filter).toEqual([
      "==",
      ["get", "kind"],
      "building",
    ]);

    expect((await layerOf(buildings3d({ includeParts: true }))).filter).toEqual([
      "match",
      ["get", "kind"],
      ["building", "building_part"],
      true,
      false,
    ]);
  });

  it("fades in over half a zoom level from its floor", async () => {
    const paint = (await layerOf(buildings3d({ minZoom: 15, opacity: 0.8 })))
      .paint ?? {};
    // fill-extrusion-opacity cannot vary per feature, but it can vary by zoom,
    // which is the one thing needed to stop buildings popping into existence.
    expect(paint["fill-extrusion-opacity"]).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      15,
      0,
      15.5,
      0.8,
    ]);
    expect((await layerOf(buildings3d({ minZoom: 15 }))).minzoom).toBe(15);
  });

  it("merges into a flavor's layer list under the first symbol layer", async () => {
    const base = {
      sources: { protomaps: { type: "vector" } },
      layers: [
        { id: "landcover", type: "fill", source: "protomaps" },
        { id: "buildings", type: "fill", source: "protomaps" },
        { id: "place-labels", type: "symbol", source: "protomaps" },
      ],
    };

    const merged = mergeExtensionStyle(base, [
      { id: "buildings-3d", contribution: await styleOf(buildings3d()) },
    ]);

    expect(merged.layers.map((l) => (l as LayerSpec).id)).toEqual([
      "landcover",
      "buildings",
      "buildings-3d-extrusion",
      "place-labels",
    ]);
  });
});

/** A map stub recording the style changes an extension makes. */
function stubMap(layers: Record<string, { minzoom?: number; maxzoom?: number }>) {
  const zoomRanges: Array<[string, number, number]> = [];
  const layout: Array<[string, string, unknown]> = [];
  const map = {
    getLayer: (id: string) => layers[id],
    setLayerZoomRange: (id: string, minzoom: number, maxzoom: number) => {
      zoomRanges.push([id, minzoom, maxzoom]);
    },
    setLayoutProperty: (id: string, name: string, value: unknown) => {
      layout.push([id, name, value]);
    },
  } as unknown as ExtensionMap;
  return { map, zoomRanges, layout };
}

describe("buildings3d handing off the flat fill", () => {
  it("stops the flavor's flat buildings where the extrusion starts", async () => {
    // Two representations of one footprint at the same zoom leaves the flat
    // fill showing as a hard edge around every extrusion.
    const { map, zoomRanges } = stubMap({
      buildings: { minzoom: 12, maxzoom: 24 },
    });
    const dispose = buildings3d({ minZoom: 14 }).attach?.(map, ctx);

    expect(zoomRanges).toEqual([["buildings", 12, 14]]);

    // And puts it back, in case the map outlives the extension.
    (dispose as () => void)();
    expect(zoomRanges[1]).toEqual(["buildings", 12, 24]);
  });

  it("leaves the zoom range alone when the flavor has no such layer", () => {
    const { map, zoomRanges } = stubMap({});
    buildings3d().attach?.(map, ctx);
    expect(zoomRanges).toEqual([]);
  });

  it("leaves the zoom range alone when the hand-off is turned off", () => {
    const { map, zoomRanges } = stubMap({ buildings: {} });
    buildings3d({ handOffFlatLayer: false }).attach?.(map, ctx);
    expect(zoomRanges).toEqual([]);
  });

  it("can hand off a differently named layer", () => {
    const { map, zoomRanges } = stubMap({ "my-buildings": { minzoom: 13 } });
    buildings3d({ handOffFlatLayer: "my-buildings", minZoom: 15 }).attach?.(
      map,
      ctx,
    );
    expect(zoomRanges).toEqual([["my-buildings", 13, 15]]);
  });
});

describe("buildings3d toggling", () => {
  it("contributes the layer even when it starts hidden", async () => {
    // Always contributed, so switching later is a layout property rather than
    // a rebuilt style — which is what makes the toggle instant and keeps the
    // downloaded tiles, the camera and the drawing.
    const layer = await layerOf(buildings3d({ visible: false }));
    expect(layer.id).toBe("buildings-3d-extrusion");
    expect((layer as { layout?: unknown }).layout).toEqual({
      visibility: "none",
    });
  });

  it("is visible by default", async () => {
    const layer = await layerOf(buildings3d());
    expect((layer as { layout?: unknown }).layout).toEqual({
      visibility: "visible",
    });
  });

  it("flips visibility on a live map, without touching sources", () => {
    const { map, layout } = stubMap({ buildings: { minzoom: 12, maxzoom: 24 } });
    const extension = buildings3d({ minZoom: 14, visible: false });
    extension.attach?.(map, ctx);

    expect(extension.visible).toBe(false);
    expect(layout).toEqual([["buildings-3d-extrusion", "visibility", "none"]]);

    extension.setVisible(true);
    expect(extension.visible).toBe(true);
    expect(layout[1]).toEqual([
      "buildings-3d-extrusion",
      "visibility",
      "visible",
    ]);
  });

  it("hands the flat fill back when the extrusion is hidden", () => {
    // Hiding the extrusion without restoring the flat fill's zooms leaves the
    // map with NO buildings above the floor, which reads as a broken toggle.
    const { map, zoomRanges } = stubMap({
      buildings: { minzoom: 12, maxzoom: 24 },
    });
    const extension = buildings3d({ minZoom: 14 });
    extension.attach?.(map, ctx);
    expect(zoomRanges).toEqual([["buildings", 12, 14]]);

    extension.setVisible(false);
    expect(zoomRanges[1]).toEqual(["buildings", 12, 24]);

    extension.setVisible(true);
    expect(zoomRanges[2]).toEqual(["buildings", 12, 14]);
  });

  it("remembers a toggle made before the map exists", () => {
    const extension = buildings3d();
    extension.setVisible(false);
    expect(extension.visible).toBe(false);

    const { map, layout } = stubMap({});
    extension.attach?.(map, ctx);
    expect(layout).toEqual([["buildings-3d-extrusion", "visibility", "none"]]);
  });

  it("does nothing when set to the value it already has", () => {
    const { map, layout } = stubMap({});
    const extension = buildings3d();
    extension.attach?.(map, ctx);
    expect(layout).toHaveLength(1);

    extension.setVisible(true);
    expect(layout).toHaveLength(1);
  });

  it("stops touching a map it has been detached from", () => {
    const { map, layout } = stubMap({});
    const extension = buildings3d();
    const dispose = extension.attach?.(map, ctx) as () => void;
    dispose();

    extension.setVisible(false);
    // One call from attach, and nothing after the teardown: a stale reference
    // here would be mutating a map that has been removed.
    expect(layout).toHaveLength(1);
  });
});

describe("describeBuildingCoverage", () => {
  const mapWith = (
    properties: Array<Record<string, unknown>>,
    zoom = 15,
  ): QueryableMap => ({
    getZoom: () => zoom,
    querySourceFeatures: () => properties.map((p) => ({ properties: p })),
  });

  it("counts features, kinds and heights", () => {
    const coverage = describeBuildingCoverage(
      mapWith([
        { kind: "building", height: 12 },
        { kind: "building", height: 30 },
        { kind: "building" },
        { kind: "building_part", height: 8, min_height: 4 },
        { kind: "address", addr_housenumber: "12" },
      ]),
      { sourceId: "protomaps" },
    );

    expect(coverage.features).toBe(5);
    expect(coverage.withHeight).toBe(3);
    expect(coverage.withMinHeight).toBe(1);
    expect(coverage.kinds).toEqual({
      building: 3,
      building_part: 1,
      address: 1,
    });
    expect(coverage.medianHeight).toBe(12);
    expect(coverage.zoom).toBe(15);
  });

  it("reports an archive with no buildings at all rather than guessing", () => {
    // A cut that dropped the layer, or a zoom that has none, produces this —
    // and it looks exactly like a bug in the extrusion code until measured.
    const coverage = describeBuildingCoverage(mapWith([]), {
      sourceId: "protomaps",
    });
    expect(coverage.features).toBe(0);
    expect(coverage.medianHeight).toBeNaN();
  });

  it("reports height-less buildings, which is the uniform-slab case", () => {
    const coverage = describeBuildingCoverage(
      mapWith([{ kind: "building" }, { kind: "building" }]),
      { sourceId: "protomaps" },
    );
    expect(coverage.features).toBe(2);
    expect(coverage.withHeight).toBe(0);
    expect(coverage.medianHeight).toBeNaN();
  });

  it("ignores a zero or negative height rather than extruding downwards", () => {
    const coverage = describeBuildingCoverage(
      mapWith([{ kind: "building", height: 0 }, { kind: "building", height: -3 }]),
      { sourceId: "protomaps" },
    );
    expect(coverage.withHeight).toBe(0);
  });
});
