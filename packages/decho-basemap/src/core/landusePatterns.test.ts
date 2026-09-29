import { describe, expect, it, vi } from "vitest";

import {
  landusePatterns,
  patternExpression,
} from "./landusePatterns";
import {
  NATURAL_GROUND,
  SLOTS_PER_TEXTURE,
  TEXTURE_COLOURS,
  TEXTURE_ICONS,
  TEXTURE_KINDS,
  TEXTURE_PLATE_COLOURS,
  TEXTURE_SLOT_COUNT,
  placementsForTexture,
  renderTexturePattern,
  slotPlacement,
  wrappedPlacements,
  type LandTexture,
  type TexturePlacement,
} from "./textures";
import { going } from "./overlays";
import {
  mergeExtensionStyle,
  type ExtensionContext,
  type ExtensionMap,
} from "./extensions";

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

const layersOf = async (extension: {
  style?: (c: ExtensionContext) => unknown;
}): Promise<LayerSpec[]> =>
  ((((await extension.style?.(ctx)) ?? {}) as { layers?: unknown[] }).layers ??
    []) as LayerSpec[];

/** The icon layer, as opposed to the colour plate under it. */
const iconLayer = (layers: LayerSpec[]): LayerSpec => {
  const layer = layers.find((l) => l.id.endsWith("-fill"));
  if (!layer) {
    throw new Error("no pattern layer in the contribution");
  }
  return layer;
};

// ── the artwork ─────────────────────────────────────────────────────────────

describe("the icon table", () => {
  it("has artwork, a colour and at least one kind for every texture", () => {
    const used = new Set(Object.values(TEXTURE_KINDS));
    for (const texture of Object.keys(TEXTURE_ICONS) as LandTexture[]) {
      expect(TEXTURE_ICONS[texture].paths.length).toBeGreaterThan(0);
      expect(TEXTURE_COLOURS[texture]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(used).toContain(texture);
    }
  });

  it("declares a stroke width for every line icon", () => {
    // A stroke icon with no width falls back to a default that was chosen for
    // 24-unit line art, and the fill icons are authored at 512.
    for (const icon of Object.values(TEXTURE_ICONS)) {
      if (icon.paint === "stroke") {
        expect(icon.strokeWidth).toBeGreaterThan(0);
      }
    }
  });

  it("authors every path in its own square viewBox", () => {
    // Every path must start with a move, or the first segment is drawn from
    // wherever the previous path happened to end.
    for (const icon of Object.values(TEXTURE_ICONS)) {
      expect(icon.size).toBeGreaterThan(0);
      for (const d of icon.paths) {
        expect(d.trimStart().startsWith("M")).toBe(true);
      }
    }
  });

  it("maps no kind to a texture that does not exist", () => {
    for (const texture of Object.values(TEXTURE_KINDS)) {
      expect(TEXTURE_ICONS[texture]).toBeDefined();
    }
  });

  it("leaves kinds that do not state their ground cover alone", () => {
    // A nature reserve is as often moorland as woodland; drawing trees on it
    // would be the map asserting something the tiles never said.
    for (const kind of ["nature_reserve", "park", "grass", "meadow"]) {
      expect(TEXTURE_KINDS[kind]).toBeUndefined();
    }
  });
});

describe("the slot lattice", () => {
  /** Distance on the torus — the tile repeats, so 0.05 and 0.95 are close. */
  const wrappedDistance = (a: TexturePlacement, b: TexturePlacement): number => {
    const dx = Math.min(Math.abs(a.x - b.x), 1 - Math.abs(a.x - b.x));
    const dy = Math.min(Math.abs(a.y - b.y), 1 - Math.abs(a.y - b.y));
    return Math.hypot(dx, dy);
  };

  const everySlot = Array.from({ length: TEXTURE_SLOT_COUNT }, (_, i) =>
    slotPlacement(i),
  );

  it("gives every texture different offsets from every other", () => {
    // THE POINT OF THE LATTICE. Each texture is its own pattern image and
    // MapLibre tiles them all on the same screen-space grid, so two textures
    // placing an icon at the same fraction of the tile print at the same pixel
    // wherever their polygons overlap — a wood inside a military area.
    const seen = new Set<string>();
    for (let i = 0; i < TEXTURE_SLOT_COUNT; i++) {
      const { x, y } = everySlot[i];
      seen.add(`${x.toFixed(6)},${y.toFixed(6)}`);
    }
    expect(seen.size).toBe(TEXTURE_SLOT_COUNT);
  });

  it("keeps a quarter tile between any two icons, whichever textures they are", () => {
    // 16px at the default 64px tile, which clears an 11px icon with room over.
    for (let i = 0; i < TEXTURE_SLOT_COUNT; i++) {
      for (let j = i + 1; j < TEXTURE_SLOT_COUNT; j++) {
        expect(wrappedDistance(everySlot[i], everySlot[j])).toBeGreaterThanOrEqual(
          0.25 - 1e-9,
        );
      }
    }
  });

  it("deals each texture two slots that are nowhere near each other", () => {
    // Consecutive seats would pair the two icons up and the pattern would read
    // as dominoes rather than scatter.
    for (let texture = 0; texture < 8; texture++) {
      const [first, second] = placementsForTexture(texture);
      expect(wrappedDistance(first, second)).toBeGreaterThan(0.25);
    }
  });

  it("hands out as many slots as it says it does", () => {
    expect(placementsForTexture(0)).toHaveLength(SLOTS_PER_TEXTURE);
    expect(TEXTURE_SLOT_COUNT).toBeGreaterThanOrEqual(
      Object.keys(TEXTURE_ICONS).length * SLOTS_PER_TEXTURE,
    );
  });

  it("keeps every slot inside the tile", () => {
    for (const slot of everySlot) {
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.x).toBeLessThan(1);
      expect(slot.y).toBeGreaterThanOrEqual(0);
      expect(slot.y).toBeLessThan(1);
    }
  });
});

