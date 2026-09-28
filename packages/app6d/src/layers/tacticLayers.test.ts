import { describe, expect, it } from "vitest";

import { APP6D_CATALOG } from "../symbols";
import { TACTIC_TASK_CATALOG } from "../core/tacticTaskCatalog";
import { resolveTacticSidc } from "../core/tacticOrders";
import type { PlacedOrder } from "../maplibre/types";
import { createTacticLayers, type LayerHostMap } from "./tacticLayers";

const drawable = TACTIC_TASK_CATALOG.map((task) => ({
  task,
  sidc: resolveTacticSidc(APP6D_CATALOG, task.name),
})).find((entry) => entry.sidc);

const order = (id = "o1"): PlacedOrder => ({
  id,
  from: [9, 61],
  to: [9.1, 61.05],
  colour: "#c43c30",
  tacticSidc: drawable?.sidc,
});

/** A map that records what was asked of it. */
function stubMap() {
  const sources = new Map<string, { data?: unknown; setData: (d: unknown) => void }>();
  const layers = new Map<string, Record<string, unknown>>();
  const removed: string[] = [];

  const map = {
    addSource: (id: string, source: Record<string, unknown>) => {
      const entry = {
        data: source.data,
        setData: (d: unknown) => {
          entry.data = d;
        },
      };
      sources.set(id, entry);
    },
    removeSource: (id: string) => {
      sources.delete(id);
      removed.push(id);
    },
    getSource: (id: string) => sources.get(id),
    addLayer: (layer: Record<string, unknown>) =>
      layers.set(layer.id as string, layer),
    removeLayer: (id: string) => {
      layers.delete(id);
      removed.push(id);
    },
    getLayer: (id: string) => layers.get(id),
    // A zoom-dependent projection, as a real one is.
    project: ([lng, lat]: [number, number]) => ({
      x: lng * 100000,
      y: -lat * 100000,
    }),
    unproject: ([x, y]: [number, number]) => ({
      lng: x / 100000,
      lat: -y / 100000,
    }),
    getZoom: () => 11,
  } as unknown as LayerHostMap;

  return { map, sources, layers, removed };
}

describe("createTacticLayers", () => {
  it("adds one source and the line/fill layers", () => {
    // One source and a few layers styled by expression, not a layer per order:
    // a hundred orders should not be three hundred layers.
    const { map, sources, layers } = stubMap();
    const handle = createTacticLayers(APP6D_CATALOG, map);

    expect([...sources.keys()]).toEqual(["tactic-source"]);
    expect([...layers.keys()]).toEqual([
      "tactic-fill",
      "tactic-line",
      "tactic-line-dashed",
    ]);
    expect(handle.sourceId).toBe("tactic-source");
  });

  it("separates dashed from solid, because line-dasharray cannot be data-driven", () => {
    const { map, layers } = stubMap();
    createTacticLayers(APP6D_CATALOG, map);

    expect(layers.get("tactic-line")?.filter).toEqual([
      "all",
      ["==", ["get", "kind"], "stroke"],
      ["!=", ["get", "dashed"], true],
    ]);
    expect(layers.get("tactic-line-dashed")?.filter).toEqual([
      "all",
      ["==", ["get", "kind"], "stroke"],
      ["==", ["get", "dashed"], true],
    ]);
  });

  it("takes each symbol's own colour from the feature", () => {
    const { map, layers } = stubMap();
    createTacticLayers(APP6D_CATALOG, map, { defaultColour: "#000" });
    expect((layers.get("tactic-line")?.paint as Record<string, unknown>)[
      "line-color"
    ]).toEqual(["coalesce", ["get", "colour"], "#000"]);
  });

  it("omits the text layer unless a glyph stack is supplied", () => {
    // Which fonts exist is the host's business: @acc/decho-basemap serves Noto
    // from a Foundry dataset, another host may serve none, and a text layer
    // naming a missing stack renders nothing at all.
    const bare = stubMap();
    createTacticLayers(APP6D_CATALOG, bare.map);
    expect(bare.layers.has("tactic-text")).toBe(false);

    const labelled = stubMap();
    createTacticLayers(APP6D_CATALOG, labelled.map, {
      textFont: ["Noto Sans Regular"],
    });
    expect(labelled.layers.has("tactic-text")).toBe(true);
  });

  it("puts real geometry into the source on update", () => {
    const { map, sources } = stubMap();
    const handle = createTacticLayers(APP6D_CATALOG, map);
    handle.update([order()]);

    const data = sources.get("tactic-source")?.data as {
      type: string;
      features: { properties: Record<string, unknown> }[];
    };
    expect(data.type).toBe("FeatureCollection");
    expect(data.features.length).toBeGreaterThan(0);
    expect(data.features[0].properties.orderId).toBe("o1");
  });

  it("clears the source when the orders go", () => {
    const { map, sources } = stubMap();
    const handle = createTacticLayers(APP6D_CATALOG, map);
    handle.update([order()]);
    handle.update([]);
    expect(
      (sources.get("tactic-source")?.data as { features: unknown[] }).features,
    ).toEqual([]);
  });

  it("prefixes ids so two catalogs can share one map", () => {
    const { map, layers } = stubMap();
    createTacticLayers(APP6D_CATALOG, map, { id: "enemy" });
    expect([...layers.keys()]).toEqual([
      "enemy-fill",
      "enemy-line",
      "enemy-line-dashed",
    ]);
  });

  it("removes everything it added", () => {
    const { map, sources, layers } = stubMap();
    const handle = createTacticLayers(APP6D_CATALOG, map);
    handle.update([order()]);
    handle.destroy();

    expect(layers.size).toBe(0);
    expect(sources.size).toBe(0);
  });

  it("survives an update arriving after destroy", () => {
    // A React effect can fire after teardown; writing to a source that is gone
    // would throw inside MapLibre.
    const { map } = stubMap();
    const handle = createTacticLayers(APP6D_CATALOG, map);
    handle.destroy();
    expect(() => handle.update([order()])).not.toThrow();
  });

  it("survives destroy being called twice", () => {
    const { map } = stubMap();
    const handle = createTacticLayers(APP6D_CATALOG, map);
    handle.destroy();
    expect(() => handle.destroy()).not.toThrow();
  });
});
