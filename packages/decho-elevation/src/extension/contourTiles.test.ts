/**
 * contourTiles is mostly bookkeeping — which cells the view wants, which
 * sources and layers that implies, and taking them away again — so that is
 * what these test, against a stub map. The one thing they cannot cover is
 * createTileSource itself, which needs a Foundry dataset; a cell whose archive
 * fails to open is covered by the path that warns and carries on.
 */
import { describe, expect, it, vi } from "vitest";

import type { ExtensionContext, ExtensionMap } from "@acc/decho-basemap";

import {
  contourTiles,
  contourWindows,
  labelFeatures,
  ladderWindows,
  smallestGap,
  snapIndexInterval,
  widthByZoom,
} from "./contourTiles";
import { CONTOUR_LADDER } from "../core/renderers";
import { cellKey } from "../core/grid";
import type { ContourStore } from "../core/defaults";

const store: ContourStore = {
  datasetRid: "ri.foundry.main.dataset.test",
  grid: { originLon: -180, originLat: 85, cellDeg: 2 },
  pathTemplate: "{cell}.pmtiles",
  archiveZoom: 10,
  sourceLayer: "contours",
};

type LayerSpec = Record<string, unknown> & { id: string };
type Listener = (ev: unknown) => void;

interface StubMap {
  map: ExtensionMap;
  sources: Map<string, unknown>;
  layers: LayerSpec[];
  listeners: Map<string, Listener[]>;
  view: { zoom: number; west: number; south: number; east: number; north: number };
}

/** A map that records what was added, and can be moved. */
const stubMap = (
  view: StubMap["view"] = { zoom: 12, west: 8.1, south: 60.1, east: 8.4, north: 60.4 },
): StubMap => {
  const sources = new Map<string, unknown>();
  const layers: LayerSpec[] = [];
  const listeners = new Map<string, Listener[]>();

  const map = {
    getZoom: () => view.zoom,
    getBounds: () => ({
      getWest: () => view.west,
      getSouth: () => view.south,
      getEast: () => view.east,
      getNorth: () => view.north,
    }),
    getStyle: () => ({
      layers: [
        { id: "earth", type: "fill" },
        { id: "roads", type: "line" },
        { id: "place-labels", type: "symbol" },
      ],
    }),
    on: (type: string, listener: Listener) => {
      const existing = listeners.get(type) ?? [];
      existing.push(listener);
      listeners.set(type, existing);
    },
    off: (type: string, listener: Listener) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((l) => l !== listener),
      );
    },
    getLayer: (id: string) => layers.find((l) => l.id === id),
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, source: unknown) => sources.set(id, source),
    removeSource: (id: string) => sources.delete(id),
    addLayer: (layer: LayerSpec, before?: string) => {
      const at = before ? layers.findIndex((l) => l.id === before) : -1;
      if (at === -1) {
        layers.push({ ...layer, before });
      } else {
        layers.splice(at, 0, { ...layer, before });
      }
    },
    removeLayer: (id: string) => {
      const at = layers.findIndex((l) => l.id === id);
      if (at !== -1) {layers.splice(at, 1);}
    },
    setPaintProperty: () => undefined,
    setLayoutProperty: (id: string, name: string, value: unknown) => {
      const layer = layers.find((l) => l.id === id);
      if (!layer) {return;}
      const layout = (layer.layout ?? {}) as Record<string, unknown>;
      layer.layout = { ...layout, [name]: value };
    },
    setLayerZoomRange: () => undefined,
    setTerrain: () => undefined,
  };

  return {
    map: map as unknown as ExtensionMap,
    sources,
    layers,
    listeners,
    view,
  };
};

const ctx = {
  basemapSourceId: "protomaps",
  basemapMaxZoom: 12,
  maplibregl: { addProtocol: () => undefined, removeProtocol: () => undefined },
} as unknown as ExtensionContext;

describe("the interval ladder as zoom windows", () => {
  it("gives each rung the zoom window between it and the next", () => {
    // 10 m from z14 up, 25 m from z12 to z14, 100 m from the floor to z12.
    // Windows rather than ["zoom"] inside a filter: layer zoom ranges are the
    // portable way to say this.
    expect(ladderWindows(CONTOUR_LADDER, 10)).toEqual([
      { interval: 10, minzoom: 14 },
      { interval: 25, minzoom: 12, maxzoom: 14 },
      { interval: 100, minzoom: 10, maxzoom: 12 },
    ]);
  });

  it("never opens a window below the floor", () => {
    // The archives hold nothing below their own zoom, so a rung that starts at
    // z0 must not ask for tiles at z0.
    for (const window of ladderWindows(CONTOUR_LADDER, 11)) {
      expect(window.minzoom).toBeGreaterThanOrEqual(11);
    }
  });

  it("leaves the finest rung without a ceiling", () => {
    const [finest] = ladderWindows(CONTOUR_LADDER, 10);
    expect(finest.maxzoom).toBeUndefined();
  });
});

