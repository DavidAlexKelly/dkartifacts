/**
 * Option resolution for the React layer.
 *
 * Separate from useBasemap so it can be tested: that module imports maplibre-gl
 * for real, which needs a DOM, whereas every decision below is pure.
 */

import type { Flavor } from "@protomaps/basemaps";
// Type-only, so this module still loads without maplibre-gl. Named rather than
// through the global `maplibregl` namespace, which maplibre-gl 6 no longer declares.
import type { Map as MaplibreMap } from "maplibre-gl";

import type { AssetStore } from "../core/assets.js";
import { CRT_FLAVOR } from "../core/flavors.js";
import { defaultStores } from "../core/defaults.js";
import type { TileStore } from "../core/stores.js";
import type { BasemapHandle } from "../core/basemap.js";
import type { BasemapExtension } from "../core/extensions.js";
import type { FeatureCollection } from "geojson";

/**
 * The named map styles: the Protomaps flavors the bundled asset dataset ships
 * sprites for, and "crt", this package's own green-screen look
 * (core/flavors.ts), which borrows the "black" sprite sheet.
 *
 * Deliberately not open-ended: a flavor whose sprite sheet is missing renders
 * every icon as a console error, which is the exact failure that cost a
 * debugging session when assetsRid was passed without spritePath.
 *
 * "satellite" is NOT here and cannot be. A flavor styles VECTOR tiles; imagery
 * is raster data, needs a raster source, and needs the imagery itself to exist
 * on-platform. See the README.
 */
export const MAP_STYLES = [
  "light",
  "dark",
  "white",
  "grayscale",
  "black",
  "crt",
] as const;

export type MapStyleName = (typeof MAP_STYLES)[number];

export interface UseBasemapOptions {
  // ── Where the tiles come from ─────────────────────────────────────────────
  //
  // Three ways to say it, in ascending order of expressiveness. `rid` covers
  // the common case in one prop; `tiles` is there when you need a media set,
  // a non-default manifest path, or the fixed-grid scheme.

  /**
   * Dataset holding `manifest.json` and the PMTiles chunks. Shorthand for
   * `tiles={{ kind: "manifest", datasetRid: rid }}`.
   */
  rid?: string;
  /** Media set holding the same layout. Used when no `rid` is given. */
  mediaSetRid?: string;
  /**
   * Full store descriptor. Wins over `rid`/`mediaSetRid` when both are given,
   * and is the only way to use the fixed-grid scheme (e.g. THEATRE_STORE).
   * Defaults to the preset planet basemap.
   */
  tiles?: TileStore;

  // ── Glyphs and sprite ─────────────────────────────────────────────────────

  /** Dataset holding the Protomaps basemaps-assets bundle. */
  assetsRid?: string;
  /** Sprite base path inside that dataset, without .json/.png. */
  spritePath?: string;
  /**
   * Full asset store. Wins over `assetsRid`. Pass `null` for no labels;
   * omitting it uses the preset bundle.
   */
  assets?: AssetStore | null;

  // ── Where the map starts ──────────────────────────────────────────────────
  //
  // spawn* are flat scalars because that is what callers usually have to hand
  // — URL params, object properties, form fields — and a [lon, lat] tuple in
  // JSX invites the classic lat/lon transposition. They compose with `center`
  // rather than overriding it, so any mix of the two behaves predictably.

  /** Starting latitude. Overrides the latitude of `center`. */
  spawnLat?: number;
  /** Starting longitude. Overrides the longitude of `center`. */
  spawnLong?: number;
  /** Starting zoom. Overrides `zoom`. */
  spawnZoom?: number;

  /** Starting position as [lon, lat] — MapLibre's own order. */
  center?: [number, number];
  zoom?: number;
  /** Additional zoom levels of overzoom above the store's max. Default 4. */
  overzoom?: number;

  /**
   * Named Protomaps style. The friendly form of `flavor`.
   *
   *   <DechoBasemap mapStyle="dark" />
   *
   * Also selects the matching sprite, so icons cannot end up styled for a
   * different basemap than the one under them.
   *
   * Applied when the map is created. Changing it afterwards does nothing —
   * see the note on live restyling in the README.
   */
  mapStyle?: MapStyleName;

  /**
   * Protomaps flavor object, for styles the named set does not cover (the
   * Scenario Planner's MILITARY_TOPO, for instance). Wins over `mapStyle`.
   * Defaults to namedFlavor("light").
   */
  flavor?: Flavor;
  /**
   * Label language. REQUIRED for labels to appear at all: @protomaps/basemaps
   * only appends its label layers when `lang` is set, so omitting it yields an
   * unlabelled colour plate and not a single glyph request.
   */
  lang?: string;
  /**
   * Replace the whole layer list. Takes precedence over flavor/lang — use it
   * when you need layers the flavor system cannot express.
   */
  layers?: (sourceId: string) => unknown[];