describe("pattern tiles", () => {
  it("draws every icon nine times, so the tile has no visible seam", () => {
    // An icon whose centre is near an edge is sliced off unless it is drawn
    // again one tile over. Without this the seams read as a grid across the
    // whole polygon.
    const placements = placementsForTexture(0);
    const wrapped = wrappedPlacements(placements, 100);
    expect(wrapped).toHaveLength(placements.length * 9);

    for (const placement of placements) {
      const x = placement.x * 100;
      const y = placement.y * 100;
      for (const [dx, dy] of [
        [0, 0],
        [-100, 0],
        [100, 0],
        [0, -100],
        [0, 100],
        [100, 100],
      ]) {
        expect(
          wrapped.some(
            (w) =>
              Math.abs(w.x - (x + dx)) < 1e-9 && Math.abs(w.y - (y + dy)) < 1e-9,
          ),
        ).toBe(true);
      }
    }
  });

  it("keeps rotation and scale on every copy", () => {
    for (const wrapped of wrappedPlacements(
      [{ x: 0.5, y: 0.5, rotate: 12, scale: 0.8 }],
      64,
    )) {
      expect(wrapped.rotate).toBe(12);
      expect(wrapped.scale).toBe(0.8);
    }
  });

  it("scatters rather than gridding", () => {
    // One icon per tile reads as graph paper over anything larger than a
    // hectare. Two, off the diagonal and differently turned, reads as scatter.
    const [first, second] = placementsForTexture(0);
    expect(first.x).not.toBeCloseTo(second.x);
    expect(first.y).not.toBeCloseTo(second.y);
    expect(first.rotate).not.toBe(second.rotate);
  });

  it("returns null rather than throwing where there is no canvas", () => {
    // Vitest runs this suite in node. The caller's response to "no canvas
    // here" is to skip the texture, not to fail the map.
    expect(
      renderTexturePattern({
        icon: TEXTURE_ICONS.woodland,
        colour: "#000000",
        tileSize: 56,
        iconSize: 19,
        pixelRatio: 1,
      }),
    ).toBeNull();
  });
});

