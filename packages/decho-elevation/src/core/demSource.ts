/**
 * A DEM source: one store, its cells, its MapLibre protocols, its prefetch.
 *
 * This is the layer that turns "a dataset of GeoTIFF chunks" into both things a
 * consumer wants:
 *
 *   - QUESTIONS. `heightAt`, `slopeAt`, and the profile and sight-line
 *     functions built on top of them. No map involved; a worker or a Function
 *     can do this.
 *   - PICTURES. Mercator tiles served through MapLibre custom protocols, so
 *     `raster-dem` (terrain and hillshade) and `raster` (relief tints) sources
 *     can point at them with no server-side preparation at all.
 *
 * AN INSTANCE, NOT A MODULE
 * -------------------------
 * For the reason @acc/decho-basemap's tileSource.ts gives at length: module
 * state silently assumes one source per page, and the moment an app shows a
 * global DEM on one screen and a high-resolution theatre DEM on another they
 * share a cache keyed only by cell — different bytes, same key. Everything here
 * is an instance field and the protocol names are parameters.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * Hillshade. MapLibre computes it from a `raster-dem` source itself, with
 * illumination direction, exaggeration and accumulation already implemented and
 * already tuned. Generating hillshade pixels here would be slower, worse, and
 * would not respond to the light moving.
 *
 * WHEN ANYTHING IS LOADED — AND WHY THERE IS A ZOOM FLOOR
 * -------------------------------------------------------
 * A tile request fans out to every DEM cell the tile covers. Cells are 2° and
 * 3-25 MB, so that fan-out is the whole cost model:
 *
 *   zoom | one 256 px tile spans | cells it touches
 *   -----|-----------------------|------------------
 *   z12  | 0.088°                | 1, usually
 *   z10  | 0.35°                 | 1-4
 *   z9   | 0.70°                 | 1-4
 *   z8   | 1.41°                 | up to 9
 *   z2   | 90°                   | ~2,000
 *   z0   | the planet            | ~15,700
 *
 * The first version of this had no floor, and a world view therefore asked for
 * one tile that resolved to fifteen thousand chunk fetches — most of them 404s
 * for ocean, all of them queued through the byte layer's lanes, and enough to
 * wedge the tab before a single pixel was drawn. A DEM is not something to
 * speculate about at continental zoom: at z8 a 2° cell is about 40 screen
 * pixels tall, so the data cannot be seen even when it arrives.
 *
 * So `minZoom` (9 by default) is enforced in three places, deliberately
 * belt-and-braces because the failure mode is so expensive:
 *
 *   1. the STYLE — `minzoom` on the source, which is what actually prevents the
 *      request. MapLibre's coveringTiles returns nothing below a source's
 *      minzoom, so no tile is asked for at all. Set by ./extension.
 *   2. the PROTOCOL HANDLER — a tile below the floor answers with the constant
 *      empty tile without touching a cell, so a hand-written style that forgets
 *      minzoom degrades to flat terrain rather than to a stampede.
 *   3. a CELL CAP per tile, as a backstop against a floor set too low by
 *      someone who has not read this comment.
 *
 * The floor applies to TILES ONLY. `heightAt`, `elevationProfile`,
 * `lineOfSight` and `viewshed` load whatever cell they need at any zoom,
 * because they are answering a question the user explicitly asked. Reading a
 * profile while zoomed out to a continent is a legitimate thing to do, and one
 * cell is a reasonable price for it; drawing terrain nobody can see is not.
 */
import { getFileOptional, getLaneStats, isConfigured } from "./bytes.js";
import { DEFAULT_CELL_BUDGET_BYTES, createCellCache } from "./cellCache.js";
import { type DemCodec, codecForPath } from "./codec.js";
import { defaultDemStore } from "./defaults.js";
import {
  type CellBounds,
  type CellCoord,
  cellBounds,
  cellFor,
  cellKey,
  cellsAlongLine,
  cellsInBounds,
} from "./grid.js";
import { type HeightGrid, type SlopeAspect, sampleHeight, slopeAt } from "./heightGrid.js";
import { metresPerPixel, resampleTile, tileBounds } from "./mercator.js";
import { encodePng } from "./png.js";
import { type TileRenderer, terrariumTile } from "./renderers.js";
import { type DemIndex, type DemStore, loadDemIndex } from "./store.js";

