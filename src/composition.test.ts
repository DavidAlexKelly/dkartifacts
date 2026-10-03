/**
 * Do the packages actually compose?
 *
 * WHY THIS TEST LIVES IN THE APP
 * ------------------------------
 * Each package is tested in isolation, and each one passes on its own. None of
 * them can test the thing that actually matters to a consumer: that
 * `extensions={[elevation(), buildings3d()]}` on one map produces a coherent
 * style. A source id claimed twice, a layer reading a source nothing provides,
 * two add-ons both declaring terrain, or relief landing on top of the labels
 * are all cross-package failures, and the app is the only place that legally
 * knows about every package at once.
 *
 * The repository's stated position is that the harness app is the proof the
 * libraries compose. Until now that proof was "it type-checks". This runs it.
 *
 * NO NETWORK
 * ----------
 * The preset DEM store declares `manifestPath: null`, so `createDemSource`
 * reads nothing at startup — it only requires that `configureBasemap` has been
 * called, which is what the stub below does. Everything asserted here is style
 * assembly, which is pure.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  buildings3d,
  configureBasemap,
  landusePatterns,
  mergeExtensionStyle,
  collectStyleContributions,
  attachExtensions,
  type BasemapExtension,
  type ExtensionContext,
  type ExtensionMap,
} from "@acc/decho-basemap";
import { elevation } from "@acc/decho-elevation/extension";
import { countries } from "@acc/decho-countries/extension";
import { tacticGraphics } from "@acc/app6d/extension";
import { APP6D_CATALOG } from "@acc/app6d/symbols";

const ctx: ExtensionContext = {
  maplibregl: { addProtocol: () => undefined, removeProtocol: () => undefined },
  basemapSourceId: "protomaps",
  basemapMaxZoom: 12,
};

/** A Protomaps-flavor-shaped layer list: ground, then buildings, then labels. */
const baseStyle = () => ({
  sources: { protomaps: { type: "vector" } as Record<string, unknown> },
  layers: [
    { id: "background", type: "background" },
    { id: "landcover", type: "fill", source: "protomaps" },
    { id: "water", type: "fill", source: "protomaps" },
    { id: "roads", type: "line", source: "protomaps" },
    { id: "buildings", type: "fill", source: "protomaps" },
    { id: "place-labels", type: "symbol", source: "protomaps" },
    { id: "poi-labels", type: "symbol", source: "protomaps" },
  ] as unknown[],
});

interface Layer {
  id: string;
  type: string;
  source?: string;
}

const asLayers = (layers: unknown[]) => layers as Layer[];

beforeAll(() => {
  // The byte layer refuses to build a DEM source until an application has
  // bound its credentials. Nothing here ever calls it.
  configureBasemap({
    foundryUrl: "https://example.invalid",
    getToken: () => Promise.resolve("not-used"),
    // Only ever dereferenced by a real read, and there is none here. Typed
    // through `unknown` rather than reconstructing a PlatformClient that would
    // be just as fake but longer.
    platformClient: {} as unknown as Parameters<
      typeof configureBasemap
    >[0]["platformClient"],
  });
});

describe("countries with elevation on one map", () => {
  // The built-in world: no dataset, no network.
  const build = async () =>
    mergeExtensionStyle(
      baseStyle(),
      await collectStyleContributions([elevation({ hillshade: true }), countries()], ctx),
    );

  it("merges, with the country outlines under the labels and over the relief", async () => {
    const merged = await build();
    const ids = asLayers(merged.layers).map((l) => l.id);
    const labels = ids.indexOf("place-labels");
    for (const id of ["countries-fill", "countries-border", "countries-selected"]) {
      expect(ids.indexOf(id), id).toBeGreaterThan(-1);
      expect(ids.indexOf(id), id).toBeLessThan(labels);
    }
    expect(ids.indexOf("elevation-hillshade")).toBeLessThan(ids.indexOf("countries-fill"));
    expect(merged.sources["countries-outlines"]).toMatchObject({ type: "geojson" });
  });
});

