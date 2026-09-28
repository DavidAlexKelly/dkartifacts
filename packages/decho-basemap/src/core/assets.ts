/**
 * assets — Foundry-hosted MapLibre glyphs and sprite.
 *
 * WHY THIS EXISTS
 * ---------------
 * MapLibre cannot shape text without a `glyphs` URL. A style built with only
 * `version`, `sources` and `layers` renders every symbol layer as nothing:
 * the whole Protomaps label tier (places, roads, water, boundaries) plus any
 * app labels (objective names, MGRS grid labels) silently disappear. Markers
 * drawn as DOM elements keep rendering, which is why an unlabelled map can go
 * unnoticed for a long time.
 *
 * THE TRAP THIS AVOIDS
 * --------------------
 * The obvious fix is a public CDN glyphs URL. For a Foundry-hosted app that
 * would often be the ONLY external network call it makes — breaking offline
 * use, and blocked outright by the default Content Security Policy. So glyphs
 * and sprite are served out of a Foundry dataset through custom MapLibre
 * protocols, exactly mirroring the tile protocol.
 *
 * DATASET LAYOUT EXPECTED
 * -----------------------
 *   fonts/{fontstack}/{range}.pbf    e.g. fonts/Noto Sans Regular/0-255.pbf
 *   sprites/{name}.json|.png         optional
 *
 * This matches the upstream Protomaps `basemaps-assets` bundle, so it can be
 * uploaded to a dataset unmodified. The full multi-script set costs nothing at
 * runtime: MapLibre requests glyph ranges lazily per (fontstack, range), so
 * only the ranges actually rendered are ever fetched. The extra files only
 * cost dataset size.
 *
 * The sprite is OPTIONAL and configured separately, because it is only needed
 * by layers using `icon-image`. Text needs glyphs alone, and a missing sprite
 * must not cost labels.
 *
 * GRACEFUL DEGRADATION
 * --------------------
 * With no asset store configured, assetStyleKeys() returns {} so callers omit
 * the keys entirely. Pointing MapLibre at a protocol that cannot resolve is
 * worse than omitting it: that produces a console error per fontstack per
 * tile. Unset simply means "no labels".
 */

import { getFile } from "@acc/decho-foundry-bytes";

export interface AssetStore {
  /** Dataset holding the Protomaps basemaps-assets bundle. */
  datasetRid: string;
  /**
   * Directory prefix holding the glyph PBFs. Defaults to "fonts", matching the
   * upstream bundle layout.
   */
  fontsPrefix?: string;
  /**
   * Path to the sprite base name, WITHOUT the .json / .png suffix — MapLibre
   * appends those itself, and "@2x" on high-DPI displays. Omit for no sprite.
   * For the upstream bundle this looks like "sprites/light".
   */
  spritePath?: string;
}

const GLYPHS_PROTOCOL = "foundry-glyphs";
const SPRITE_PROTOCOL = "foundry-sprite";

/** Value for the style's `glyphs` key. MapLibre fills in the placeholders. */
export const GLYPHS_URL = `${GLYPHS_PROTOCOL}://{fontstack}/{range}.pbf`;

// ── Font stacks ─────────────────────────────────────────────────────────────
// The Protomaps Noto set. Asking for stacks the bundle does not ship renders
// NOTHING — MapLibre has no fallback for an unresolvable fontstack, which is a
// common cause of "my labels vanished".
//
// There is deliberately no FONT_BOLD: the bundle ships no Bold weight. Use
// FONT_MEDIUM for emphasis.
//
// Each must stay a SINGLE-element array. MapLibre joins the array into one
// fontstack name ("A,B") and no such combined directory exists, so a stack
// like ["Open Sans Bold", "Arial Unicode MS Bold"] resolves to nothing at all.

export const FONT_REGULAR = ["Noto Sans Regular"];
export const FONT_MEDIUM = ["Noto Sans Medium"];
export const FONT_ITALIC = ["Noto Sans Italic"];

// ── Protocol handlers ───────────────────────────────────────────────────────