describe("thinning, and why it is off by default", () => {
  it("draws every line at every zoom when the interval is unknown", () => {
    // THE BUG THIS FIXES. The ladder is absolute metres — 100, 25, 10 — which
    // selects nothing unless the archives were traced at an interval dividing
    // those numbers. At 40 m the z12-14 rung asks for multiples of 25, matches
    // almost nothing, and the contours DISAPPEAR for two zoom levels before
    // coming back above z14 where the rung asks for multiples of 10 again.
    const windows = contourWindows(10);
    expect(windows).toEqual([{ interval: null, minzoom: 10 }]);
  });

  it("thins on request, in absolute metres", () => {
    const windows = contourWindows(10, CONTOUR_LADDER);
    expect(windows.map((w) => w.interval)).toEqual([10, 25, 100]);
  });

  it("snaps every rung to a line the data actually has", () => {
    // 40 m data: a 25 m rung would match nothing, so it becomes 40. A 100 m
    // rung becomes 120 — the nearest multiple at or above it.
    const windows = contourWindows(10, CONTOUR_LADDER, 40);
    expect(windows.map((w) => w.interval)).toEqual([40, 40, 120]);

    for (const window of windows) {
      expect((window.interval ?? 0) % 40).toBe(0);
    }
  });

  it("leaves a rung alone when the data already divides it", () => {
    // 20 m data divides all three rungs, so the ladder is used as written.
    expect(contourWindows(10, CONTOUR_LADDER, 20).map((w) => w.interval)).toEqual(
      [20, 40, 100],
    );
  });

  it("puts index contours on lines that exist", () => {
    // Every 100 m is the convention, and against 40 m data no line is a
    // multiple of 100 except every fifth — so the convention is rounded up to
    // one the data can satisfy.
    expect(snapIndexInterval(100, 40)).toBe(120);
    expect(snapIndexInterval(100, 50)).toBe(100);
    expect(snapIndexInterval(100, 20)).toBe(100);
    // Unknown spacing: take the convention at face value.
    expect(snapIndexInterval(100, undefined)).toBe(100);
  });
});

describe("the label feature collection", () => {
  const line = { type: "LineString", coordinates: [[0, 0], [1, 1]] };

  it("carries the height under one name, whichever the tiles used", () => {
    // The label layer's expression is the same whether it reads the vector
    // tiles or this collection, so the property is normalised on the way in.
    const collection = labelFeatures(
      [
        { geometry: line, properties: { ELEV: 1300, id: 7, other: "junk" } },
        { geometry: line, properties: { elev: "1400" } },
      ],
      10,
      ["ELEV", "elevation", "elev"],
      "elev",
    );

    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toEqual([
      { type: "Feature", geometry: line, properties: { elev: 1300 } },
      { type: "Feature", geometry: line, properties: { elev: 1400 } },
    ]);
  });

  it("drops what it cannot label or draw", () => {
    const collection = labelFeatures(
      [
        { geometry: line, properties: {} },
        { properties: { elev: 100 } },
        { geometry: line, properties: { elev: "not a height" } },
      ],
      10,
      ["elev"],
      "elev",
    );
    expect(collection.features).toEqual([]);
  });

  it("stops at the cap", () => {
    // A wide view of dense terrain holds tens of thousands of contour pieces
    // and the placement labels a handful.
    const many = Array.from({ length: 50 }, () => ({
      geometry: line,
      properties: { elev: 100 },
    }));
    expect(labelFeatures(many, 5, ["elev"], "elev").features).toHaveLength(5);
  });
});

describe("measuring the archives' own interval", () => {
  const featuresAt = (heights: number[]) =>
    heights.map((elev) => ({ properties: { elev } }));

  it("finds the smallest gap between contour heights", () => {
    expect(smallestGap(featuresAt([1300, 1350, 1400, 1450]), "elev")).toBe(50);
    expect(smallestGap(featuresAt([200, 240, 280, 400]), "elev")).toBe(40);
  });

  it("rounds, because gdal_contour writes doubles", () => {
    // The gap between 1300.0000000000002 and 1350 is not 50 to a computer.
    expect(
      smallestGap(featuresAt([1300.0000000000002, 1350, 1400]), "elev"),
    ).toBe(50);
  });

  it("reads a height that arrived as a string", () => {
    const features = [
      { properties: { elev: "100" } },
      { properties: { elev: "120" } },
    ];
    expect(smallestGap(features, "elev")).toBe(20);
  });

  it("says nothing when there is nothing to measure", () => {
    expect(smallestGap([], "elev")).toBeNull();
    expect(smallestGap(featuresAt([500]), "elev")).toBeNull();
    expect(smallestGap(featuresAt([500, 500, 500]), "elev")).toBeNull();
  });
});

