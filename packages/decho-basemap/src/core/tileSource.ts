/**
 * A tile source: one store, its archives, its MapLibre protocol, its prefetch.
 *
 * WHY THIS IS AN INSTANCE AND NOT A MODULE
 * ----------------------------------------
 * The original implementation kept the archive cache, the manifest promise and
 * the protocol registration in module scope, which silently assumed exactly one
 * basemap per page. An app showing the planet basemap on one screen and a
 * theatre basemap on another would have had them share a cache keyed only by
 * file path — different bytes, same key.
 *
 * Everything that was module state is an instance field here, and the protocol
 * name is a parameter, so two sources coexist without knowing about each other.
 */

import { PMTiles } from "pmtiles";
import type { Source } from "pmtiles";

import {
  getFileOptional,
  getJson,
  getMediaItem,
  getMediaItemJson,
  getMemoryBudgetBytes,
  getRangeMode,
  getResidentBytes,
  registerCacheSizeSource,
  settleRangeMode,
} from "@acc/decho-foundry-bytes";
import { FoundryRangeSource, MediaItemSource } from "./sources";
import {
  fixedGridResolver,
  manifestResolver,
  storeTarget,
  type GlobeManifest,
  type Resolver,
  type TileStore,
} from "./stores";
import type { MaplibreLike } from "./assets";

/** Handles held resident. Each PMTiles caches its own decoded directories. */
const MAX_RESIDENT_ARCHIVES = 32;

/** How long a failed archive is remembered as failed. */
const MISSING_TTL_MS = 5 * 60 * 1000;

/** Neighbour cells warmed per view change. */
const MAX_PREFETCH_CELLS = 4;

/** Don't speculate once the resident cache is this full. */
const PREFETCH_MEMORY_HEADROOM = 0.75;

/**
 * Byte ceiling for one round of speculative warming.
 *
 * Cell sizes are wildly uneven — the median z12 cell is a few hundred KB while
 * the worst are tens of MB over Western Europe — so "4 cells" was a budget in
 * the wrong unit. With sizes declared in the manifest, prefetch can spend a
 * fixed number of BYTES instead: several cheap neighbours, or one expensive
 * one, but never 200 MB because the viewport happened to sit over Paris.
 *
 * Cells whose size the manifest does not declare are still fetched, but they
 * are ordered last and each one closes the budget, so an undeclared cell
 * cannot be mistaken for a free one.
 */
const PREFETCH_BYTE_BUDGET = 24 * 1024 * 1024;

export type LoadStatus = "downloading" | "ready" | "error";
export type StatusListener = (path: string, status: LoadStatus) => void;

export interface TileSourceOptions {
  store: TileStore;
  /** MapLibre protocol name. Must be unique per source within a page. */
  protocol?: string;
}

export interface TileSourceHandle {
  /** Tile URL template to put in the style's source definition. */
  readonly tileUrl: string;
  /** Highest zoom the store holds tiles for. */
  readonly maxZoom: number;
  register(maplibregl: MaplibreLike): void;
  unregister(maplibregl: MaplibreLike): void;
  prefetchAround(
    zoom: number,
    bounds: { west: number; south: number; east: number; north: number },
  ): void;
  cancelPrefetch(): void;
  onStatus(listener: StatusListener): () => void;
  /** Resolve a tile to its archive path — for diagnostics and HUDs. */
  pathForTile(z: number, x: number, y: number): string | null;
}