  /**
   * Add-ons that join this map: elevation, mil graphics, imagery.
   *
   *   extensions={[elevation({ terrain: true }), milGraphics({ units })]}
   *
   * Each contributes sources and layers to the style BEFORE the Map is
   * constructed — which is what lets hillshade sit under the labels rather than
   * over everything — and then attaches to the live Map. Order matters: it
   * decides layer order among extensions anchored at the same place, and the
   * order attach/teardown run in.
   *
   * Colliding source or layer ids, two extensions both claiming terrain, or an
   * insertion anchor this flavor does not have all THROW at setup. See
   * core/extensions.ts for why that is strict where attach failures are not.
   */
  extensions?: BasemapExtension[];

  /** Extra keys merged into the vector source (bounds, attribution, ...). */
  sourceOptions?: Record<string, unknown>;
  /** MapLibre protocol name. Unique per source within a page. */
  protocol?: string;
  /** Style source id. Default "protomaps". */
  sourceId?: string;

  /**
   * Render as a 3D globe when zoomed out, transitioning to the flat Mercator
   * map as you zoom in. Default false.
   *
   * This is MapLibre's own `globe` projection (v5+), not a separate renderer:
   * the same vector tiles, the same layers, the same drawing tools — only the
   * projection changes, and the transition is handled for us.
   *
   * Only sensible for a store with global coverage. A regional store (the
   * fixed-grid theatre basemap, say) will show a mostly empty sphere, since
   * zooming out is exactly where it has no data.
   */
  globe?: boolean;

  navigationControl?: boolean;
  scaleControl?: boolean;

  /**
   * Enable point/line/polygon/rectangle drawing. Default false.
   * See useDrawingTools for what is and is not implemented.
   */
  drawingTools?: boolean;
  /** Called whenever the drawn feature collection changes. */
  onDrawChange?: (features: FeatureCollection) => void;

  /** Called once, after the map and the basemap are ready. */
  onMapReady?: (map: MaplibreMap, globe: BasemapHandle) => void;
}

// ── Option resolution ───────────────────────────────────────────────────────
// Shared by the hook and <DechoBasemap/> so the shorthand behaves identically
// at both layers.

const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 2;

export function resolveTileStore(opts: UseBasemapOptions): TileStore {
  if (opts.tiles) {return opts.tiles;}
  if (opts.rid || opts.mediaSetRid) {
    return {
      kind: "manifest",
      datasetRid: opts.rid,
      mediaSetRid: opts.mediaSetRid,
    };
  }
  return defaultStores().planet;
}

export function resolveAssetStore(
  opts: UseBasemapOptions,
): AssetStore | null {
  // Distinguish "not specified" from an explicit null, which means "no labels".
  if (opts.assets !== undefined) {return opts.assets;}

  // A named style implies its sprite. Without this, choosing mapStyle="dark"
  // would keep the light sprite and render icons that are invisible against
  // the dark basemap.
  const spritePath =
    opts.spritePath ??
    (opts.mapStyle ? spritePathForStyle(opts.mapStyle) : undefined);

  if (opts.assetsRid) {
    if (!spritePath) {
       
      console.warn(
        "[decho-basemap] assetsRid was given without spritePath, so the style has " +
          "glyphs but no sprite: labels will render, icons will not. Pass e.g. " +
          'spritePath="sprites/light", set mapStyle, or omit assetsRid to use the ' +
          "preset asset store.",
      );
    }
    return { datasetRid: opts.assetsRid, spritePath };
  }

  const preset = defaultStores().assets;
  if (preset && spritePath && spritePath !== preset.spritePath) {
    return { ...preset, spritePath };
  }
  return preset;
}

export function resolveView(opts: UseBasemapOptions): {
  center: [number, number];
  zoom: number;
} {
  const base = opts.center ?? DEFAULT_CENTER;
  return {
    center: [opts.spawnLong ?? base[0], opts.spawnLat ?? base[1]],
    zoom: opts.spawnZoom ?? opts.zoom ?? DEFAULT_ZOOM,
  };
}

/**
 * Sprite path implied by a style name.
 *
 * The sprite has to match the flavor: "dark" icons on the light basemap are
 * invisible, and a flavor whose sprites are absent logs one error per missing
 * image. Coupling them here means a consumer choosing a style cannot get a
 * mismatched sprite by accident.
 */
export function spritePathForStyle(style: MapStyleName): string {
  return `sprites/${SPRITE_FOR_STYLE[style] ?? style}`;
}

/** Our own styles have no sprite sheet of their own; these borrow one. */
const SPRITE_FOR_STYLE: Partial<Record<MapStyleName, string>> = {
  crt: "black",
};

/**
 * The flavor for a style this package defines itself, or null for one of
 * Protomaps' own (which `namedFlavor` from @protomaps/basemaps builds).
 */
export function ownFlavorForStyle(style: MapStyleName): Flavor | null {
  return style === "crt" ? CRT_FLAVOR : null;
}
