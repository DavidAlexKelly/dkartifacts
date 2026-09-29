import { describe, expect, it, vi } from "vitest";

import {
  attachExtensions,
  collectStyleContributions,
  mergeExtensionStyle,
  type BasemapExtension,
  type ExtensionContext,
  type ExtensionMap,
} from "./extensions.js";

const ctx: ExtensionContext = {
  maplibregl: { addProtocol: () => undefined, removeProtocol: () => undefined },
  basemapSourceId: "protomaps",
  basemapMaxZoom: 12,
};

/** A minimal flavor-shaped layer list: ground, then labels. */
const baseLayers = [
  { id: "background", type: "background" },
  { id: "landcover", type: "fill", source: "protomaps" },
  { id: "roads", type: "line", source: "protomaps" },
  { id: "places", type: "symbol", source: "protomaps" },
  { id: "place-labels", type: "symbol", source: "protomaps" },
];

const baseSources = { protomaps: { type: "vector" } };
const base = () => ({ sources: { ...baseSources }, layers: [...baseLayers] });

const ids = (layers: unknown[]) =>
  layers.map((l) => (l as { id: string }).id);

describe("mergeExtensionStyle", () => {
  it("appends when no anchor is given", () => {
    const merged = mergeExtensionStyle(base(), [
      {
        id: "a",
        contribution: {
          sources: { dem: { type: "raster-dem" } },
          layers: [{ id: "hillshade", type: "hillshade", source: "dem" }],
        },
      },
    ]);

    const order = ids(merged.layers);
    expect(order[order.length - 1]).toBe("hillshade");
    expect(merged.sources.dem).toEqual({ type: "raster-dem" });
  });

  it('inserts before the first symbol layer for "labels"', () => {
    const merged = mergeExtensionStyle(base(), [
      {
        id: "a",
        contribution: {
          sources: { dem: { type: "raster-dem" } },
          layers: [{ id: "hillshade", type: "hillshade", source: "dem" }],
          before: "labels",
        },
      },
    ]);

    expect(ids(merged.layers)).toEqual([
      "background",
      "landcover",
      "roads",
      "hillshade",
      "places",
      "place-labels",
    ]);
  });

  it("keeps two extensions anchored at labels in the order they were passed", () => {
    // The bug this pins: resolving the anchor against the ORIGINAL list gives
    // both the same index, and the second insert pushes the first one along —
    // so they come out reversed.
    const merged = mergeExtensionStyle(base(), [
      {
        id: "relief",
        contribution: {
          sources: { dem: { type: "raster-dem" } },
          layers: [{ id: "hillshade", type: "hillshade", source: "dem" }],
          before: "labels",
        },
      },
      {
        id: "mil",
        contribution: {
          sources: { orders: { type: "geojson" } },
          layers: [{ id: "order-lines", type: "line", source: "orders" }],
          before: "labels",
        },
      },
    ]);

    expect(ids(merged.layers)).toEqual([
      "background",
      "landcover",
      "roads",
      "hillshade",
      "order-lines",
      "places",
      "place-labels",
    ]);
  });

  it("appends when the flavor has no symbol layers at all", () => {
    const merged = mergeExtensionStyle(
      { sources: { ...baseSources }, layers: [{ id: "background", type: "background" }] },
      [
        {
          id: "a",
          contribution: {
            sources: { dem: { type: "raster-dem" } },
            layers: [{ id: "hillshade", type: "hillshade", source: "dem" }],
            before: "labels",
          },
        },
      ],
    );

    expect(ids(merged.layers)).toEqual(["background", "hillshade"]);
  });

  it('inserts before the first line layer for "ground"', () => {
    // The anchor for anything that IS the ground rather than a wash over it.
    // A Protomaps layer list opens with background, earth, landcover and the
    // landuse fills, and the first line is a runway or a road — so this lands
    // an opaque landuse plate with the other ground fills instead of on top of
    // the roads and the buildings.
    const merged = mergeExtensionStyle(base(), [
      {
        id: "a",
        contribution: {
          layers: [{ id: "landuse-plate", type: "fill", source: "protomaps" }],
          before: "ground",
        },
      },
    ]);

    expect(ids(merged.layers)).toEqual([
      "background",
      "landcover",
      "landuse-plate",
      "roads",
      "places",
      "place-labels",
    ]);
  });

  it('falls back to the label boundary for "ground" when nothing is a line', () => {
    const merged = mergeExtensionStyle(
      {
        sources: { ...baseSources },
        layers: [
          { id: "landcover", type: "fill", source: "protomaps" },
          { id: "place-labels", type: "symbol", source: "protomaps" },
        ],
      },
      [
        {
          id: "a",
          contribution: {
            layers: [{ id: "plate", type: "fill", source: "protomaps" }],
            before: "ground",
          },
        },
      ],
    );

    expect(ids(merged.layers)).toEqual([
      "landcover",
      "plate",
      "place-labels",
    ]);
  });

  it("inserts before a named layer", () => {
    const merged = mergeExtensionStyle(base(), [
      {
        id: "a",
        contribution: {
          sources: { dem: { type: "raster-dem" } },
          layers: [{ id: "hillshade", type: "hillshade", source: "dem" }],
          before: "roads",
        },
      },
    ]);

    expect(ids(merged.layers).slice(0, 4)).toEqual([
      "background",
      "landcover",
      "hillshade",
      "roads",
    ]);
  });

  it("throws on a source id the basemap already owns", () => {
    expect(() =>
      mergeExtensionStyle(base(), [
        {
          id: "a",
          contribution: { sources: { protomaps: { type: "raster-dem" } } },
        },
      ]),
    ).toThrow(/already provides/);
  });

  it("throws when two extensions claim one source id", () => {
    expect(() =>
      mergeExtensionStyle(base(), [
        { id: "a", contribution: { sources: { dem: { type: "raster-dem" } } } },
        { id: "b", contribution: { sources: { dem: { type: "raster-dem" } } } },
      ]),
    ).toThrow(/extension "b".*extension "a"/s);
  });

  it("throws on a layer reading a source nothing provides", () => {
    expect(() =>
      mergeExtensionStyle(base(), [
        {
          id: "a",
          contribution: {
            layers: [{ id: "hillshade", type: "hillshade", source: "dem" }],
          },
        },
      ]),
    ).toThrow(/reads source "dem"/);
  });

  it("allows a layer with no source (background)", () => {
    const merged = mergeExtensionStyle(base(), [
      {
        id: "a",
        contribution: { layers: [{ id: "wash", type: "background" }] },
      },
    ]);
    expect(ids(merged.layers)).toContain("wash");
  });

  it("throws on a duplicate layer id", () => {
    expect(() =>
      mergeExtensionStyle(base(), [
        {
          id: "a",
          contribution: { layers: [{ id: "roads", type: "background" }] },
        },
      ]),
    ).toThrow(/layer "roads".*the basemap/);
  });

  it("throws on an anchor the style does not have", () => {
    expect(() =>
      mergeExtensionStyle(base(), [
        {
          id: "a",
          contribution: {
            layers: [{ id: "x", type: "background" }],
            before: "water-labels-that-this-flavor-drops",
          },
        },
      ]),
    ).toThrow(/does not have/);
  });

  it("carries terrain and sky through, once", () => {
    const merged = mergeExtensionStyle(base(), [
      {
        id: "a",
        contribution: {
          sources: { dem: { type: "raster-dem" } },
          terrain: { source: "dem", exaggeration: 1.4 },
          sky: { "sky-color": "#8ab" },
        },
      },
    ]);

    expect(merged.terrain).toEqual({ source: "dem", exaggeration: 1.4 });
    expect(merged.sky).toEqual({ "sky-color": "#8ab" });
  });

  it("throws when two extensions both declare terrain", () => {
    expect(() =>
      mergeExtensionStyle(base(), [
        {
          id: "a",
          contribution: {
            sources: { dem: { type: "raster-dem" } },
            terrain: { source: "dem" },
          },
        },
        {
          id: "b",
          contribution: {
            sources: { dem2: { type: "raster-dem" } },
            terrain: { source: "dem2" },
          },
        },
      ]),
    ).toThrow(/also wants to own terrain/);
  });

  it("throws on terrain from a source nothing provides", () => {
    expect(() =>
      mergeExtensionStyle(base(), [
        { id: "a", contribution: { terrain: { source: "nope" } } },
      ]),
    ).toThrow(/nothing provides/);
  });

  it("does not mutate the caller's arrays", () => {
    const input = base();
    mergeExtensionStyle(input, [
      {
        id: "a",
        contribution: {
          sources: { dem: { type: "raster-dem" } },
          layers: [{ id: "hillshade", type: "hillshade", source: "dem" }],
          before: "labels",
        },
      },
    ]);
    expect(input.layers).toHaveLength(baseLayers.length);
    expect(Object.keys(input.sources)).toEqual(["protomaps"]);
  });
});