// ── the layer ───────────────────────────────────────────────────────────────

describe("landusePatterns", () => {
  it("adds no sources: it styles the tiles the basemap already has", async () => {
    const contribution = (await landusePatterns().style?.(ctx)) ?? {};
    expect(contribution.sources).toBeUndefined();
    for (const layer of (contribution.layers ?? []) as LayerSpec[]) {
      expect(layer.source).toBe("protomaps");
    }
  });

  it("anchors at the ground, UNDER the roads and the buildings", async () => {
    // The bug this exists to prevent: an opaque plate anchored at "labels"
    // sits on top of everything except the writing, and the residential plate
    // hides an entire town.
    const contribution = (await landusePatterns().style?.(ctx)) ?? {};
    expect(contribution.before).toBe("ground");

    const base = {
      sources: { protomaps: { type: "vector" } },
      layers: [
        { id: "background", type: "background" },
        { id: "earth", type: "fill", source: "protomaps" },
        { id: "landuse_park", type: "fill", source: "protomaps" },
        { id: "roads_runway", type: "line", source: "protomaps" },
        { id: "water", type: "fill", source: "protomaps" },
        { id: "buildings", type: "fill", source: "protomaps" },
        { id: "roads_major", type: "line", source: "protomaps" },
        { id: "place-labels", type: "symbol", source: "protomaps" },
      ] as unknown[],
    };
    const merged = mergeExtensionStyle(base, [
      { id: "landuse-patterns", contribution },
    ]);
    const ids = (merged.layers as LayerSpec[]).map((l) => l.id);

    // With the ground fills, before the first line layer.
    expect(ids.indexOf("landuse_park")).toBeLessThan(
      ids.indexOf("landuse-patterns-plate"),
    );
    expect(ids.indexOf("landuse-patterns-plate")).toBeLessThan(
      ids.indexOf("landuse-patterns-fill"),
    );
    for (const drawnOnTop of ["roads_runway", "water", "buildings", "roads_major"]) {
      expect(ids.indexOf("landuse-patterns-fill")).toBeLessThan(
        ids.indexOf(drawnOnTop),
      );
    }
  });

  it("is two layers — plate then icons — not one per texture", async () => {
    const layers = await layersOf(landusePatterns());
    expect(layers.map((l) => l.id)).toEqual([
      "landuse-patterns-plate",
      "landuse-patterns-fill",
    ]);
    for (const layer of layers) {
      expect(layer.type).toBe("fill");
      expect(layer["source-layer"]).toBe("landuse");
    }
  });

  it("brings its own ground colour, because the flavor does not paint it", async () => {
    // Protomaps' landuse layers are park, urban_green, hospital, industrial,
    // school, beach, zoo, aerodrome, runway, pedestrian, pier — and that is
    // the list. farmland, orchard, wetland, heath, scrub and residential are
    // all left as the earth grey, so this plate IS their colour.
    const [plate] = await layersOf(landusePatterns());
    const colours = JSON.stringify(plate.paint?.["fill-color"]);
    expect(colours).toContain("farmland");
    expect(colours).toContain(TEXTURE_PLATE_COLOURS.farmland);
    // Opaque by default: a wash of a colour with nothing under it is a paler
    // grey, which is the thing being fixed.
    expect(plate.paint?.["fill-opacity"]).toBe(1);

    const [washed] = await layersOf(landusePatterns({ plateOpacity: 0.4 }));
    expect(washed.paint?.["fill-opacity"]).toBe(0.4);
  });

  it("paints farmland yellow and woodland darker than the ground", async () => {
    // The two the eye checks first. Sorted by luminance rather than asserted
    // as hex, so retuning the palette does not fail this — the RELATIONSHIP is
    // what matters: a wood reads darker than the country around it.
    const luminance = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) * 0.299 +
      parseInt(hex.slice(3, 5), 16) * 0.587 +
      parseInt(hex.slice(5, 7), 16) * 0.114;

    const farmland = TEXTURE_PLATE_COLOURS.farmland;
    const red = parseInt(farmland.slice(1, 3), 16);
    const blue = parseInt(farmland.slice(5, 7), 16);
    expect(red).toBeGreaterThan(blue + 40);

    expect(luminance(TEXTURE_PLATE_COLOURS.woodland)).toBeLessThan(
      luminance(NATURAL_GROUND),
    );
  });

  it("drops the plate on request, for a flavor that colours everything", async () => {
    const layers = await layersOf(landusePatterns({ plate: false }));
    expect(layers.map((l) => l.id)).toEqual(["landuse-patterns-fill"]);
  });

  it("takes a plate colour override", async () => {
    const [plate] = await layersOf(
      landusePatterns({ plate: { farmland: "#123456" } }),
    );
    const colours = JSON.stringify(plate.paint?.["fill-color"]);
    expect(colours).toContain("#123456");
    // The overridden one only — everything else keeps its default.
    expect(colours).toContain(TEXTURE_PLATE_COLOURS.woodland);
  });

  it("keeps the plate at every zoom, and the icons only above z10", async () => {
    // The colour is worth having zoomed out; the icons are what mat together.
    const [plate, icons] = await layersOf(landusePatterns());
    expect(plate.minzoom).toBeUndefined();
    expect(icons.minzoom).toBe(10);
  });

  it("reads landuse rather than landcover, which stops at z7", async () => {
    const [layer] = await layersOf(landusePatterns());
    expect(layer["source-layer"]).toBe("landuse");
  });

  it("stays off below z10, where the icons would mat together", async () => {
    // The pattern tiles in screen pixels, so zooming out packs more ground
    // behind each icon rather than shrinking it. Two counties of farmland at
    // z6 is a solid sheet of wheat.
    expect(iconLayer(await layersOf(landusePatterns())).minzoom).toBe(10);
    expect(
      iconLayer(await layersOf(landusePatterns({ minZoom: 13 }))).minzoom,
    ).toBe(13);
  });


  it("names an image this extension owns for every kind it lets through", async () => {
    const extension = landusePatterns();
    const layer = iconLayer(await layersOf(extension));
    const pattern = JSON.stringify(layer.paint?.["fill-pattern"]);
    for (const imageId of extension.imageIds) {
      expect(pattern).toContain(imageId);
    }
    // Every kind in the filter resolves to an image, and every image is one of
    // ours — a pattern naming an id nothing adds renders nothing, silently.
    for (const kind of Object.keys(TEXTURE_KINDS)) {
      expect(pattern).toContain(`"${kind}"`);
    }
  });

  it("sets no fill-color on the icon layer, which would ignore it anyway", async () => {
    // Why the plate is a SECOND layer: fill-pattern and fill-color cannot
    // coexist, so the colour has to be painted underneath.
    const layer = iconLayer(await layersOf(landusePatterns()));
    expect(layer.paint?.["fill-color"]).toBeUndefined();
    expect(layer.paint?.["fill-opacity"]).toBeLessThan(1);
  });

  it("prefixes its images with its id, so two instances cannot collide", () => {
    const theatre = landusePatterns({ id: "theatre-textures" });
    for (const imageId of theatre.imageIds) {
      expect(imageId.startsWith("theatre-textures-")).toBe(true);
    }
  });

  it("takes a kind map wholesale, so a mapping can be removed", async () => {
    const extension = landusePatterns({ kinds: { forest: "woodland" } });
    const layer = iconLayer(await layersOf(extension));
    expect(extension.imageIds).toEqual(["landuse-patterns-woodland"]);
    expect(JSON.stringify(layer.filter)).not.toContain("residential");
  });

  it("composes with going(), which colours the same polygons", async () => {
    // The two are meant to be worn together: going() re-colours the plate,
    // this prints on it. Colliding ids or a shared layer name would stop that.
    const base = {
      sources: { protomaps: { type: "vector" } },
      layers: [
        { id: "landuse", type: "fill", source: "protomaps" },
        { id: "place-labels", type: "symbol", source: "protomaps" },
      ] as unknown[],
    };
    const extensions = [going(), landusePatterns()];
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
    // Colour first, texture on top of it, both under the labels.
    expect(ids.indexOf("going-fill")).toBeLessThan(
      ids.indexOf("landuse-patterns-fill"),
    );
    expect(ids.indexOf("landuse-patterns-fill")).toBeLessThan(
      ids.indexOf("place-labels"),
    );
  });
});