/** How long a cell that answered 404 is remembered as absent. */
const MISSING_TTL_MS = 5 * 60 * 1000;

/**
 * Lowest zoom that serves tiles. See the header.
 *
 * 9 rather than 8 because at z8 a tile can touch nine cells — up to 200 MB for
 * one tile — and a 2° cell is only about 40 screen pixels tall there, so the
 * detail is invisible even once it lands. 9 is where a tile reliably touches
 * one to four cells and where a 90 m posting starts to show.
 */
export const DEFAULT_MIN_ZOOM = 9;

/**
 * Cells one tile may touch before it is treated as a mistake.
 *
 * A backstop for a `minZoom` set too low, not a policy: at the default floor a
 * tile touches at most four, and at z8 at most nine. Sixteen leaves room for an
 * unusual tile size or a deliberately lower floor while still ruling out the
 * fifteen-thousand-cell world tile that made this constant necessary.
 */
const MAX_CELLS_PER_TILE = 16;

/** Cells warmed per view change. */
const MAX_PREFETCH_CELLS = 4;

/**
 * Zoom levels BELOW the floor at which cells are still warmed.
 *
 * The floor is abrupt by nature: cross it and MapLibre drops every terrain tile
 * at once, and cross back and it wants them all again from nothing. Warming one
 * level early means the step into the floor finds the cells decoded and the
 * relief appears with the zoom rather than seconds after it.
 *
 * One level, not two. A cell warmed at the floor minus one is a cell the next
 * zoom step will draw — the least speculative speculation there is — whereas
 * two levels out is a view four times as wide, where the same four cells are
 * far less likely to be the ones anybody zooms into.
 */
const PREFETCH_LEAD_ZOOMS = 1;

/**
 * Byte ceiling for one round of speculative warming.
 *
 * The same reasoning as the basemap's: cell sizes are wildly uneven, so "four
 * cells" is a budget in the wrong unit. Cells whose size nothing declares
 * (there is no manifest today) are still fetched, but one at a time.
 */
const PREFETCH_BYTE_BUDGET = 32 * 1024 * 1024;

/** The two methods of `maplibregl` this package uses. Structural on purpose. */
export interface ProtocolHost {
  addProtocol: (
    name: string,
    handler: (
      params: { url: string },
      abortController?: AbortController,
    ) => Promise<{ data: unknown }>,
  ) => void;
  removeProtocol: (name: string) => void;
}

export interface DemSourceOptions {
  store?: DemStore;
  /** Extra or replacement codecs. Defaults to the built-in GeoTIFF reader. */
  codecs?: readonly DemCodec[];
  /** Tile edge in pixels. 256 unless you have a reason. */
  tileSize?: number;
  /**
   * Highest zoom to advertise for the tile sources.
   *
   * At a 90 m posting there is no more detail above about z12, and MapLibre
   * overzooms happily above a source's maxzoom — so serving higher would spend
   * work to draw the same information four times over.
   */
  maxZoom?: number;
  /**
   * Lowest zoom to serve tiles at. Default 9.
   *
   * This is a cost floor, not a preference: below it one tile covers several 2°
   * cells and the fan-out grows as 4^z while the visible detail does not. See
   * the header for the arithmetic. Point sampling, profiles and sight lines
   * ignore it.
   */
  minZoom?: number;
  /**
   * Protocol name -> renderer. Every entry becomes a MapLibre protocol serving
   * `<name>://{z}/{x}/{y}`.
   */
  tiles?: Record<string, TileRenderer>;
  /** Byte budget for decoded cells. */
  cellBudgetBytes?: number;
}

export interface DemSourceStats {
  residentCells: number;
  residentBytes: number;
  budgetBytes: number;
  /** Cells known to have no chunk. */
  absentCells: number;
}

