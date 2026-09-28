import { describe, expect, it } from "vitest";

import { describeOverlayLayers, describeSourceLayer } from "./census";
import type { QueryableMap } from "./buildings";
import { mergeExtensionStyle, type ExtensionContext, type ExtensionMap } from "./extensions";
import { chokePoints, going, wetGaps, type OverlayExtension } from "./overlays";

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
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
}

const layersOf = async (extension: OverlayExtension): Promise<LayerSpec[]> =>
  (((await extension.style?.(ctx)) ?? {}).layers ?? []) as LayerSpec[];

// ── census ──────────────────────────────────────────────────────────────────

const censusMap = (
  features: Array<Record<string, unknown>>,
  zoom = 12,
): QueryableMap => ({
  getZoom: () => zoom,
  querySourceFeatures: () => features.map((properties) => ({ properties })),
});

describe("describeSourceLayer", () => {
  it("counts kinds and kind_detail, most common first", () => {
    const census = describeSourceLayer(
      censusMap([
        { kind: "water", kind_detail: "river" },
        { kind: "water", kind_detail: "river" },
        { kind: "water", kind_detail: "ditch" },
        { kind: "lake" },
      ]),
      { sourceId: "protomaps", sourceLayer: "water" },
    );

    expect(census.features).toBe(4);
    expect(Object.keys(census.kinds)).toEqual(["water", "lake"]);
    expect(census.kinds.water).toBe(3);
    expect(Object.keys(census.kindDetails)).toEqual(["river", "ditch"]);
  });

  it("reports the property names present, so a style can be written to them", () => {
    // `is_bridge` missing from this list means the choke-point overlay has
    // nothing to filter on, and that is worth knowing before styling it.
    const census = describeSourceLayer(
      censusMap([{ kind: "major_road", is_bridge: true, ref: "E6" }]),
      { sourceId: "protomaps", sourceLayer: "roads" },
    );
    expect(census.properties).toEqual(["is_bridge", "kind", "ref"]);
  });

  it("reports an empty layer plainly", () => {
    // The landcover case: z0-z7 only, so an archive cut at z12 has none, and
    // an overlay built on it renders nothing while looking broken.
    const census = describeSourceLayer(censusMap([]), {
      sourceId: "protomaps",
      sourceLayer: "landcover",
    });
    expect(census.features).toBe(0);
    expect(census.kinds).toEqual({});
    expect(census.properties).toEqual([]);
  });

  it("counts every feature but only inspects up to the limit", () => {
    const many = Array.from({ length: 50 }, () => ({ kind: "forest" }));
    const census = describeSourceLayer(censusMap(many), {
      sourceId: "protomaps",
      sourceLayer: "landuse",
      limit: 10,
    });
    expect(census.features).toBe(50);
    expect(census.kinds.forest).toBe(10);
  });

  it("censuses every layer an overlay might use, in one call", () => {
    const all = describeOverlayLayers(
      censusMap([{ kind: "forest" }]),
      "protomaps",
    );
    expect(Object.keys(all)).toEqual([
      "water",
      "roads",
      "landuse",
      "landcover",
      "buildings",
    ]);
    expect(all.landuse.kinds.forest).toBe(1);
  });
});

// ── the overlays ────────────────────────────────────────────────────────────

describe("the overlays read the basemap's own tiles", () => {
  it("add no sources at all", async () => {
    // The whole reason they are free: every property is already in the tiles
    // the basemap is fetching.
    for (const extension of [wetGaps(), chokePoints(), going()]) {
      const contribution = (await extension.style?.(ctx)) ?? {};
      expect(contribution.sources).toBeUndefined();
      for (const layer of (contribution.layers ?? []) as LayerSpec[]) {
        expect(layer.source).toBe("protomaps");
      }
    }
  });

  it("go under the labels", async () => {
    for (const extension of [wetGaps(), chokePoints(), going()]) {
      expect(((await extension.style?.(ctx)) ?? {}).before).toBe("labels");
    }
  });

  it("compose with each other without an id collision", async () => {
    const base = {
      sources: { protomaps: { type: "vector" } },
      layers: [
        { id: "landcover", type: "fill", source: "protomaps" },
        { id: "place-labels", type: "symbol", source: "protomaps" },
      ] as unknown[],
    };
    const extensions = [going(), wetGaps(), chokePoints()];
    const contributions = [];
    for (const extension of extensions) {
      contributions.push({
        id: extension.id,
        contribution: (await extension.style?.(ctx)) ?? {},
      });
    }

    const merged = mergeExtensionStyle(base, contributions);
    const ids = (merged.layers as LayerSpec[]).map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Reading order: going under the water under the choke points, and all of
    // them under the labels.
    expect(ids.indexOf("going-fill")).toBeLessThan(ids.indexOf("wet-gaps-major"));
    expect(ids.indexOf("wet-gaps-major")).toBeLessThan(
      ids.indexOf("choke-points-bridge"),
    );
    expect(ids.indexOf("choke-points-bridge")).toBeLessThan(
      ids.indexOf("place-labels"),
    );
  });
});