export interface MaplibreLike {
  addProtocol: (
    name: string,
    handler: (
      params: { url: string },
      abortController?: AbortController,
    ) => Promise<{ data: unknown }>,
  ) => void;
  removeProtocol: (name: string) => void;
}

function pathFromUrl(url: string, protocol: string, prefix: string): string {
  // "foundry-glyphs://Noto%20Sans%20Regular/0-255.pbf"
  //   -> "fonts/Noto Sans Regular/0-255.pbf"
  const raw = url.slice(`${protocol}://`.length);
  const decoded = raw
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
  return prefix ? `${prefix}/${decoded}` : decoded;
}

/**
 * Registrations are COUNTED, not flagged.
 *
 * These protocols are global to MapLibre but shared by every map in an app.
 * With a boolean, the first map to unmount called removeProtocol and every
 * other live map silently lost its labels until a reload. React 18 StrictMode's
 * development double-mount exercises the same path.
 *
 * The store is captured on FIRST registration: one glyph protocol cannot serve
 * two different asset datasets. Registering a second, different store is a
 * programming error and says so.
 */
let registrations = 0;
let activeStore: AssetStore | null = null;

export function registerAssetProtocols(
  maplibregl: MaplibreLike,
  store: AssetStore | null | undefined,
): void {
  if (!store?.datasetRid) {return;}

  if (registrations > 0) {
    if (activeStore && activeStore.datasetRid !== store.datasetRid) {
      throw new Error(
        `offline-globe: glyphs are already served from ${activeStore.datasetRid}; ` +
          `cannot also serve them from ${store.datasetRid} in the same page.`,
      );
    }
    registrations += 1;
    return;
  }

  registrations = 1;
  activeStore = store;

  const rid = store.datasetRid;
  const fontsPrefix = store.fontsPrefix ?? "fonts";

  maplibregl.addProtocol(GLYPHS_PROTOCOL, async ({ url }, abortController) => {
    const path = pathFromUrl(url, GLYPHS_PROTOCOL, fontsPrefix);
    return { data: await getFile(rid, path, abortController?.signal) };
  });

  if (!store.spritePath) {return;}

  maplibregl.addProtocol(SPRITE_PROTOCOL, async ({ url }, abortController) => {
    // spritePath is already a full path inside the dataset, so no prefix.
    const path = pathFromUrl(url, SPRITE_PROTOCOL, "");
    const buffer = await getFile(rid, path, abortController?.signal);
    // MapLibre expects the sprite index as a parsed object but the image as
    // raw bytes.
    if (path.endsWith(".json")) {
      return { data: JSON.parse(new TextDecoder().decode(buffer)) };
    }
    return { data: buffer };
  });
}

export function unregisterAssetProtocols(
  maplibregl: MaplibreLike,
  store: AssetStore | null | undefined,
): void {
  if (!store?.datasetRid || registrations === 0) {return;}
  registrations -= 1;
  if (registrations > 0) {return;}

  activeStore = null;
  try {
    maplibregl.removeProtocol(GLYPHS_PROTOCOL);
    maplibregl.removeProtocol(SPRITE_PROTOCOL);
  } catch {
    /* protocols may already be gone during teardown */
  }
}

/**
 * Style fragment carrying the glyphs/sprite keys, or an empty object when no
 * asset store is configured. Spread this into a MapLibre style:
 *
 *   style: { version: 8, ...assetStyleKeys(store), sources: {...}, layers: [...] }
 */
export function assetStyleKeys(
  store: AssetStore | null | undefined,
): { glyphs?: string; sprite?: string } {
  if (!store?.datasetRid) {return {};}
  // `sprite` is emitted only when a sprite path is configured. Text rendering
  // needs glyphs alone, so a missing sprite must not cost us labels.
  return store.spritePath
    ? { glyphs: GLYPHS_URL, sprite: `${SPRITE_PROTOCOL}://${store.spritePath}` }
    : { glyphs: GLYPHS_URL };
}