describe("line weight", () => {
  const isIndex = ["==", ["%", ["get", "elev"], 100], 0];

  it("puts the zoom OUTSIDE the index test, which MapLibre requires", () => {
    // The rule that makes this function exist: ["zoom"] is only legal as the
    // outermost expression of a paint property. A case that picks between two
    // interpolates is the natural way to write it and throws at style
    // validation, so the nesting is inverted — interpolate outside, case in
    // each stop value.
    const width = widthByZoom(
      isIndex,
      [
        [10, 0.3],
        [14, 1],
      ],
      [
        [10, 0.7],
        [14, 1.6],
      ],
    );

    expect(width[0]).toBe("interpolate");
    expect(width[2]).toEqual(["zoom"]);
    expect(width).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      ["case", isIndex, 0.7, 0.3],
      14,
      ["case", isIndex, 1.6, 1],
    ]);
  });

  it("holds the nearest weight at a zoom only the other ramp declares", () => {
    const width = widthByZoom(isIndex, [[10, 0.3]], [
      [10, 0.7],
      [14, 1.6],
    ]);
    // z14 exists in the index ramp only; the ordinary one holds its z10 value
    // rather than collapsing to zero and vanishing.
    expect(width).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      ["case", isIndex, 0.7, 0.3],
      14,
      ["case", isIndex, 1.6, 0.3],
    ]);
  });

  it("makes index contours heavier at every zoom", () => {
    const width = widthByZoom(isIndex, [
      [10, 0.3],
      [12, 0.6],
      [14, 1],
    ], [
      [10, 0.7],
      [12, 1.1],
      [14, 1.6],
    ]);

    // Every stop value is [case, test, index, ordinary].
    for (let i = 3; i < width.length; i += 2) {
      const [, , indexWidth, ordinaryWidth] = width[i + 1] as [
        string,
        unknown,
        number,
        number,
      ];
      expect(indexWidth).toBeGreaterThan(ordinaryWidth);
    }
  });
});