describe("collectStyleContributions", () => {
  it("calls style() in order and passes the context", async () => {
    const calls: string[] = [];
    const make = (id: string): BasemapExtension => ({
      id,
      style: (c) => {
        calls.push(`${id}:${c.basemapSourceId}`);
        return {};
      },
    });

    await collectStyleContributions([make("a"), make("b")], ctx);
    expect(calls).toEqual(["a:protomaps", "b:protomaps"]);
  });

  it("skips extensions with no style()", async () => {
    const out = await collectStyleContributions([{ id: "a" }], ctx);
    expect(out).toEqual([]);
  });

  it("throws when the same extension id appears twice", async () => {
    await expect(
      collectStyleContributions([{ id: "a" }, { id: "a" }], ctx),
    ).rejects.toThrow(/present twice/);
  });
});

describe("attachExtensions", () => {
  const map = {} as ExtensionMap;

  it("attaches in order and disposes in reverse", async () => {
    const log: string[] = [];
    const make = (id: string): BasemapExtension => ({
      id,
      attach: () => {
        log.push(`attach:${id}`);
        return () => log.push(`dispose:${id}`);
      },
    });

    const dispose = await attachExtensions(map, ctx, [make("a"), make("b")]);
    expect(log).toEqual(["attach:a", "attach:b"]);
    dispose();
    expect(log).toEqual(["attach:a", "attach:b", "dispose:b", "dispose:a"]);
  });

  it("awaits an async attach", async () => {
    let done = false;
    await attachExtensions(map, ctx, [
      {
        id: "a",
        attach: async () => {
          await Promise.resolve();
          done = true;
        },
      },
    ]);
    expect(done).toBe(true);
  });

  it("survives an extension that throws, and still attaches the rest", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log: string[] = [];

    const dispose = await attachExtensions(map, ctx, [
      {
        id: "bad",
        attach: () => {
          throw new Error("boom");
        },
      },
      {
        id: "good",
        attach: () => {
          log.push("attached");
          return () => log.push("disposed");
        },
      },
    ]);

    expect(log).toEqual(["attached"]);
    expect(warn).toHaveBeenCalled();
    dispose();
    expect(log).toEqual(["attached", "disposed"]);
    warn.mockRestore();
  });

  it("survives a teardown that throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const dispose = await attachExtensions(map, ctx, [
      {
        id: "a",
        attach: () => () => {
          throw new Error("boom");
        },
      },
    ]);
    expect(() => dispose()).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
