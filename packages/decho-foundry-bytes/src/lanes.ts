/**
 * Concurrency lanes for transfers.
 *
 * MapLibre asks for a screenful of tiles at once, and at z12 each distinct cell
 * is a separate 10-55 MB archive. Left unbounded that fans out into many large
 * simultaneous transfers; bounded too tightly, everything queues behind the
 * slowest one.
 *
 * WHY TWO LANES RATHER THAN ONE
 * -----------------------------
 * A single gate scheduled 25 MB archives and 20 KB glyph ranges as though they
 * were the same thing. Two archive downloads filled it, so the glyphs for tiles
 * already on screen waited behind them and labels popped in visibly late,
 * despite costing a thousandth of the bytes.
 *
 * WHY THE ARCHIVE LIMIT IS 4 AND NOT 2
 * ------------------------------------
 * The original value cited the browser's ~6-connections-per-origin cap. That is
 * an HTTP/1.1 constraint; Foundry serves HTTP/2, which multiplexes these over a
 * single connection, so sockets were never the binding limit — bandwidth share
 * and time-to-first-tile are.
 *
 * Extracted from bytes.ts to be testable: queueing and release ordering are
 * exactly the kind of thing that looks obviously correct and is not.
 */

export interface LaneStats {
  active: number;
  queued: number;
  limit: number;
}

export interface Lane {
  readonly name: string;
  acquire(): Promise<void>;
  release(): void;
  readonly stats: LaneStats;
}

export function createLane(name: string, limit: number): Lane {
  let active = 0;
  const queue: Array<() => void> = [];

  return {
    name,

    acquire() {
      if (active < limit) {
        active += 1;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        queue.push(() => {
          active += 1;
          resolve();
        });
      });
    },

    release() {
      // Guard against over-release: a double release would let `active` go
      // negative and quietly raise the effective limit forever.
      if (active === 0) {return;}
      active -= 1;
      const next = queue.shift();
      if (next) {next();}
    },

    get stats() {
      return { active, queued: queue.length, limit };
    },
  };
}

/** Multi-megabyte bodies: few, large, and the reason the gate exists. */
export const LARGE_LANE_LIMIT = 4;

/** Glyphs, sprite sheets, manifests, metadata: many, tiny, latency-sensitive. */
export const SMALL_LANE_LIMIT = 6;

/**
 * Size class by extension. Crude on purpose: a misclassification costs
 * scheduling order, never correctness.
 *
 * Three kinds of large body use this layer today, and each arrived from a
 * package that did not exist when the previous list was written:
 *
 *   .pmtiles   a basemap archive, or a cell of traced contours: 10-55 MB
 *   .tif       a DEM cell or a baked hillshade cell: 3-25 MB
 *   .bin       a pathfinding cell's nodes and edges: a few MB
 *
 * The rule is SIZE CLASS, not file format. `.tif` is on the list because it
 * fell through to the small lane once, which put half a dozen multi-megabyte
 * transfers in the lane sized six wide for 20 KB glyphs — so the labels for
 * tiles already on screen queued behind them. That is the exact failure the
 * two lanes exist to prevent, and it is the reason to add a type here the
 * day a package starts streaming it rather than the day someone notices.
 *
 * An application whose large files are named something else supplies its own
 * classifier through `configureFoundryBytes({ isLargeFile })`.
 */
const LARGE_FILE = /\.(pmtiles|tiff?|bin)$/i;
export function isLargeFilePath(filePath: string): boolean {
  return LARGE_FILE.test(filePath);
}
