/**
 * createBasemap — tiles + glyphs + sprite as one lifecycle.
 *
 * This is the layer most callers want: it owns the protocol registrations and
 * hands back the style fragment to spread into a MapLibre style. It does NOT
 * own a Map. Consumers that need to add their own sources, layers, markers,
 * overlays and interaction — which is most real applications — keep full
 * control of the Map object and simply attach() this to it.
 */

import {
  assetStyleKeys,
  registerAssetProtocols,
  unregisterAssetProtocols,
  type AssetStore,
  type MaplibreLike,
} from "./assets.js";
import {
  createTileSource,
  type StatusListener,
  type TileSourceHandle,
} from "./tileSource.js";
import type { TileStore } from "./stores.js";

export interface BasemapOptions {
  tiles: TileStore;
  assets?: AssetStore | null;
  /** MapLibre protocol name for tiles. Unique per source within a page. */
  protocol?: string;
  /** Style source id. Must match the id the layer list references. */
  sourceId?: string;
  /** Extra keys merged into the vector source (bounds, attribution, ...). */
  sourceOptions?: Record<string, unknown>;
}

export interface StyleFragment {
  glyphs?: string;
  sprite?: string;
  /**
   * Deliberately `any`, and worth explaining.
   *
   * This package's core does not import maplibre-gl — that is what lets it be
   * used from a worker, or by a non-MapLibre consumer, and it keeps the
   * peer dependency genuinely optional. So it cannot name
   * `SourceSpecification`.
   *
   * Typing this as `Record<string, unknown>` was the honest-looking choice and
   * it was worse: `unknown` is not assignable to `SourceSpecification`, so
   * every consumer spreading this fragment into a style had to write
   * `as maplibregl.StyleSpecification`. Four call sites in the first consumer
   * alone, each one a cast that suppresses real errors as a side effect.
   *
   * `any` here pushes the checking to where the types actually exist: MapLibre
   * validates the assembled style at construction, and consumers keep full
   * type safety on their own layers and sources.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sources: Record<string, any>;
}

export interface BasemapHandle {
  /** Spread into a MapLibre style: { version: 8, ...fragment, layers: [...] }. */
  styleFragment(): StyleFragment;
  /** Source id the layer list should reference. Defaults to "protomaps". */
  readonly sourceId: string;
  /** Highest zoom the tile store holds. */
  readonly maxZoom: number;
  /**
   * Wire prefetch to a live map. Returns a detach function; calling it is
   * optional if you call dispose().
   */
  attach(map: AttachableMap): () => void;
  onStatus(listener: StatusListener): () => void;
  pathForTile(z: number, x: number, y: number): string | null;
  /** Removes protocols (refcounted) and cancels outstanding prefetch. */
  dispose(): void;
  /** Escape hatch for advanced use. */
  readonly tiles: TileSourceHandle;
}

/** The slice of maplibregl.Map this package uses. */
export interface AttachableMap {
  getZoom(): number;
  getBounds(): {
    getWest(): number;
    getSouth(): number;
    getEast(): number;
    getNorth(): number;
  };
  on(type: string, listener: () => void): unknown;
  off(type: string, listener: () => void): unknown;
}

export async function createBasemap(
  maplibregl: MaplibreLike,
  options: BasemapOptions,
): Promise<BasemapHandle> {
  const sourceId = options.sourceId ?? "protomaps";
  const assets = options.assets ?? null;

  const tiles = await createTileSource({
    store: options.tiles,
    protocol: options.protocol,
  });

  tiles.register(maplibregl);
  registerAssetProtocols(maplibregl, assets);

  let disposed = false;

  return {
    sourceId,
    maxZoom: tiles.maxZoom,
    tiles,

    styleFragment() {
      return {
        ...assetStyleKeys(assets),
        sources: {
          [sourceId]: {
            type: "vector",
            tiles: [tiles.tileUrl],
            minzoom: 0,
            maxzoom: tiles.maxZoom,
            attribution:
              '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>',
            ...(options.sourceOptions ?? {}),
          },
        },
      };
    },

    attach(map) {
      // Debounced: MapLibre fires moveend once per gesture, but zoomend and
      // moveend both land on the same view change.
      let timer: ReturnType<typeof setTimeout> | null = null;
      const onIdleish = () => {
        if (timer) {clearTimeout(timer);}
        timer = setTimeout(() => {
          const b = map.getBounds();
          tiles.prefetchAround(map.getZoom(), {
            west: b.getWest(),
            south: b.getSouth(),
            east: b.getEast(),
            north: b.getNorth(),
          });
        }, 200);
      };

      map.on("moveend", onIdleish);
      map.on("zoomend", onIdleish);

      return () => {
        if (timer) {clearTimeout(timer);}
        map.off("moveend", onIdleish);
        map.off("zoomend", onIdleish);
        tiles.cancelPrefetch();
      };
    },

    onStatus: tiles.onStatus,
    pathForTile: tiles.pathForTile,

    dispose() {
      if (disposed) {return;}
      disposed = true;
      tiles.unregister(maplibregl);
      unregisterAssetProtocols(maplibregl, assets);
    },
  };
}
