/**
 * Extensions — how add-ons join a basemap without owning it.
 *
 * WHY THIS EXISTS
 * ---------------
 * An add-on that extends the basemap by WRAPPING it — rendering <DechoBasemap/>
 * itself, re-declaring every basemap prop and passing them through — works for
 * one add-on and collapses at two. A consumer who wants elevation *and*
 * tactical graphics would need a wrapper that owns the Map and knows about
 * both, re-declaring the union of both prop surfaces.
 *
 * So add-ons are plug-ins rather than wrappers:
 *
 *   <DechoBasemap extensions={[elevation({ terrain: true }), tacticGraphics({...})]} />
 *
 * WHY TWO PHASES AND NOT JUST onMapReady
 * --------------------------------------
 * `onMapReady` already exists and is enough for markers, click handlers and
 * anything drawn on top. It is NOT enough for anything that is part of the map
 * rather than on top of it:
 *
 *   - Terrain, hillshade and relief tints are STYLE. Hillshade belongs under
 *     the labels and over the landcover fills; a layer added after construction
 *     lands on top of everything, and the map reads wrong until someone
 *     hand-sorts it. `before: "labels"` lets this module resolve the insertion
 *     point from the flavor's own layer list, so an extension never has to
 *     hardcode a layer id that changes with the flavor.
 *   - A source added after first paint costs a visible restyle. `setTerrain`
 *     especially: it re-tessellates every tile on screen.
 *   - Collisions have to be caught. Two extensions claiming source id "dem", or
 *     two both declaring terrain, must fail loudly at registration rather than
 *     quietly serving one extension's bytes to the other's layers.
 *
 * Hence: `style()` contributes before the Map is constructed, `attach()` runs
 * once it exists and returns its own teardown.
 *
 * WHAT IS STRICT AND WHAT IS TOLERANT
 * -----------------------------------
 * Style merging THROWS. An id collision or a missing anchor means the assembled
 * style is not what either party asked for, and a map that renders the wrong
 * thing is worse than a map that refuses to start.
 *
 * `attach()` failures are CAUGHT AND LOGGED. By then the map exists and the
 * basemap works; one broken add-on should cost its own feature, not the map.
 */

import type { MaplibreLike } from "./assets";

/* eslint-disable @typescript-eslint/no-explicit-any --
   Layer, source, terrain and sky specifications are `any` for exactly the
   reason StyleFragment.sources is: this package's core deliberately does not
   import maplibre-gl, so it cannot name SourceSpecification or LayerSpecification,
   and typing them as Record<string, unknown> only forces a cast on every
   consumer. MapLibre validates the assembled style at construction. */

/** What an extension is told about the basemap it is joining. */
export interface ExtensionContext {
  /**
   * The maplibregl namespace the host is using — the same one the basemap was
   * built with. Extensions that serve their own tiles register their protocol
   * on this rather than importing maplibre-gl themselves, which is what keeps
   * them free of a hard dependency on it (and guarantees one copy).
   */
  maplibregl: MaplibreLike;
  /** The basemap's own vector source id, for inserting relative to it. */
  basemapSourceId: string;
  /** Highest zoom the basemap's tile store holds. */
  basemapMaxZoom: number;
}

export interface TerrainSpec {
  source: string;
  exaggeration?: number;
}

/** What an extension contributes to the style before the Map is constructed. */
export interface StyleContribution {
  /** Sources to add. Ids must not collide with the basemap's or each other's. */
  sources?: Record<string, any>;
  /** Layers to insert, in order, at `before`. */
  layers?: any[];
  /**
   * Where to insert. A layer id, or one of two portable anchors:
   *
   *   "labels"  the first symbol layer — the boundary between the ground and
   *             writing on it. What you want for anything that SHADES the
   *             ground: hillshade, a going wash, a translucent overlay.
   *   "ground"  the first line layer — the boundary between the ground and
   *             things drawn ON it. What you want for anything that IS the
   *             ground: a landuse colour plate, a texture. Insert an opaque
   *             fill at "labels" instead and it covers the roads and the
   *             buildings, which is how this anchor came to exist.
   *
   * Omit to append on top of everything.
   */
  before?: string | "labels" | "ground";
  /** 3D terrain. At most one extension may declare it. */
  terrain?: TerrainSpec;
  /** Atmosphere. At most one extension may declare it. */
  sky?: Record<string, any>;
}