export async function createTileSource(
  options: TileSourceOptions,
): Promise<TileSourceHandle> {
  const { store } = options;
  const protocol = options.protocol ?? "foundry-globe";
  const target = storeTarget(store);

  // ── Resolver ───────────────────────────────────────────────────────────────

  let resolver: Resolver;
  if (store.kind === "fixed-grid") {
    resolver = fixedGridResolver(store);
  } else {
    const manifestPath = store.manifestPath ?? "manifest.json";
    const manifest = await loadManifest(store.datasetRid, store.mediaSetRid, manifestPath);
    if (!manifest) {
      throw new Error(
        `offline-globe: ${manifestPath} not found in ${target.rid}. ` +
          "A manifest store must ship one describing its layers.",
      );
    }
    resolver = manifestResolver(manifest);
  }

  // Settle ranged-vs-whole-file on something small BEFORE any tile can trigger
  // the probe on a 10-25 MB archive. Left to the first tile, a screenful of
  // concurrent reads each probe independently and each is answered with a full
  // copy of the same archive.
  if (!target.media) {
    await settleRangeMode(
      target.rid,
      store.kind === "manifest" ? (store.manifestPath ?? "manifest.json") : "",
    ).catch(() => undefined);
  }

  // Let the persistent cache price its own entries. Its keys end with the
  // percent-encoded archive path, so the manifest's declared sizes can be
  // matched back to them — which is what lets the eviction index be rebuilt
  // from cache.keys() alone, with no bodies read and no separate bookkeeping to
  // fall out of sync.
  registerCacheSizeSource((key) => {
    const encoded = key.slice(key.lastIndexOf("/") + 1);
    if (!encoded) {return undefined;}
    try {
      return resolver.bytesForPath(decodeURIComponent(encoded));
    } catch {
      return undefined;
    }
  });

  // ── Archive cache ──────────────────────────────────────────────────────────

  const archives = new Map<string, PMTiles>();
  const pending = new Map<string, Promise<PMTiles | null>>();
  const failedAt = new Map<string, number>();
  const listeners = new Set<StatusListener>();

  const notify = (path: string, status: LoadStatus) =>
    listeners.forEach((cb) => cb(path, status));

  const touch = (path: string): PMTiles | undefined => {
    const hit = archives.get(path);
    if (!hit) {return undefined;}
    archives.delete(path);
    archives.set(path, hit);
    return hit;
  };

  const admit = (path: string, archive: PMTiles): void => {
    archives.delete(path);
    archives.set(path, archive);
    while (archives.size > MAX_RESIDENT_ARCHIVES) {
      const oldest = archives.keys().next();
      if (oldest.done) {break;}
      archives.delete(oldest.value);
    }
  };

  const sourceFor = (path: string): Source =>
    target.media
      ? new MediaItemSource(target.rid, path)
      : new FoundryRangeSource(target.rid, path);

  /**
   * Pull the archive body up front so the caller's cancellation can reach it,
   * and report whether the archive exists at all.
   *
   * In whole-file mode the body is the transfer unit and it would otherwise be
   * fetched by getHeader() — which is shared between every tile in the cell and
   * therefore unsignalled, meaning MapLibre's aborts would cancel nothing.
   */
  const warmBody = async (
    path: string,
    signal?: AbortSignal,
  ): Promise<boolean> => {
    if (target.media) {
      // Media items are whole-file by definition and getMediaItem takes no
      // signal, so this path is not cancellable.
      return (await getMediaItem(target.rid, path)) !== null;
    }
    if (getRangeMode() !== "whole-file") {return true;}
    return (await getFileOptional(target.rid, path, signal)) !== null;
  };

  const getArchive = async (
    path: string,
    signal?: AbortSignal,
  ): Promise<PMTiles | null> => {
    const cached = touch(path);
    if (cached) {return cached;}

    const failed = failedAt.get(path);
    if (failed !== undefined) {
      if (Date.now() - failed < MISSING_TTL_MS) {return null;}
      failedAt.delete(path);
    }

    notify(path, "downloading");

    let present: boolean;
    try {
      present = await warmBody(path, signal);
    } catch (err) {
      // Cancellation is not failure — the cell stays eligible for retry.
      if (err instanceof Error && err.name === "AbortError") {throw err;}
      failedAt.set(path, Date.now());
      notify(path, "error");
      console.warn("[decho-basemap] failed to fetch archive:", path, err);
      return null;
    }
    if (!present) {
      failedAt.set(path, Date.now());
      notify(path, "error");
      console.warn("[decho-basemap] archive not found:", path);
      return null;
    }

    const inFlight = pending.get(path);
    if (inFlight) {return inFlight;}

    const promise = (async () => {
      try {
        const archive = new PMTiles(sourceFor(path));
        // Unsignalled on purpose: the handle is shared by every tile in the
        // cell. After the warm above this is served from cache anyway.
        await archive.getHeader();
        admit(path, archive);
        notify(path, "ready");
        return archive;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {return null;}
        failedAt.set(path, Date.now());
        notify(path, "error");
        console.warn("[decho-basemap] failed to load archive:", path, err);
        return null;
      } finally {
        pending.delete(path);
      }
    })();

    pending.set(path, promise);
    return promise;
  };

  // ── Prefetch ───────────────────────────────────────────────────────────────

  let prefetchController: AbortController | null = null;
  let idleHandle: number | null = null;

  const cancelPrefetch = (): void => {
    if (idleHandle !== null) {
      cancelIdleCallback(idleHandle);
      idleHandle = null;
    }
    if (prefetchController) {
      prefetchController.abort();
      prefetchController = null;
    }
  };

  const prefetchAround: TileSourceHandle["prefetchAround"] = (zoom, bounds) => {
    cancelPrefetch();

    // Prefetching into an LRU that is about to evict the current viewport is
    // worse than not prefetching at all.
    if (getResidentBytes() > getMemoryBudgetBytes() * PREFETCH_MEMORY_HEADROOM) {
      return;
    }

    const z = Math.min(Math.round(zoom), resolver.maxZoom);
    const candidates = resolver
      .cellsAround(z, bounds, 1)
      .filter(
        (c) =>
          !archives.has(c.path) && !pending.has(c.path) && !failedAt.has(c.path),
      );
    if (candidates.length === 0) {return;}

    // Nearest first. The cell under the viewport centre is found by asking the
    // resolver for a degenerate, ringless extent at that point — which keeps
    // all grid geometry inside the resolver rather than duplicating it here.
    const lon = (bounds.west + bounds.east) / 2;
    const lat = (bounds.south + bounds.north) / 2;
    const centre = resolver.cellsAround(
      z,
      { west: lon, east: lon, south: lat, north: lat },
      0,
    )[0];

    const ordered = centre
      ? [...candidates].sort(
          (a, b) =>
            (a.col - centre.col) ** 2 +
            (a.row - centre.row) ** 2 -
            ((b.col - centre.col) ** 2 + (b.row - centre.row) ** 2),
        )
      : candidates;

    // Nearest-first, then spend a byte budget rather than a cell count. An
    // undeclared size is treated as "expensive": taken last, and only one.
    const targets: string[] = [];
    let budget = PREFETCH_BYTE_BUDGET;
    const declared = ordered.filter((c) => typeof c.bytes === "number");
    const undeclared = ordered.filter((c) => typeof c.bytes !== "number");

    for (const cell of declared) {
      if (targets.length >= MAX_PREFETCH_CELLS) {break;}
      const size = cell.bytes as number;
      if (size > budget) {continue;}
      budget -= size;
      targets.push(cell.path);
    }

    if (targets.length === 0 && undeclared.length > 0) {
      targets.push(undeclared[0].path);
    }

    if (targets.length === 0) {return;}

    const controller = new AbortController();
    prefetchController = controller;
    idleHandle = requestIdleCallback(
      () => {
        idleHandle = null;
        void (async () => {
          for (const path of targets) {
            if (controller.signal.aborted) {return;}
            // Sequential on purpose: one speculative download at a time leaves
            // lanes free for the tiles the user is actually looking at. These
            // joins are refcounted in bytes.ts, so cancelling a prefetch cannot
            // cancel a download a real tile has since joined.
            await getArchive(path, controller.signal).catch(() => null);
          }
        })();
      },
      { timeout: 3000 },
    );
  };

  // ── MapLibre protocol ──────────────────────────────────────────────────────

  let registrations = 0;
  const urlPrefix = `${protocol}://`;
  const tileUrl = `${urlPrefix}{z}/{x}/{y}`;

  /**
   * Parse "<protocol>://z/x/y". Deliberately not a RegExp: the protocol name is
   * a parameter, so a pattern would have to be built at runtime from a
   * non-literal — which is both a ReDoS smell the code scanner rightly flags
   * and needless work on a path that runs for every tile.
   */
  const parseTileUrl = (url: string): [number, number, number] | null => {
    if (!url.startsWith(urlPrefix)) {return null;}
    const parts = url.slice(urlPrefix.length).split("/");
    if (parts.length < 3) {return null;}
    const z = Number(parts[0]);
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
      return null;
    }
    return [z, x, y];
  };

  return {
    tileUrl,
    maxZoom: resolver.maxZoom,

    pathForTile: (z, x, y) => resolver.pathForTile(z, x, y),

    onStatus(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    prefetchAround,

    register(maplibregl) {
      // Counted, not flagged: MapLibre protocols are global but the components
      // registering them are not. React StrictMode double-mounts in dev, and
      // two maps can legitimately be alive at once. With a boolean, the first
      // to unmount removed the protocol out from under the others.
      registrations += 1;
      if (registrations > 1) {return;}

      maplibregl.addProtocol(protocol, async (params, abortController) => {
        const empty = { data: new ArrayBuffer(0) };
        const signal = abortController?.signal;
        const parsed = parseTileUrl(params.url);
        if (!parsed) {return empty;}
        const [z, x, y] = parsed;

        try {
          const path = resolver.pathForTile(z, x, y);
          if (!path) {return empty;}

          const archive = await getArchive(path, signal);
          if (!archive) {return empty;}

          const tile = await archive.getZxy(z, x, y, signal);
          return tile ? { data: tile.data } : empty;
        } catch (err) {
          // Propagate cancellation rather than resolving with an empty tile:
          // MapLibre knows what an AbortError means, whereas zero bytes look
          // like a legitimately empty tile it can cache and stop asking for.
          if (err instanceof Error && err.name === "AbortError") {throw err;}
          console.warn("[decho-basemap] tile error", { z, x, y, err: String(err) });
          return empty;
        }
      });
    },

    unregister(maplibregl) {
      if (registrations === 0) {return;}
      registrations -= 1;
      if (registrations > 0) {return;}

      cancelPrefetch();
      try {
        maplibregl.removeProtocol(protocol);
      } catch {
        /* already gone */
      }
    },

    cancelPrefetch,
  };
}

async function loadManifest(
  datasetRid: string | undefined,
  mediaSetRid: string | undefined,
  path: string,
): Promise<GlobeManifest | null> {
  if (datasetRid) {
    try {
      return await getJson<GlobeManifest>(datasetRid, path);
    } catch {
      /* fall through to the media set */
    }
  }
  if (mediaSetRid) {return getMediaItemJson<GlobeManifest>(mediaSetRid, path);}
  return null;
}