describe("patternExpression", () => {
  it("collapses the kinds that share a texture into one match arm", () => {
    const grouped = new Map<LandTexture, string[]>([
      ["woodland", ["forest", "wood"]],
      ["wetland", ["wetland"]],
    ]);
    expect(patternExpression(grouped, (t) => `img-${t}`)).toEqual([
      "match",
      ["get", "kind"],
      ["forest", "wood"],
      "img-woodland",
      "wetland",
      "img-wetland",
      "img-woodland",
    ]);
  });

  it("falls back to a real image rather than a missing one", () => {
    // Unreachable — the layer's filter passes only mapped kinds — but a match
    // must have a fallback, and naming an id nothing adds logs one warning per
    // tile if the filter is ever loosened.
    const grouped = new Map<LandTexture, string[]>([["scrub", ["scrub"]]]);
    const expression = patternExpression(grouped, (t) => `img-${t}`) as string[];
    expect(expression[expression.length - 1]).toBe("img-scrub");
  });
});

// ── images on a live map ────────────────────────────────────────────────────

describe("pattern images", () => {
  function stubMap(overrides: Partial<ExtensionMap> = {}) {
    const events: Record<string, Array<(e: unknown) => void>> = {};
    const images = new Map<string, unknown>();
    const map = {
      getLayer: (id: string) => ({ id }),
      setLayoutProperty: () => undefined,
      on: (type: string, listener: (e: unknown) => void) => {
        (events[type] ??= []).push(listener);
      },
      off: (type: string, listener: (e: unknown) => void) => {
        events[type] = (events[type] ?? []).filter((l) => l !== listener);
      },
      addImage: (id: string, image: unknown) => images.set(id, image),
      hasImage: (id: string) => images.has(id),
      removeImage: (id: string) => images.delete(id),
      ...overrides,
    } as unknown as ExtensionMap;
    return { map, events, images };
  }

  it("listens for styleimagemissing, because a pattern resolves at tile parse", async () => {
    // An image added after a tile has been through the worker does not appear
    // on it; MapLibre defers the tile until this handler has had its chance.
    // Muted: attaching in node finds no canvas and says so, which is the
    // subject of another test and noise in this one.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const extension = landusePatterns();
    await extension.style?.(ctx);
    const { map, events } = stubMap();
    const dispose = extension.attach?.(map, ctx) as () => void;

    expect(events.styleimagemissing).toHaveLength(1);
    dispose();
    expect(events.styleimagemissing).toHaveLength(0);
    warn.mockRestore();
  });

  it("supplies images through the resolver on maplibre-gl 6, where the event only reports", async () => {
    // From 6 an image added from a styleimagemissing listener is too late for
    // the tile that asked; the resolver is awaited instead. One per map, so it
    // is handed back on detach.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const extension = landusePatterns();
    await extension.style?.(ctx);
    const resolvers: Array<((id: string) => void | Promise<void>) | null> = [];
    const { map, events } = stubMap({
      setMissingStyleImageResolver: (resolver) => {
        resolvers.push(resolver);
        return undefined;
      },
    });
    const dispose = extension.attach?.(map, ctx) as () => void;

    expect(resolvers).toHaveLength(1);
    expect(typeof resolvers[0]).toBe("function");
    expect(events.styleimagemissing ?? []).toHaveLength(0);
    // Not one of ours: ignored, not thrown on.
    expect(() => resolvers[0]!("some-other-icon")).not.toThrow();
    dispose();
    expect(resolvers).toEqual([resolvers[0], null]);
    warn.mockRestore();
  });

  it("survives a map that cannot hold images", async () => {
    // No canvas in node, so nothing rasterises here either — the point is that
    // the extension attaches and tears down without throwing, leaving the
    // ground its flat colours.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const extension = landusePatterns();
    await extension.style?.(ctx);
    const { map } = stubMap({ addImage: undefined });

    const dispose = extension.attach?.(map, ctx) as () => void;
    expect(warn).toHaveBeenCalled();
    expect(() => dispose()).not.toThrow();
    warn.mockRestore();
  });

  it("toggles the icons and LEAVES THE COLOUR, which is the point", async () => {
    // "Farmland is yellow" is a fact about the map, not a texture overlay. It
    // has to survive the toggle, and it is what remains below the icons' zoom
    // floor.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const extension = landusePatterns({ visible: false });

    const layers = await layersOf(extension);
    expect(
      layers.find((l) => l.id.endsWith("-plate"))?.layout?.visibility,
    ).toBe("visible");
    expect(iconLayer(layers).layout?.visibility).toBe("none");

    const applied: Array<[string, unknown]> = [];
    const { map } = stubMap({
      setLayoutProperty: (id: string, _name: string, value: unknown) =>
        applied.push([id, value]),
    } as Partial<ExtensionMap>);
    extension.attach?.(map, ctx);
    applied.length = 0;
    extension.setVisible(true);

    expect(extension.visible).toBe(true);
    expect(extension.plateVisible).toBe(true);
    expect(applied).toEqual([
      ["landuse-patterns-plate", "visible"],
      ["landuse-patterns-fill", "visible"],
    ]);

    // And the plate has its own switch, for a caller who really does want the
    // flavor's bare ground back.
    applied.length = 0;
    extension.setPlateVisible(false);
    expect(applied).toEqual([
      ["landuse-patterns-plate", "none"],
      ["landuse-patterns-fill", "visible"],
    ]);
    warn.mockRestore();
  });

  it("repaints the flavor's grey earth when asked, and only when asked", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const painted: Array<[string, string, unknown]> = [];
    const record = {
      setPaintProperty: (id: string, name: string, value: unknown) =>
        painted.push([id, name, value]),
    } as Partial<ExtensionMap>;

    // Off by default: an extension restyling a layer it did not contribute is
    // a surprise, and the flavor is the proper place for a base colour.
    const plain = landusePatterns();
    await plain.style?.(ctx);
    plain.attach?.(stubMap(record).map, ctx);
    expect(painted).toEqual([]);

    const green = landusePatterns({ ground: true });
    await green.style?.(ctx);
    green.attach?.(stubMap(record).map, ctx);
    expect(painted).toEqual([
      ["earth", "fill-color", NATURAL_GROUND],
      ["background", "background-color", NATURAL_GROUND],
    ]);

    painted.length = 0;
    const custom = landusePatterns({ ground: "#123456" });
    await custom.style?.(ctx);
    custom.attach?.(stubMap(record).map, ctx);
    expect(painted.map(([, , value]) => value)).toEqual([
      "#123456",
      "#123456",
    ]);
    warn.mockRestore();
  });

  it("says so rather than throwing when the style has no ground layer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const extension = landusePatterns({ ground: true });
    await extension.style?.(ctx);
    const { map } = stubMap({ getLayer: () => undefined } as Partial<ExtensionMap>);

    expect(() => extension.attach?.(map, ctx)).not.toThrow();
    expect(
      warn.mock.calls.some(([message]) =>
        String(message).includes("repaint the ground"),
      ),
    ).toBe(true);
    warn.mockRestore();
  });
});