/**
 * The slice of `maplibregl.Map` handed to `attach()`.
 *
 * Structural, and a superset of AttachableMap: core imports no maplibre-gl, so
 * naming Map here is not an option. A real Map satisfies this.
 */
export interface ExtensionMap {
  getZoom(): number;
  getBounds(): {
    getWest(): number;
    getSouth(): number;
    getEast(): number;
    getNorth(): number;
  };
  on(type: string, listener: (ev: any) => void): unknown;
  off(type: string, listener: (ev: any) => void): unknown;
  getLayer(id: string): unknown;
  getSource(id: string): unknown;
  addSource(id: string, source: any): unknown;
  removeSource(id: string): unknown;
  addLayer(layer: any, before?: string): unknown;
  removeLayer(id: string): unknown;
  setPaintProperty(layerId: string, name: string, value: any): unknown;
  setLayoutProperty(layerId: string, name: string, value: any): unknown;
  /**
   * Present because an extension sometimes has to adjust a layer it did not
   * contribute — buildings3d hands the flavor's flat building fill off to its
   * extrusion at the zoom the extrusion starts. There is no matching getter in
   * MapLibre; `getLayer(id)` carries `minzoom`/`maxzoom` for reading them back.
   */
  setLayerZoomRange(layerId: string, minzoom: number, maxzoom: number): unknown;
  setTerrain(terrain: any): unknown;

  /**
   * Style images, for an extension that draws with `fill-pattern` or
   * `icon-image` rather than colour — landusePatterns generates its ground
   * textures at attach time and registers them here.
   *
   * OPTIONAL, unlike everything above, because these three arrived after the
   * contract did: a host that hand-rolls an ExtensionMap against an older
   * version of this package must keep type-checking. An extension that needs
   * them tests for them and degrades to drawing nothing, which is the same
   * bargain attach() failures already make.
   */
  addImage?(
    id: string,
    image: any,
    options?: { pixelRatio?: number },
  ): unknown;
  hasImage?(id: string): boolean;
  removeImage?(id: string): unknown;
}

export interface BasemapExtension {
  /**
   * Stable identifier, unique within one map. Used in error messages and to
   * catch the same extension being added twice — which would mean two
   * registrations of one protocol name and two owners of one source id.
   */
  readonly id: string;
  style?(
    ctx: ExtensionContext,
  ): StyleContribution | Promise<StyleContribution>;
  /**
   * Returns its own teardown, or nothing if it has none.
   *
   * THE STYLE IS LOADED when this is called — `useBasemap` awaits
   * `whenStyleLoaded` first — so `addSource`, `addLayer`, `setPaintProperty`
   * and `setLayerZoomRange` are all safe here. They are NOT safe on a map
   * straight out of the constructor, where they throw "Style is not done
   * loading"; anyone calling `attachExtensions` against their own map owes
   * their extensions the same wait.
   */
  attach?(
    map: ExtensionMap,
    ctx: ExtensionContext,
  ): void | (() => void) | Promise<void | (() => void)>;
}

/** A contribution paired with the extension that made it, for error messages. */
export interface AttributedContribution {
  id: string;
  contribution: StyleContribution;
}