/** The minimum a profile or a sight line needs. See profile.ts. */
export interface HeightSampler {
  /** Make sure the cells covering these points are resident. */
  warm(points: readonly { lon: number; lat: number }[]): Promise<void>;
  /** Height from resident cells only. NaN if the cell is not loaded. */
  heightAtLoaded(lon: number, lat: number): number;
}

export interface DemSourceHandle extends HeightSampler {
  readonly store: DemStore;
  readonly index: DemIndex;
  readonly tileSize: number;
  readonly maxZoom: number;
  /**
   * Lowest zoom tiles are served at. Put this in the style as the source's
   * `minzoom` — that is what stops MapLibre asking in the first place.
   */
  readonly minZoom: number;
  /** URL template for one of the registered protocols. */
  tileUrl(protocol: string): string;
  /** Protocol names this source serves. */
  readonly protocols: readonly string[];
  register(host: ProtocolHost): void;
  unregister(host: ProtocolHost): void;
  loadCell(cell: CellCoord): Promise<HeightGrid | null>;
  /** Height at a point, loading the cell if it is not resident. */
  heightAt(lon: number, lat: number): Promise<number>;
  /** Slope and aspect at a point, loading the cell if needed. */
  slopeAt(lon: number, lat: number): Promise<SlopeAspect>;
  prefetchAround(zoom: number, bounds: CellBounds): void;
  cancelPrefetch(): void;
  stats(): DemSourceStats;
  dispose(): void;
}