describe("contourTiles", () => {
  it("declares no sources up front, because every one is view-dependent", async () => {
    const extension = contourTiles({ store });
    expect(await extension.style?.(ctx)).toEqual({});
  });

  it("attaches one source per visible cell, not one for the map", async () => {
    // THE POINT OF THE DESIGN. The archives are clipped to their cell with no
    // halo, so a tile straddling a boundary is only complete if both cells are
    // attached separately.
    // The byte layer probes for range support against a dataset that does not
    // exist here and says so. Real behaviour, noise in this test.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { map, sources } = stubMap({
      zoom: 12,
      // A view straddling the 8°E / 60°N cell corner: four cells.
      west: 7.5,
      south: 59.5,
      east: 8.5,
      north: 60.5,
    });
    const extension = contourTiles({ store });
    extension.attach?.(map, ctx);
    await vi.waitFor(() => expect(sources.size).toBeGreaterThan(1));

    // createTileSource is not stubbed, so the cells that fail to open are
    // dropped; what matters here is that a cell is attempted per cell, keyed
    // by cell rather than one source for everything.
    for (const id of sources.keys()) {
      if (id === "contour-tiles-labels") {continue;}
      expect(id).toMatch(/^contour-tiles-c\d{3}_r\d{3}$/);
    }
    warn.mockRestore();
  });

  it("names the archive after the cell", () => {
    // c000_r006 is cellKey's own format, and the dataset's file names.
    expect(store.pathTemplate.replace("{cell}", cellKey(89, 16))).toBe(
      "c089_r016.pmtiles",
    );
  });

  it("asks for nothing below the floor, where the archives have no tiles", async () => {
    const { map, sources } = stubMap({
      zoom: 6,
      west: -20,
      south: 40,
      east: 40,
      north: 70,
    });
    const extension = contourTiles({ store });
    extension.attach?.(map, ctx);
    await Promise.resolve();

    // The label source is always there; no CELL sources are.
    expect(
      [...sources.keys()].filter((id) => id !== "contour-tiles-labels"),
    ).toEqual([]);
    expect(extension.attachedCells).toEqual([]);
  });

  it("keeps a cell attached after the view leaves it", async () => {
    // THE CHURN THIS FIXES. Dropping a cell the moment it goes off screen
    // saves nothing — an attached cell asks for no tiles outside its bounds
    // and draws nothing off screen — while re-attaching costs a PMTiles header
    // read, a protocol registration and a re-parse of every tile. The symptom
    // was contours blinking out and returning a beat later when panning back.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const view = { zoom: 12, west: 8.1, south: 60.1, east: 8.4, north: 60.4 };
    const { map, listeners } = stubMap(view);
    const extension = contourTiles({ store, ring: 0 });
    extension.attach?.(map, ctx);
    await vi.waitFor(() => expect(extension.attachedCells.length).toBe(1));
    const [first] = extension.attachedCells;

    // Pan two cells east, well clear of the original.
    view.west = 12.1;
    view.east = 12.4;
    for (const listener of listeners.get("moveend") ?? []) {listener({});}
    await vi.waitFor(() => expect(extension.attachedCells.length).toBe(2));

    expect(extension.attachedCells).toContain(first);
    warn.mockRestore();
  });

  it("evicts the least recently wanted once over budget", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const view = { zoom: 12, west: 8.1, south: 60.1, east: 8.4, north: 60.4 };
    const { map, listeners } = stubMap(view);
    const extension = contourTiles({ store, ring: 0, maxCells: 2 });
    extension.attach?.(map, ctx);
    await vi.waitFor(() => expect(extension.attachedCells.length).toBe(1));
    const [oldest] = extension.attachedCells;

    // Two more cells, each further east: the budget of two forces the first
    // one out and no other.
    for (const west of [12.1, 16.1]) {
      view.west = west;
      view.east = west + 0.3;
      for (const listener of listeners.get("moveend") ?? []) {listener({});}
      await vi.waitFor(() =>
        expect(extension.attachedCells).not.toContain(undefined),
      );
    }

    await vi.waitFor(() => expect(extension.attachedCells.length).toBe(2));
    expect(extension.attachedCells).not.toContain(oldest);
    warn.mockRestore();
  });

  it("lets go of everything below the floor", async () => {
    // Nothing can be drawn there, so there is no reason to hold the cells.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const view = { zoom: 12, west: 8.1, south: 60.1, east: 8.4, north: 60.4 };
    const { map, listeners } = stubMap(view);
    const extension = contourTiles({ store });
    extension.attach?.(map, ctx);
    await vi.waitFor(() => expect(extension.attachedCells.length).toBeGreaterThan(0));

    view.zoom = 6;
    for (const listener of listeners.get("zoomend") ?? []) {listener({});}
    expect(extension.attachedCells).toEqual([]);
    warn.mockRestore();
  });

  it("caps the cells it will attach at once", async () => {
    // A wide view at z10 covers dozens of 2° cells, and each one is a source,
    // a protocol and four layers.
    const { map } = stubMap({
      zoom: 10,
      west: -30,
      south: 30,
      east: 40,
      north: 70,
    });
    const extension = contourTiles({ store, maxCells: 4 });
    extension.attach?.(map, ctx);
    await Promise.resolve();

    expect(extension.attachedCells.length).toBeLessThanOrEqual(4);
  });

  it("drops every cell, source and listener on teardown", async () => {
    const { map, sources, layers, listeners } = stubMap();
    const extension = contourTiles({ store });
    const dispose = extension.attach?.(map, ctx) as () => void;
    await Promise.resolve();

    dispose();

    expect(sources.size).toBe(0);
    expect(layers).toEqual([]);
    expect(extension.attachedCells).toEqual([]);
    for (const [, registered] of listeners) {
      expect(registered).toEqual([]);
    }
  });

  it("labels index contours with a plain number, not a formatted one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { map, layers } = stubMap();
    const extension = contourTiles({ store });
    extension.attach?.(map, ctx);
    await vi.waitFor(() => expect(layers.length).toBeGreaterThan(0));

    const label = layers.find((l) => l.id === "contour-tiles-label");
    const layout = label?.layout as Record<string, unknown>;
    const text = JSON.stringify(layout["text-field"]);

    // number-format is locale-aware and renders 1300 as "1,300" in most
    // locales, which is not how a height is written on a map. round because
    // gdal_contour writes doubles.
    expect(text).toContain("to-string");
    expect(text).toContain("round");
    expect(text).not.toContain("number-format");
    expect(text).toContain(" m");

    // Along the line, and DRAPED on the ground rather than billboarded.
    // "viewport" here is what made the labels disappear the moment terrain
    // loaded: MapLibre places a symbol at the ground elevation of its anchor
    // and depth-tests it against the terrain mesh, so a billboard standing on
    // that surface intersects it and is culled as hidden behind it.
    expect(layout["symbol-placement"]).toBe("line");
    expect(layout["text-rotation-alignment"]).toBe("map");
    expect(layout["text-pitch-alignment"]).toBe("map");

    // Generous, because terrain bends the projected contour further than the
    // flat map does and the angle is measured on the projection.
    expect(layout["text-max-angle"]).toBe(45);

    // Index contours only — every 100 m by convention, whatever the archives
    // were traced at.
    expect(JSON.stringify(label?.filter)).toContain("100");

    // text-optional means nothing without an icon-image, and can let the
    // placement drop a symbol that has nothing else to show.
    expect(layout["text-optional"]).toBeUndefined();
    warn.mockRestore();
  });

  it("takes an overlap escape hatch for a crowded pitched view", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { map, layers } = stubMap();
    const extension = contourTiles({
      store,
      labelAllowOverlap: true,
      labelPitchAlignment: "viewport",
    });
    extension.attach?.(map, ctx);
    await vi.waitFor(() => expect(layers.length).toBeGreaterThan(0));

    const layout = layers.find((l) => l.id === "contour-tiles-label")
      ?.layout as Record<string, unknown>;
    expect(layout["text-allow-overlap"]).toBe(true);
    expect(layout["text-pitch-alignment"]).toBe("viewport");
    warn.mockRestore();
  });

  it("puts the labels on a GeoJSON source, not on the overzoomed tiles", async () => {
    // THE REASON THIS SOURCE EXISTS. With terrain, MapLibre raises a symbol to
    // the ground by calling getDEMElevation with the SYMBOL'S OWN tile id and
    // walking up to the nearest ancestor with DEM data — and returns 0 when
    // there is none. A label on a z10 contour tile at a z14 view has no z10
    // ancestor loaded, so it is placed at sea level and buried inside any
    // raised ground: heights over flat land, nothing over the hills. GeoJSON
    // is tiled at the display zoom, so the lookup finds the z12 DEM tile.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { map, sources, layers } = stubMap();
    const extension = contourTiles({ store, labelSpacing: 400 });
    extension.attach?.(map, ctx);

    const label = layers.find((l) => l.id === "contour-tiles-label");
    expect(label?.source).toBe("contour-tiles-labels");
    expect((sources.get("contour-tiles-labels") as { type: string }).type).toBe(
      "geojson",
    );
    // And with no source-layer, because a GeoJSON source has none.
    expect(label?.["source-layer"]).toBeUndefined();

    // Spacing is a plain number again: a tile pixel is a screen pixel when the
    // source is tiled at the display zoom. On the overzoomed vector tiles this
    // had to be scaled per zoom, or 400 meant 6400 pixels at z14.
    expect((label?.layout as Record<string, unknown>)["symbol-spacing"]).toBe(
      400,
    );
    warn.mockRestore();
  });

  it("keeps the lines under the labels however cells come and go", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { map, layers } = stubMap();
    const extension = contourTiles({ store });
    extension.attach?.(map, ctx);
    await vi.waitFor(() =>
      expect(layers.some((l) => l.id !== "contour-tiles-label")).toBe(true),
    );

    const labelAt = layers.findIndex((l) => l.id === "contour-tiles-label");
    for (const [i, layer] of layers.entries()) {
      if (layer.id === "contour-tiles-label") {continue;}
      expect(i).toBeLessThan(labelAt);
    }
    warn.mockRestore();
  });

  it("draws index contours darker and more opaque, not just heavier", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { map, layers } = stubMap();
    const extension = contourTiles({ store });
    extension.attach?.(map, ctx);
    // A line layer, not just the label layer that attach adds immediately.
    await vi.waitFor(() =>
      expect(layers.some((l) => l.id !== "contour-tiles-label")).toBe(true),
    );

    const line = layers.find((l) => l.id !== "contour-tiles-label");
    const paint = line?.paint as Record<string, unknown>;

    // All three data-driven off one shared test, so a line cannot be an index
    // contour by colour and an ordinary one by width.
    for (const property of ["line-color", "line-opacity"]) {
      expect(Array.isArray(paint[property])).toBe(true);
      expect((paint[property] as unknown[])[0]).toBe("case");
    }
    expect((paint["line-width"] as unknown[])[0]).toBe("interpolate");
    warn.mockRestore();
  });

  it("does not remount the map to toggle", async () => {
    const { map } = stubMap();
    const extension = contourTiles({ store, visible: false });
    extension.attach?.(map, ctx);

    expect(extension.visible).toBe(false);
    extension.setVisible(true);
    expect(extension.visible).toBe(true);
  });
});