describe("elevation and buildings on one map", () => {
  const build = async () => {
    const contributions = await collectStyleContributions(
      [
        elevation({ terrain: true, hillshade: true, tint: true, slope: true }),
        buildings3d(),
      ],
      ctx,
    );
    return mergeExtensionStyle(baseStyle(), contributions);
  };

  it("merges without a single collision", async () => {
    // mergeExtensionStyle throws on a duplicate source id, a duplicate layer
    // id, a layer whose source nothing provides, two extensions both claiming
    // terrain, or an anchor this flavor does not have. Reaching the assertions
    // at all is most of the point.
    const merged = await build();
    expect(Object.keys(merged.sources).length).toBeGreaterThan(1);
    expect(merged.layers.length).toBeGreaterThan(baseStyle().layers.length);
  });

  it("gives every layer a source that exists", async () => {
    const merged = await build();
    for (const layer of asLayers(merged.layers)) {
      if (layer.type === "background") {continue;}
      expect(Object.keys(merged.sources)).toContain(layer.source);
    }
  });

  it("uses unique ids throughout", async () => {
    const merged = await build();
    const ids = asLayers(merged.layers).map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("puts all the relief under the labels, in reading order", async () => {
    const merged = await build();
    const ids = asLayers(merged.layers).map((l) => l.id);

    const firstSymbol = ids.indexOf("place-labels");
    for (const id of [
      "elevation-tint",
      "elevation-hillshade",
      "elevation-slope",
      "buildings-3d-extrusion",
    ]) {
      expect(ids).toContain(id);
      expect(ids.indexOf(id)).toBeLessThan(firstSymbol);
    }

    // Tint under hillshade under slope: colour by height, relief over it, then
    // the warning wash on top of both. Then the buildings, which are last
    // because their extension is last in the array.
    expect(ids.indexOf("elevation-tint")).toBeLessThan(
      ids.indexOf("elevation-hillshade"),
    );
    expect(ids.indexOf("elevation-hillshade")).toBeLessThan(
      ids.indexOf("elevation-slope"),
    );
    expect(ids.indexOf("elevation-slope")).toBeLessThan(
      ids.indexOf("buildings-3d-extrusion"),
    );
  });

  it("wires terrain to the elevation DEM, and only once", async () => {
    const merged = await build();
    expect(merged.terrain?.source).toBe("elevation-dem");
    expect(merged.sources["elevation-dem"]).toMatchObject({
      type: "raster-dem",
      encoding: "terrarium",
    });
  });

  it("has the buildings read the BASEMAP's source, not one of its own", async () => {
    // The whole reason buildings3d costs nothing: the height data is already in
    // the tiles the basemap is downloading.
    const merged = await build();
    const extrusion = asLayers(merged.layers).find(
      (l) => l.id === "buildings-3d-extrusion",
    );
    expect(extrusion?.source).toBe("protomaps");
  });

  it("refuses two elevation add-ons that would fight over terrain", async () => {
    // Two DEMs on one map is legitimate — a global one and a theatre one — but
    // only one of them can own terrain, and saying so at setup beats a map
    // where whichever loaded last wins.
    await expect(
      (async () => {
        const contributions = await collectStyleContributions(
          [
            elevation({ id: "global", terrain: true }),
            elevation({ id: "theatre", terrain: true }),
          ],
          ctx,
        );
        return mergeExtensionStyle(baseStyle(), contributions);
      })(),
    ).rejects.toThrow(/terrain/);
  });

  it("lets two elevation add-ons coexist when only one owns terrain", async () => {
    const contributions = await collectStyleContributions(
      [
        elevation({ id: "global", terrain: true, hillshade: true }),
        elevation({ id: "theatre", hillshade: true }),
      ],
      ctx,
    );
    const merged = mergeExtensionStyle(baseStyle(), contributions);

    expect(merged.sources["global-dem"]).toBeDefined();
    expect(merged.sources["theatre-dem"]).toBeDefined();
    expect(merged.terrain?.source).toBe("global-dem");
  });

  it("accepts the tactical graphics add-on in the same array", async () => {
    // THE POINT OF THIS TEST. @acc/app6d does not — and must not
    // — depend on @acc/decho-basemap: it is Foundry-agnostic and is consumed by
    // repositories with no basemap at all. So it satisfies BasemapExtension
    // STRUCTURALLY, declaring `attach(map: maplibregl.Map)`, which TypeScript
    // accepts where `attach(map: ExtensionMap)` is expected because method
    // parameters are checked bivariantly and a real Map satisfies ExtensionMap.
    //
    // That is a compatibility claim between two independently published
    // packages resting on a language rule. If either contract drifts, this stops
    // compiling — which is the whole reason it is written as an assignment.
    const extensions: BasemapExtension[] = [
      elevation({ hillshade: true }),
      buildings3d(),
      tacticGraphics({ catalog: APP6D_CATALOG, orders: [] }),
    ];
    expect(extensions.map((e) => e.id)).toEqual([
      "elevation",
      "buildings-3d",
      "tactic-graphics",
    ]);

    // And it contributes no style at all — it is an SVG overlay, not layers —
    // so it cannot collide with anything the others add.
    const merged = mergeExtensionStyle(
      baseStyle(),
      await collectStyleContributions(extensions, ctx),
    );
    const ids = asLayers(merged.layers).map((l) => l.id);
    expect(ids.some((id) => id.startsWith("tactic"))).toBe(false);
    expect(ids).toContain("elevation-hillshade");
  });

  it("puts the ground textures UNDER the roads and the relief over them", async () => {
    // Three add-ons on the same polygons, and the whole question is order.
    // landusePatterns is the only one of the three that IS the ground rather
    // than a wash over it, so it anchors at "ground" and everything else lands
    // on top: the roads and buildings the flavor drew, and the hillshade, which
    // should shade the textures rather than sit under them.
    //
    // This is the assertion that would have caught the opaque residential
    // plate hiding a town.
    const contributions = await collectStyleContributions(
      [
        elevation({ terrain: true, hillshade: true, tint: true }),
        landusePatterns(),
        buildings3d(),
      ],
      ctx,
    );
    const merged = mergeExtensionStyle(baseStyle(), contributions);
    const ids = asLayers(merged.layers).map((l) => l.id);

    expect(ids).toContain("landuse-patterns-plate");
    expect(ids).toContain("landuse-patterns-fill");

    // Under everything the flavor draws on the ground.
    for (const onTop of ["roads", "buildings", "place-labels"]) {
      expect(ids.indexOf("landuse-patterns-fill")).toBeLessThan(
        ids.indexOf(onTop),
      );
    }
    // Colour, then icons on the colour.
    expect(ids.indexOf("landuse-patterns-plate")).toBeLessThan(
      ids.indexOf("landuse-patterns-fill"),
    );
    // And the relief over both, because hillshade anchors at the labels.
    expect(ids.indexOf("landuse-patterns-fill")).toBeLessThan(
      ids.indexOf("elevation-hillshade"),
    );

    // It brings no source of its own: the polygons are already in the tiles
    // the basemap is fetching.
    for (const id of ["landuse-patterns-plate", "landuse-patterns-fill"]) {
      expect(asLayers(merged.layers).find((l) => l.id === id)?.source).toBe(
        "protomaps",
      );
    }
  });

  it("attaches and tears down both add-ons against one map", async () => {
    // The ExtensionMap surface has to be enough for both: elevation subscribes
    // to view changes for its prefetch, buildings3d rewrites the flavor's flat
    // fill zoom range.
    const calls: string[] = [];
    const map = {
      getZoom: () => 14,
      getBounds: () => ({
        getWest: () => 9,
        getSouth: () => 61,
        getEast: () => 10,
        getNorth: () => 62,
      }),
      on: (type: string) => calls.push(`on:${type}`),
      off: (type: string) => calls.push(`off:${type}`),
      getLayer: (id: string) => ({ id, minzoom: 12, maxzoom: 24 }),
      setLayerZoomRange: () => calls.push("setLayerZoomRange"),
      setLayoutProperty: () => calls.push("setLayoutProperty"),
    } as unknown as ExtensionMap;

    const extensions = [elevation({ hillshade: true }), buildings3d()];
    await collectStyleContributions(extensions, ctx);
    const dispose = await attachExtensions(map, ctx, extensions);

    expect(calls).toContain("on:moveend");
    expect(calls).toContain("setLayoutProperty");
    expect(calls).toContain("setLayerZoomRange");

    dispose();
    expect(calls).toContain("off:moveend");
  });
});