export async function createDemSource(options: DemSourceOptions = {}): Promise<DemSourceHandle> {
  if (!isConfigured()) {
    throw new Error(
      "decho-elevation: configureBasemap({ foundryUrl, getToken, platformClient }) " +
        "must run once at startup before a DEM source is created — it is what " +
        "holds the token and the origin every read goes through.",
    );
  }

  const store = options.store ?? defaultDemStore();
  const tileSize = options.tileSize ?? 256;
  const maxZoom = options.maxZoom ?? 12;
  const minZoom = options.minZoom ?? DEFAULT_MIN_ZOOM;
  const renderers = options.tiles ?? { "foundry-dem": terrariumTile };
  const cache = createCellCache(options.cellBudgetBytes ?? DEFAULT_CELL_BUDGET_BYTES);

  const index = await loadDemIndex(store);

  const pending = new Map<string, Promise<HeightGrid | null>>();
  const absentAt = new Map<string, number>();
  /** One constant PNG per protocol: every off-coverage tile is identical. */
  const emptyTiles = new Map<string, Promise<Uint8Array>>();

  // ── Cells ─────────────────────────────────────────────────────────────────

  const boundsOf = (cell: CellCoord) => cellBounds(index.grid, cell.col, cell.row);

  const loadCell = (cell: CellCoord): Promise<HeightGrid | null> => {
    const key = cellKey(cell.col, cell.row);

    const cached = cache.get(key);
    if (cached) {
      return Promise.resolve(cached);
    }

    // The manifest, when there is one, knows the answer without a round trip.
    // `undefined` means unknown, which is worth trying.
    if (index.has(cell) === false) {
      return Promise.resolve(null);
    }

    const absent = absentAt.get(key);
    if (absent !== undefined) {
      if (Date.now() - absent < MISSING_TTL_MS) {
        return Promise.resolve(null);
      }
      absentAt.delete(key);
    }

    const inFlight = pending.get(key);
    if (inFlight) {
      return inFlight;
    }

    const promise = (async () => {
      const path = index.pathFor(cell);
      try {
        // Deliberately unsignalled. A decoded cell is shared by every tile,
        // every sample and every sight line over 2° of the planet; letting one
        // aborted tile cancel it would throw away work the next tile needs
        // immediately. The byte layer already de-duplicates the transfer.
        const bytes = await getFileOptional(store.datasetRid, path);
        if (!bytes) {
          absentAt.set(key, Date.now());
          return null;
        }

        const codec = codecForPath(path, options.codecs);
        const grid = await codec.decode(bytes, boundsOf(cell), {
          nodata: index.nodata,
        });

        if (grid.width < 2 || grid.height < 2) {
          throw new Error(`decoded ${grid.width}x${grid.height}, which cannot be interpolated`);
        }

        cache.set(key, grid);
        return grid;
      } catch (err) {
        // Remembered as absent for the TTL: a chunk this reader cannot decode
        // will not become decodable in the next second, and retrying it per
        // tile turns one clear console warning into a hundred.
        absentAt.set(key, Date.now());
        console.warn(`[decho-elevation] could not load DEM cell ${key} (${path})`, err);
        return null;
      } finally {
        pending.delete(key);
      }
    })();

    pending.set(key, promise);
    return promise;
  };

  const warmCells = async (cells: readonly CellCoord[]): Promise<void> => {
    await Promise.all(cells.map((cell) => loadCell(cell)));
  };

  const warm = (points: readonly { lon: number; lat: number }[]) => {
    const seen = new Set<string>();
    const cells: CellCoord[] = [];
    for (const point of points) {
      const cell = cellFor(index.grid, point.lon, point.lat);
      const key = cellKey(cell.col, cell.row);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      cells.push(cell);
    }
    return warmCells(cells);
  };

  const residentGrid = (lon: number, lat: number): HeightGrid | undefined => {
    const cell = cellFor(index.grid, lon, lat);
    return cache.get(cellKey(cell.col, cell.row));
  };

  const heightAtLoaded = (lon: number, lat: number): number => {
    const grid = residentGrid(lon, lat);
    return grid ? sampleHeight(grid, lon, lat) : NaN;
  };

  const heightAt = async (lon: number, lat: number): Promise<number> => {
    const grid = await loadCell(cellFor(index.grid, lon, lat));
    return grid ? sampleHeight(grid, lon, lat) : NaN;
  };

  const slopeAtPoint = async (lon: number, lat: number): Promise<SlopeAspect> => {
    const grid = await loadCell(cellFor(index.grid, lon, lat));
    return grid ? slopeAt(grid, lon, lat) : { slope: NaN, aspect: NaN };
  };

  // ── Tiles ─────────────────────────────────────────────────────────────────

  const emptyTile = (protocol: string, renderer: TileRenderer, z: number) => {
    const existing = emptyTiles.get(protocol);
    if (existing) {
      return existing;
    }
    // An all-void frame renders identically at every zoom: terrarium writes sea
    // level, the tints write nothing. So the constant is cached per protocol.
    const heights = new Float32Array(tileSize * tileSize).fill(NaN);
    const promise = encodePng(
      renderer({
        heights,
        size: tileSize,
        z,
        x: 0,
        y: 0,
        metresPerPixel: metresPerPixel(z, 0, tileSize),
      }),
      tileSize,
      tileSize,
    );
    emptyTiles.set(protocol, promise);
    return promise;
  };

  const renderTile = async (
    protocol: string,
    renderer: TileRenderer,
    z: number,
    x: number,
    y: number,
  ): Promise<Uint8Array> => {
    // Below the floor, answer without touching a cell. The style's `minzoom`
    // should mean this never runs; it is here for a style that omits it, and
    // because the alternative failure is a stampede rather than a blank tile.
    if (z < minZoom) {
      return emptyTile(protocol, renderer, z);
    }

    const bounds = tileBounds(z, x, y);

    // A tile at or above the floor straddles at most four cells. Loaded
    // together, then sampled by whichever one contains each pixel — a gather,
    // so no seam can appear between them.
    const cells = cellsInBounds(index.grid, bounds);

    if (cells.length > MAX_CELLS_PER_TILE) {
      // A misconfigured floor, not a real request. Loud, because the symptom
      // otherwise is a tab that stops responding for reasons nothing explains.
      console.warn(
        `[decho-elevation] refusing tile ${z}/${x}/${y}: it covers ` +
          `${cells.length} DEM cells, which is more than ${MAX_CELLS_PER_TILE}. ` +
          `minZoom is ${minZoom}; raise it, or the source's minzoom is missing ` +
          "from the style.",
      );
      return emptyTile(protocol, renderer, z);
    }

    const grids = (await Promise.all(cells.map((cell) => loadCell(cell)))).filter(
      (grid): grid is HeightGrid => grid !== null,
    );

    if (grids.length === 0) {
      return emptyTile(protocol, renderer, z);
    }

    const sample = (lon: number, lat: number): number => {
      // Linear scan over at most four grids, and the first is the right one for
      // the overwhelming majority of pixels.
      for (const grid of grids) {
        if (
          lon >= grid.bounds.west &&
          lon <= grid.bounds.east &&
          lat >= grid.bounds.south &&
          lat <= grid.bounds.north
        ) {
          return sampleHeight(grid, lon, lat);
        }
      }
      return NaN;
    };

    const heights = resampleTile(z, x, y, tileSize, sample);
    const centreLat = (bounds.north + bounds.south) / 2;

    return encodePng(
      renderer({
        heights,
        size: tileSize,
        z,
        x,
        y,
        metresPerPixel: metresPerPixel(z, centreLat, tileSize),
      }),
      tileSize,
      tileSize,
    );
  };

  /**
   * Parse "<protocol>://z/x/y".
   *
   * Not a RegExp: the protocol name is a parameter, so the pattern would have
   * to be built at runtime from a non-literal — a ReDoS finding the scanner
   * rightly raises, and needless work on a path that runs for every tile.
   */
  const parseTileUrl = (url: string, protocol: string): [number, number, number] | null => {
    const prefix = `${protocol}://`;
    if (!url.startsWith(prefix)) {
      return null;
    }
    const parts = url.slice(prefix.length).split("/");
    if (parts.length < 3) {
      return null;
    }
    const z = Number(parts[0]);
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
      return null;
    }
    return [z, x, y];
  };

  // ── Prefetch ──────────────────────────────────────────────────────────────

  let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
  let prefetchGeneration = 0;

  const cancelPrefetch = (): void => {
    prefetchGeneration += 1;
    if (prefetchTimer !== null) {
      clearTimeout(prefetchTimer);
      prefetchTimer = null;
    }
  };

  const prefetchAround = (zoom: number, bounds: CellBounds): void => {
    cancelPrefetch();
    // One level below the floor, not the floor itself: the cells a zoom step
    // into the floor will draw are worth having decoded before the step, and
    // the floor is otherwise an abrupt edge where terrain appears seconds after
    // the camera arrives. Two levels out and it becomes the expensive kind of
    // pointless — see PREFETCH_LEAD_ZOOMS.
    if (zoom < minZoom - PREFETCH_LEAD_ZOOMS) {
      return;
    }

    // SPECULATION YIELDS TO DEMAND. Warming is competing for the same transfer
    // lane as the basemap's own archives and as the DEM tiles the view is
    // actually waiting on, and a 2° cell is 3-25 MB — so starting one while
    // that lane is full delays something a user is looking at in order to
    // fetch something they may never look at. The next view change calls this
    // again; there is no need to queue.
    //
    // The basemap's prefetch makes the same bargain against MEMORY. This is
    // the concurrency half of it.
    const lane = getLaneStats().large;
    if (lane.active >= lane.limit || lane.queued > 0) {
      return;
    }

    const generation = prefetchGeneration;
    const candidates = cellsInBounds(index.grid, bounds, 1).filter((cell) => {
      const key = cellKey(cell.col, cell.row);
      return (
        !cache.has(key) && !pending.has(key) && !absentAt.has(key) && index.has(cell) !== false
      );
    });
    if (candidates.length === 0) {
      return;
    }

    // Nearest to the centre first: it is the one about to be looked at.
    const centre = cellFor(
      index.grid,
      (bounds.west + bounds.east) / 2,
      (bounds.north + bounds.south) / 2,
    );
    candidates.sort(
      (a, b) =>
        (a.col - centre.col) ** 2 +
        (a.row - centre.row) ** 2 -
        ((b.col - centre.col) ** 2 + (b.row - centre.row) ** 2),
    );

    const targets: CellCoord[] = [];
    let budget = PREFETCH_BYTE_BUDGET;
    for (const cell of candidates) {
      if (targets.length >= MAX_PREFETCH_CELLS) {
        break;
      }
      const size = index.bytesFor(cell);
      if (size === undefined) {
        // Undeclared size — which is every cell until a manifest exists. Take
        // one and stop, so an unknown cell can never be mistaken for a free
        // one.
        if (targets.length === 0) {
          targets.push(cell);
        }
        break;
      }
      if (size > budget) {
        continue;
      }
      budget -= size;
      targets.push(cell);
    }

    // Debounced rather than fired on the event: MapLibre emits moveend and
    // zoomend for one gesture, and a DEM cell is far too expensive to speculate
    // on twice.
    prefetchTimer = setTimeout(() => {
      prefetchTimer = null;
      void (async () => {
        for (const cell of targets) {
          if (generation !== prefetchGeneration) {
            return;
          }
          // Sequential on purpose: one speculative 20 MB download at a time
          // leaves the lanes free for the tiles actually on screen.
          await loadCell(cell).catch(() => null);
        }
      })();
    }, 400);
  };

  // ── Protocols ─────────────────────────────────────────────────────────────

  const protocols = Object.keys(renderers);
  let registrations = 0;

  return {
    store,
    index,
    tileSize,
    maxZoom,
    minZoom,
    protocols,

    tileUrl(protocol) {
      if (!(protocol in renderers)) {
        throw new Error(
          `decho-elevation: this DEM source serves no protocol "${protocol}" ` +
            `(it has ${protocols.map((p) => `"${p}"`).join(", ")})`,
        );
      }
      return `${protocol}://{z}/{x}/{y}`;
    },

    register(host) {
      // Counted, not flagged, for the reason the basemap's tile source
      // documents: protocols are global to MapLibre but the components
      // registering them are not, React StrictMode double-mounts in
      // development, and with a boolean the first unmount removes the protocol
      // out from under every other live map.
      registrations += 1;
      if (registrations > 1) {
        return;
      }

      for (const [protocol, renderer] of Object.entries(renderers)) {
        host.addProtocol(protocol, async ({ url }) => {
          const parsed = parseTileUrl(url, protocol);
          if (!parsed) {
            // Not an empty buffer: for a raster source that is not a decodable
            // image, and MapLibre's error for it says nothing about the cause.
            throw new Error(`decho-elevation: unparseable tile URL "${url}"`);
          }
          const [z, x, y] = parsed;
          const png = await renderTile(protocol, renderer, z, x, y);
          // A fresh ArrayBuffer: MapLibre may transfer it to a worker, and a
          // view onto a shared buffer would take the neighbours with it.
          return {
            data: png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
          };
        });
      }
    },

    unregister(host) {
      if (registrations === 0) {
        return;
      }
      registrations -= 1;
      if (registrations > 0) {
        return;
      }

      cancelPrefetch();
      for (const protocol of protocols) {
        try {
          host.removeProtocol(protocol);
        } catch {
          /* already gone during teardown */
        }
      }
    },

    loadCell,
    warm,
    heightAt,
    heightAtLoaded,
    slopeAt: slopeAtPoint,
    prefetchAround,
    cancelPrefetch,

    stats: () => ({
      residentCells: cache.size,
      residentBytes: cache.bytes,
      budgetBytes: cache.budget,
      absentCells: absentAt.size,
    }),

    dispose() {
      cancelPrefetch();
      cache.clear();
      pending.clear();
      emptyTiles.clear();
    },
  };
}

/**
 * Cells under a straight line — re-exported at this level because it is what a
 * caller warming a route wants, and it saves them importing the grid module to
 * do it.
 */
export function cellsUnderLine(
  source: DemSourceHandle,
  from: { lon: number; lat: number },
  to: { lon: number; lat: number },
): CellCoord[] {
  return cellsAlongLine(source.index.grid, from, to);
}