describe("wetGaps", () => {
  it("separates a river from a ditch, because they are different problems", async () => {
    const layers = await layersOf(wetGaps());
    const major = layers.find((l) => l.id === "wet-gaps-major");
    const minor = layers.find((l) => l.id === "wet-gaps-minor");

    expect(major?.filter).toEqual([
      "all",
      ["match", ["get", "kind_detail"], ["river", "riverbank", "canal"], true, false],
      ["!", ["==", ["get", "intermittent"], true]],
    ]);
    expect(minor?.filter).toEqual([
      "match",
      ["get", "kind_detail"],
      ["ditch", "drain", "stream"],
      true,
      false,
    ]);
  });

  it("draws intermittent water dashed, and excludes it from the solid layer", async () => {
    // A wadi is an obstacle in spring and nothing in August. Drawn solid it
    // would claim a gap that is not there half the year.
    const layers = await layersOf(wetGaps());
    const dashed = layers.find((l) => l.id === "wet-gaps-intermittent");
    expect(dashed?.paint?.["line-dasharray"]).toEqual([3, 2]);
    expect(JSON.stringify(dashed?.filter)).toContain("intermittent");
  });
});

describe("chokePoints", () => {
  it("filters on is_bridge and is_tunnel", async () => {
    const layers = await layersOf(chokePoints());
    expect(layers.map((l) => l.id)).toEqual([
      "choke-points-bridge-casing",
      "choke-points-bridge",
      "choke-points-tunnel",
    ]);
    expect(layers[1].filter).toEqual(["==", ["get", "is_bridge"], true]);
    expect(layers[2].filter).toEqual(["==", ["get", "is_tunnel"], true]);
  });

  it("draws the casing wider than the line, so a bridge reads over its road", async () => {
    const layers = await layersOf(chokePoints({ width: 6 }));
    expect(layers[0].paint?.["line-width"]).toBe(9);
    expect(layers[1].paint?.["line-width"]).toBe(6);
  });
});

describe("going", () => {
  it("is one layer with a match expression, not a layer per kind", async () => {
    // Sixteen layers over one source-layer would be sixteen draw passes for a
    // single fill.
    const layers = await layersOf(going());
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe("fill");
    expect(layers[0]["source-layer"]).toBe("landuse");
  });

  it("colours wetland and glacier, which the router does not treat as impassable", async () => {
    // Drawing them is what makes the gap between the map and the router
    // visible: Pathfinding's meta.json lists neither.
    const [layer] = await layersOf(going());
    const expression = JSON.stringify(layer.paint?.["fill-color"]);
    expect(expression).toContain("wetland");
    expect(expression).toContain("glacier");
  });

  it("reads landuse rather than landcover, which stops at z7", async () => {
    const [landuse] = await layersOf(going());
    expect(landuse["source-layer"]).toBe("landuse");
    const [override] = await layersOf(going({ sourceLayer: "landcover" }));
    expect(override["source-layer"]).toBe("landcover");
  });

  it("takes colour overrides", async () => {
    const [layer] = await layersOf(going({ colours: { forest: "#000000" } }));
    expect(JSON.stringify(layer.paint?.["fill-color"])).toContain("#000000");
  });
});

describe("overlay visibility", () => {
  function stubMap() {
    const layout: Array<[string, string, unknown]> = [];
    const map = {
      getLayer: (id: string) => ({ id }),
      setLayoutProperty: (id: string, name: string, value: unknown) =>
        layout.push([id, name, value]),
    } as unknown as ExtensionMap;
    return { map, layout };
  }

  it("contributes hidden layers when it starts invisible", async () => {
    const layers = await layersOf(wetGaps({ visible: false }));
    for (const layer of layers) {
      expect(layer.layout?.visibility).toBe("none");
    }
  });

  it("flips every one of its layers on a live map", async () => {
    const extension = chokePoints({ visible: false });
    await extension.style?.(ctx);
    const { map, layout } = stubMap();
    extension.attach?.(map, ctx);

    layout.length = 0;
    extension.setVisible(true);

    expect(extension.visible).toBe(true);
    expect(layout).toEqual([
      ["choke-points-bridge-casing", "visibility", "visible"],
      ["choke-points-bridge", "visibility", "visible"],
      ["choke-points-tunnel", "visibility", "visible"],
    ]);
  });

  it("remembers a toggle made before the map exists", async () => {
    const extension = going();
    extension.setVisible(false);
    const layers = await layersOf(extension);
    expect(layers[0].layout?.visibility).toBe("none");
  });

  it("does nothing when set to the value it already has", async () => {
    const extension = going({ visible: true });
    await extension.style?.(ctx);
    const { map, layout } = stubMap();
    extension.attach?.(map, ctx);
    layout.length = 0;
    extension.setVisible(true);
    expect(layout).toEqual([]);
  });

  it("stops touching a map it has been detached from", async () => {
    const extension = going({ visible: true });
    await extension.style?.(ctx);
    const { map, layout } = stubMap();
    const dispose = extension.attach?.(map, ctx) as () => void;
    dispose();
    layout.length = 0;
    extension.setVisible(false);
    expect(layout).toEqual([]);
  });

  it("applies a minZoom to every layer", async () => {
    const layers = await layersOf(wetGaps({ minZoom: 9 }));
    for (const layer of layers) {
      expect(layer.minzoom).toBe(9);
    }
  });
});