export interface MergedExtensionStyle {
  sources: Record<string, any>;
  layers: any[];
  terrain?: TerrainSpec;
  sky?: Record<string, any>;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

interface LayerLike {
  id?: unknown;
  type?: unknown;
  source?: unknown;
}

function layerOf(layer: unknown): LayerLike {
  return (layer ?? {}) as LayerLike;
}

function layerId(layer: unknown): string | undefined {
  const id = layerOf(layer).id;
  return typeof id === "string" ? id : undefined;
}

function layerType(layer: unknown): string | undefined {
  const type = layerOf(layer).type;
  return typeof type === "string" ? type : undefined;
}

function layerSource(layer: unknown): string | undefined {
  const source = layerOf(layer).source;
  return typeof source === "string" ? source : undefined;
}

function fail(extensionId: string, message: string): never {
  throw new Error(`decho-basemap: extension "${extensionId}" ${message}`);
}

/**
 * Run every extension's `style()`, in order.
 *
 * Sequential rather than Promise.all: an extension's style() may fetch a
 * manifest, and the ones that do are reading through the same byte layer with
 * the same concurrency lanes, so parallelism here buys nothing and makes the
 * failure order non-deterministic.
 */
export async function collectStyleContributions(
  extensions: readonly BasemapExtension[],
  ctx: ExtensionContext,
): Promise<AttributedContribution[]> {
  const seen = new Set<string>();
  const out: AttributedContribution[] = [];

  for (const extension of extensions) {
    if (seen.has(extension.id)) {
      fail(
        extension.id,
        "is present twice. Two instances would each register the same protocol " +
          "name and claim the same source ids; give one a different id, or add " +
          "it once.",
      );
    }
    seen.add(extension.id);
    if (!extension.style) {continue;}
    out.push({
      id: extension.id,
      contribution: await extension.style(ctx),
    });
  }

  return out;
}

/**
 * Merge contributions into the basemap's own sources and layer list.
 *
 * Pure, and separate from useBasemap for the same reason options.ts is: every
 * decision here is arithmetic on plain objects, and it is exactly the sort of
 * arithmetic that looks obviously right and is not.
 */
export function mergeExtensionStyle(
  base: { sources: Record<string, unknown>; layers: unknown[] },
  contributions: readonly AttributedContribution[],
): MergedExtensionStyle {
  const sources: Record<string, unknown> = { ...base.sources };
  const layers: unknown[] = [...base.layers];
  const sourceOwner = new Map<string, string>();
  const layerOwner = new Map<string, string>();
  for (const layer of layers) {
    const id = layerId(layer);
    if (id) {layerOwner.set(id, "the basemap");}
  }

  let terrain: TerrainSpec | undefined;
  let terrainOwner: string | undefined;
  let sky: Record<string, unknown> | undefined;
  let skyOwner: string | undefined;

  for (const { id: extensionId, contribution } of contributions) {
    for (const [sourceId, source] of Object.entries(
      contribution.sources ?? {},
    )) {
      if (sourceId in sources) {
        const owner = sourceOwner.get(sourceId) ?? "the basemap";
        fail(
          extensionId,
          `wants source "${sourceId}", which ${owner} already provides. ` +
            "Source ids are global to a style, so one of them would be serving " +
            "the other's layers.",
        );
      }
      sources[sourceId] = source;
      sourceOwner.set(sourceId, `extension "${extensionId}"`);
    }

    const contributed = contribution.layers ?? [];
    for (const layer of contributed) {
      const id = layerId(layer);
      if (!id) {
        fail(extensionId, "contributed a layer with no id.");
      }
      const owner = layerOwner.get(id);
      if (owner) {
        fail(
          extensionId,
          `wants layer "${id}", which ${owner} already provides.`,
        );
      }
      const source = layerSource(layer);
      // "background" is the one layer type with no source. Everything else
      // naming a source that does not exist renders nothing, silently, which is
      // the single most annoying class of style bug to chase.
      if (source && !(source in sources)) {
        fail(
          extensionId,
          `layer "${id}" reads source "${source}", which nothing provides. ` +
            "Contribute the source alongside the layer, or name the basemap's.",
        );
      }
      layerOwner.set(id, `extension "${extensionId}"`);
    }

    if (contributed.length > 0) {
      const at = anchorIndex(layers, contribution.before, extensionId);
      layers.splice(at, 0, ...contributed);
    }

    if (contribution.terrain) {
      if (terrain) {
        fail(
          extensionId,
          `also wants to own terrain, which extension "${terrainOwner}" already ` +
            "declares. A map has exactly one terrain source; decide which " +
            "extension provides it and turn the other's off.",
        );
      }
      const source = contribution.terrain.source;
      if (!(source in sources)) {
        fail(
          extensionId,
          `declares terrain from source "${source}", which nothing provides.`,
        );
      }
      terrain = contribution.terrain;
      terrainOwner = extensionId;
    }

    if (contribution.sky) {
      if (sky) {
        fail(
          extensionId,
          `also wants to own the sky, which extension "${skyOwner}" already ` +
            "declares.",
        );
      }
      sky = contribution.sky;
      skyOwner = extensionId;
    }
  }

  return { sources, layers, terrain, sky };
}

/**
 * Where a contribution's layers go.
 *
 * Two anchors are resolved from the layer list's own shape rather than from
 * ids, which is what makes them portable across flavors:
 *
 *   "labels"  the first symbol layer — the boundary between the ground and
 *             writing on it.
 *   "ground"  the first line layer — the boundary between the ground and
 *             things drawn on it. In every Protomaps flavor the list opens
 *             with background, earth, landcover and the landuse fills, and the
 *             first line is a runway or a road; so this lands an opaque
 *             landuse plate with the other ground fills instead of on top of
 *             the roads and buildings.
 *
 * Resolved against the WORKING list rather than the original, so two
 * extensions both asking for the same anchor land in the order they were
 * passed rather than in reverse.
 */
function anchorIndex(
  layers: readonly unknown[],
  before: string | undefined,
  extensionId: string,
): number {
  if (before === undefined) {return layers.length;}

  if (before === "labels") {
    const index = layers.findIndex((layer) => layerType(layer) === "symbol");
    // A flavor with no symbol layers at all is legitimate — `lang` unset, or a
    // deliberately unlabelled plate. Appending is the right answer there.
    return index === -1 ? layers.length : index;
  }

  if (before === "ground") {
    const index = layers.findIndex((layer) => layerType(layer) === "line");
    if (index !== -1) {return index;}
    // A list of nothing but fills: fall back to the label boundary, which is
    // still above the ground and below the writing.
    const labels = layers.findIndex((layer) => layerType(layer) === "symbol");
    return labels === -1 ? layers.length : labels;
  }

  const index = layers.findIndex((layer) => layerId(layer) === before);
  if (index === -1) {
    fail(
      extensionId,
      `asked to insert before layer "${before}", which this style does not ` +
        'have. Flavor layer ids are not stable; use before: "labels" unless ' +
        "you control the layer list.",
    );
  }
  return index;
}

/**
 * Attach every extension in order and return one teardown for all of them.
 *
 * Disposal runs in REVERSE order, so an extension that attached on top of
 * another's state unwinds before it — the same reason a stack unwinds the way
 * it does.
 */
export async function attachExtensions(
  map: ExtensionMap,
  ctx: ExtensionContext,
  extensions: readonly BasemapExtension[],
): Promise<() => void> {
  const disposers: Array<() => void> = [];

  for (const extension of extensions) {
    if (!extension.attach) {continue;}
    try {
      const disposer = await extension.attach(map, ctx);
      if (typeof disposer === "function") {disposers.push(disposer);}
    } catch (err) {
      // Deliberately not rethrown: see the header. The map is already up.
      console.warn(
        `[decho-basemap] extension "${extension.id}" failed to attach`,
        err,
      );
    }
  }

  return () => {
    for (const disposer of disposers.reverse()) {
      try {
        disposer();
      } catch (err) {
        console.warn("[decho-basemap] extension teardown failed", err);
      }
    }
  };
}
