/**
 * Preset stores for this enrollment.
 *
 * These are exported rather than hidden so that the default is discoverable
 * and overridable. Every entry point takes a store explicitly; these are only
 * the values used when none is supplied.
 *
 * WHEN THESE ARE WRONG
 * --------------------
 * Dataset RIDs are per-enrollment. Anyone adopting this package outside the
 * Accenture stack must pass their own stores — or call configureDefaultStores()
 * once at startup, which is the more convenient form when an app reads them
 * from its own env vars.
 *
 * Note that the consuming application ALSO has to grant access: the OAuth
 * client needs api:use-datasets-read (plus api:mediasets-read for media set
 * stores) AND the dataset must be added as a Resource on the app in Developer
 * Console. The scopes alone return 403.
 */

import type { AssetStore } from "./assets.js";
import type { FixedGridStore, ManifestStore } from "./stores.js";

/** Chunked planet basemap: "[MAP] Chunked PMtiles" in Offline World. */
export const PLANET_STORE: ManifestStore = {
  kind: "manifest",
  datasetRid: "ri.foundry.main.dataset.c7e99de1-90a4-4e22-bd26-b42316d70fe4",
  mediaSetRid: "ri.mio.main.media-set.94a3926f-ce93-48a7-a453-d25c42c0b4f5",
};

/**
 * Northern-Nordic theatre basemap, cut against a fixed bbox before the
 * manifest format existed. Retire this by generating a manifest.json for the
 * dataset — at which point it becomes an ordinary ManifestStore.
 */
export const THEATRE_STORE: FixedGridStore = {
  kind: "fixed-grid",
  datasetRid: "ri.foundry.main.dataset.a31a2aa5-50ea-4205-8dcd-eb2c22ec3b8d",
  singleFileMaxZoom: 8,
  singleFilePath: "z0-z8.pmtiles",
  bbox: { minLon: 14, maxLon: 45, minLat: 44, maxLat: 72 },
  grid: {
    9: { cols: 2, rows: 2 },
    10: { cols: 3, rows: 3 },
    11: { cols: 4, rows: 4 },
    12: { cols: 5, rows: 5 },
  },
  maxZoom: 12,
  fileName: (zoom, minLon, minLat) =>
    `z${zoom}_${minLon.toFixed(1)}E_${minLat.toFixed(1)}N.pmtiles`,
};

/** Protomaps basemaps-assets bundle: glyphs + sprites. */
export const ASSET_STORE: AssetStore = {
  datasetRid: "ri.foundry.main.dataset.8637f7a1-7503-459c-82c9-78e6ffa94e6e",
  spritePath: "sprites/light",
};

export interface DefaultStores {
  planet: ManifestStore;
  theatre: FixedGridStore;
  assets: AssetStore;
}

let defaults: DefaultStores = {
  planet: PLANET_STORE,
  theatre: THEATRE_STORE,
  assets: ASSET_STORE,
};

/** Override some or all of the presets, e.g. from an app's env vars. */
export function configureDefaultStores(next: Partial<DefaultStores>): void {
  defaults = { ...defaults, ...next };
}

export function defaultStores(): DefaultStores {
  return defaults;
}
