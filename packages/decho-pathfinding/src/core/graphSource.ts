/**
 * The stitched world: which cells are loaded, how they join, and how the search
 * walks them.
 *
 * WHAT THIS REUSES RATHER THAN REBUILDS
 * -------------------------------------
 * Nothing here fetches. Every read goes through @acc/decho-foundry-bytes,
 * which already owns the access token and its refresh-on-401, the resident
 * LRU, Cache Storage keyed by dataset transaction RID (so a cell is downloaded
 * once per user, ever), request de-duplication with refcounted cancellation,
 * and the concurrency lanes. A pathfinding package that fetched for itself
 * would reimplement all of that and share none of it.
 *
 * That package is the bottom of the stack and knows nothing about maps, so an
 * app with a basemap shares one cache and one set of lanes across tiles and
 * graph cells, and an app without one — a worker, a Function, a planner with no
 * map at all — pays for neither.
 *
 * WHY GLOBAL NODE IDS ARE PACKED INTEGERS
 * ---------------------------------------
 * The search's open set, came-from chain and closed set are keyed by node. With
 * several cells resident, a node needs a (cell, index) pair — and a string key
 * like "c012_r034:8817" would put string hashing and megabytes of garbage on
 * the hottest loop in the package.
 *
 * Instead each resident cell holds a SLOT, and a node's global id is
 * `slot << 22 | localIndex`: one 31-bit integer, cheap in a Map, and packable
 * into the heap's Int32Array. Slots are recycled on eviction, which also means
 * the id space does not grow over a long session.
 *
 * WHY LOCAL INDICES SURVIVE EVICTION
 * ----------------------------------
 * A cell's node ordering is a property of its file, so reloading a cell yields
 * the same local indices. Stitch links are therefore stored as
 * (neighbour cell KEY, local index) rather than as global ids, and stay valid
 * across an eviction and reload of either side.
 */

import { getFile, getFileOptional } from "@acc/decho-foundry-bytes";

import { createLoadedCell, type LoadedCell } from "./cell.js";
import { MalformedGraphError, NoGraphDataError } from "./errors.js";
import { parseCellGraph, type CellMeta } from "./format.js";
import {
  SIDES,
  cellFor,
  cellKey,
  gridMismatch,
  neighbourCell,
  type CellCoord,
  type Side,
} from "./grid.js";
import { defaultGraphStore, type GraphStore } from "./defaults.js";
import {
  stitchCells,
  type StitchLink,
  type StitchOptions,
} from "./stitch.js";

/**
 * Bits reserved for a node's index within its cell: 4 194 304 nodes.
 *
 * Exported because the search uses it to tell, in one shift, whether a
 * neighbour lies in a different cell — which is how it enforces its cell
 * budget without a lookup per edge.
 */
export const NODE_SLOT_BITS = 22;
const SLOT_BITS = NODE_SLOT_BITS;
const LOCAL_MASK = (1 << SLOT_BITS) - 1;
/** Slots × 2^22 must stay inside a signed 32-bit integer. */
const MAX_SLOTS = 1 << 9;

export const MAX_NODES_PER_CELL = 1 << SLOT_BITS;

export type CellStatus = "loading" | "ready" | "missing" | "error";
export type CellStatusListener = (cell: string, status: CellStatus) => void;

export interface GraphSourceOptions {
  store?: GraphStore;
  /** Parsed cells held resident. Each is a few MB. */
  maxResidentCells?: number;
  /** Ceiling on parsed bytes. Separate from the byte layer's raw-body budget. */
  memoryBudgetBytes?: number;
  /** How long a cell with no data is remembered as absent. */
  missingTtlMs?: number;
  stitch?: StitchOptions;
}

export interface GraphSourceStats {
  residentCells: number;
  residentBytes: number;
  knownMissing: number;
  stitchLinks: number;
}

/** Called for each neighbour of a node during expansion. */
export type NeighbourVisitor = (
  neighbour: number,
  distM: number,
  slope: number,
  terrain: number,
) => void;

export interface GraphSource {
  readonly store: GraphStore;
  /**
   * How many parsed cells stay resident.
   *
   * A search packs cell slots into node ids, so a cell evicted MID-SEARCH
   * would invalidate ids already in the open set. findRoute therefore clamps
   * its own cell budget to this number, which is why it is on the interface
   * rather than private to the implementation.
   */
  readonly maxResidentCells: number;
  /** Load a cell, or null when the dataset has no graph there. */
  ensureCell(
    cell: CellCoord,
    signal?: AbortSignal,
  ): Promise<LoadedCell | null>;
  /** Resident cell, without loading. */
  peekCell(cell: CellCoord): LoadedCell | null;
  /** Warm cells in the background, nearest first. Cancels any previous run. */
  prefetch(cells: CellCoord[]): void;
  cancelPrefetch(): void;
  /** Cell containing a point, loading it if necessary. */
  cellAt(lon: number, lat: number, signal?: AbortSignal): Promise<LoadedCell>;
  /** Global id -> resident cell, or null if its slot has been recycled. */
  cellOf(node: number): LoadedCell | null;
  nodeLon(node: number): number;
  nodeLat(node: number): number;
  /** Intra-cell edges followed by cross-cell stitch links. */
  forEachNeighbour(node: number, visit: NeighbourVisitor): void;
  /**
   * Neighbouring cells this node's expansion needs and that are not loaded
   * yet. Empty for the interior of a cell, which is almost every node.
   */
  pendingNeighbourCells(node: number): CellCoord[];
  /**
   * Protect a cell from eviction while a search is walking it.
   *
   * Node ids embed a cell's SLOT, so evicting a cell mid-search invalidates
   * every id already in the open set — a corruption that would surface as a
   * wrong route rather than an error. Prefetch and searching can together want
   * more cells than stay resident, so the search pins what it is using and
   * unpins in a finally. Refcounted, because two searches can overlap.
   */
  pin(cell: string): void;
  unpin(cell: string): void;
  onStatus(listener: CellStatusListener): () => void;
  stats(): GraphSourceStats;
  /** Drop every parsed cell. Does not touch the byte layer's caches. */
  clear(): void;
}

interface ResidentCell {
  cell: LoadedCell;
  slot: number;
  /** other cell key -> (local node -> links into that cell). */
  stitch: Map<string, Map<number, StitchLink[]>>;
  bytes: number;
}

export function createGraphSource(
  options: GraphSourceOptions = {},
): GraphSource {
  const store = options.store ?? defaultGraphStore();
  const grid = store.grid;
  const pathTemplate = store.pathTemplate ?? "pathfinding/{cell}";
  const maxResidentCells = Math.min(
    MAX_SLOTS - 1,
    options.maxResidentCells ?? 24,
  );
  const memoryBudgetBytes = options.memoryBudgetBytes ?? 96 * 1024 * 1024;
  const missingTtlMs = options.missingTtlMs ?? 5 * 60 * 1000;
  const stitchOptions = options.stitch ?? {};

  /** Insertion-ordered, oldest first — the same LRU trick tileSource.ts uses. */
  const resident = new Map<string, ResidentCell>();
  const slots: Array<ResidentCell | null> = new Array(MAX_SLOTS).fill(null);
  const freeSlots: number[] = [];
  for (let s = MAX_SLOTS - 1; s >= 0; s--) {freeSlots.push(s);}

  const pending = new Map<string, Promise<LoadedCell | null>>();
  const missingAt = new Map<string, number>();
  /** cell key -> how many searches are holding it. See pin(). */
  const pinned = new Map<string, number>();
  const stitchedPairs = new Set<string>();
  const listeners = new Set<CellStatusListener>();

  let residentBytes = 0;
  let stitchLinks = 0;
  let prefetchController: AbortController | null = null;

  const notify = (key: string, status: CellStatus) =>
    listeners.forEach((listener) => listener(key, status));

  const pathFor = (key: string, file: string) =>
    `${pathTemplate.replace("{cell}", key)}/${file}`;

  const touch = (key: string): ResidentCell | undefined => {
    const hit = resident.get(key);
    if (!hit) {return undefined;}
    resident.delete(key);
    resident.set(key, hit);
    return hit;
  };

  const evict = (key: string): void => {
    const victim = resident.get(key);
    if (!victim) {return;}
    resident.delete(key);
    slots[victim.slot] = null;
    freeSlots.push(victim.slot);
    residentBytes -= victim.bytes;
    for (const links of victim.stitch.values()) {
      for (const list of links.values()) {stitchLinks -= list.length;}
    }
    // Every pair this cell took part in must be forgotten, so that a reload
    // re-stitches rather than leaving the join one-directional: the surviving
    // side still holds its links, but the evicted side's were dropped above.
    for (const pair of [...stitchedPairs]) {
      if (pair.includes(key)) {stitchedPairs.delete(pair);}
    }
  };

  const admit = (rc: ResidentCell): void => {
    resident.set(rc.cell.key, rc);
    slots[rc.slot] = rc;
    residentBytes += rc.bytes;

    while (
      resident.size > maxResidentCells ||
      (residentBytes > memoryBudgetBytes && resident.size > 1)
    ) {
      // Oldest first, but never the cell just admitted and never one a search
      // is holding. If everything left is pinned, the budget is exceeded until
      // that search finishes — the correct trade, since the alternative is
      // invalidating ids it is still using.
      let victim: string | null = null;
      for (const key of resident.keys()) {
        if (key === rc.cell.key) {continue;}
        if (pinned.has(key)) {continue;}
        victim = key;
        break;
      }
      if (!victim) {break;}
      evict(victim);
    }
  };

  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  /** Join a newly resident cell to whichever of its four neighbours are loaded. */
  const stitchNeighbours = (rc: ResidentCell): void => {
    for (const side of SIDES) {
      const coord = neighbourCell(rc.cell, side);
      const other = resident.get(cellKey(coord.col, coord.row));
      if (!other) {continue;}
      const pair = pairKey(rc.cell.key, other.cell.key);
      if (stitchedPairs.has(pair)) {continue;}
      stitchedPairs.add(pair);

      const result = stitchCells(rc.cell, side, other.cell, stitchOptions);
      if (result.linkCount === 0) {continue;}
      rc.stitch.set(other.cell.key, result.forward);
      other.stitch.set(rc.cell.key, result.backward);
      stitchLinks += result.linkCount * 2;
    }
  };

  const decodeMeta = (
    key: string,
    buffer: ArrayBuffer,
    coord: CellCoord,
  ): CellMeta => {
    let meta: CellMeta;
    try {
      meta = JSON.parse(new TextDecoder().decode(buffer)) as CellMeta;
    } catch (err) {
      throw new MalformedGraphError(key, `meta.json is not valid JSON: ${String(err)}`);
    }

    // The cut is shared with the basemap by convention. Check the convention.
    const mismatch = gridMismatch(grid, coord, meta.bbox);
    if (mismatch) {throw new MalformedGraphError(key, mismatch, { bbox: meta.bbox });}

    if (meta.nodeCount >= MAX_NODES_PER_CELL) {
      throw new MalformedGraphError(
        key,
        `cell has ${meta.nodeCount} nodes, above the ${MAX_NODES_PER_CELL} this ` +
          "id packing allows (see SLOT_BITS)",
        { nodeCount: meta.nodeCount },
      );
    }
    // The cell names itself; trust the coordinates we asked for if it does not.
    return { ...meta, cell: key, col: coord.col, row: coord.row };
  };

  const loadCell = async (
    coord: CellCoord,
    key: string,
    signal?: AbortSignal,
  ): Promise<LoadedCell | null> => {
    notify(key, "loading");

    const metaBuffer = await getFileOptional(
      store.datasetRid,
      pathFor(key, "meta.json"),
      signal,
    );
    // Absence is ordinary: the cut only contains cells with routable terrain,
    // and most of the planet is ocean. Same reasoning as the basemap's empty
    // tiles — an exception per open-water click would be absurd.
    if (!metaBuffer) {
      missingAt.set(key, Date.now());
      notify(key, "missing");
      return null;
    }

    const meta = decodeMeta(key, metaBuffer, coord);

    // meta.json existing while the bodies do not is a broken chunk, not an
    // absent one, so these use getFile and are allowed to throw.
    const [nodeBuffer, edgeBuffer] = await Promise.all([
      getFile(store.datasetRid, pathFor(key, "nodes.bin"), signal),
      getFile(store.datasetRid, pathFor(key, "edges.bin"), signal),
    ]);

    const graph = parseCellGraph(meta, nodeBuffer, edgeBuffer);

    const slot = freeSlots.pop();
    if (slot === undefined) {
      // Unreachable: maxResidentCells is clamped below MAX_SLOTS and eviction
      // returns slots. Explicit anyway, because silently reusing a live slot
      // would corrupt every id in flight.
      throw new Error("decho-pathfinding: no free cell slot");
    }

    const rc: ResidentCell = {
      cell: createLoadedCell(graph, slot << SLOT_BITS),
      slot,
      stitch: new Map(),
      bytes: graph.bytes,
    };

    admit(rc);
    stitchNeighbours(rc);
    notify(key, "ready");
    return rc.cell;
  };

  const ensureCell: GraphSource["ensureCell"] = (coord, signal) => {
    const key = cellKey(coord.col, coord.row);

    const hit = touch(key);
    if (hit) {return Promise.resolve(hit.cell);}

    const missing = missingAt.get(key);
    if (missing !== undefined) {
      if (Date.now() - missing < missingTtlMs) {return Promise.resolve(null);}
      missingAt.delete(key);
    }

    const inFlight = pending.get(key);
    if (inFlight) {return inFlight;}

    const promise = loadCell(coord, key, signal)
      .catch((err) => {
        // A cancelled load is not a failed one — leave the cell eligible.
        if (err instanceof Error && err.name === "AbortError") {throw err;}
        notify(key, "error");
        throw err;
      })
      .finally(() => {
        pending.delete(key);
      });

    pending.set(key, promise);
    return promise;
  };

  const peekCell: GraphSource["peekCell"] = (coord) =>
    resident.get(cellKey(coord.col, coord.row))?.cell ?? null;

  const residentOf = (node: number): ResidentCell | null =>
    slots[node >>> SLOT_BITS] ?? null;

  return {
    store,
    maxResidentCells,

    ensureCell,
    peekCell,

    async cellAt(lon, lat, signal) {
      const coord = cellFor(grid, lon, lat);
      const cell = await ensureCell(coord, signal);
      if (!cell) {throw new NoGraphDataError(lon, lat);}
      return cell;
    },

    cellOf: (node) => residentOf(node)?.cell ?? null,

    nodeLon(node) {
      const rc = residentOf(node);
      return rc ? rc.cell.graph.lon[node & LOCAL_MASK] : NaN;
    },

    nodeLat(node) {
      const rc = residentOf(node);
      return rc ? rc.cell.graph.lat[node & LOCAL_MASK] : NaN;
    },

    forEachNeighbour(node, visit) {
      const rc = residentOf(node);
      if (!rc) {return;}
      const local = node & LOCAL_MASK;
      const { offsets, edgeTo, edgeDist, edgeSlope, edgeTerrain } = rc.cell.graph;

      for (let e = offsets[local]; e < offsets[local + 1]; e++) {
        visit(
          rc.cell.base + edgeTo[e],
          edgeDist[e],
          edgeSlope[e],
          edgeTerrain[e],
        );
      }

      // Only border nodes can have cross-cell links, and they are a thin
      // fraction of a cell — so the common case pays one array read.
      if (rc.cell.borderMask[local] === 0 || rc.stitch.size === 0) {return;}
      for (const [otherKey, byNode] of rc.stitch) {
        const links = byNode.get(local);
        if (!links) {continue;}
        const other = resident.get(otherKey);
        if (!other) {continue;}
        for (const link of links) {
          visit(
            other.cell.base + link.toLocal,
            link.distM,
            link.slope,
            link.terrain,
          );
        }
      }
    },

    pendingNeighbourCells(node) {
      const rc = residentOf(node);
      if (!rc) {return [];}
      const mask = rc.cell.borderMask[node & LOCAL_MASK];
      if (mask === 0) {return [];}

      const out: CellCoord[] = [];
      for (const side of SIDES) {
        if ((mask & (1 << (side as Side))) === 0) {continue;}
        const coord = neighbourCell(rc.cell, side);
        const key = cellKey(coord.col, coord.row);
        if (resident.has(key)) {continue;}
        if (missingAt.has(key)) {continue;}
        out.push(coord);
      }
      return out;
    },

    prefetch(cells) {
      prefetchController?.abort();
      if (cells.length === 0) {return;}
      const controller = new AbortController();
      prefetchController = controller;

      void (async () => {
        for (const coord of cells) {
          if (controller.signal.aborted) {return;}
          // Sequential on purpose, exactly as the basemap prefetches archives:
          // one speculative transfer at a time leaves the lanes free for the
          // cell the search is actually blocked on. These joins are refcounted
          // in the byte layer, so abandoning a prefetch cannot cancel a load a
          // real query has since joined.
          await ensureCell(coord, controller.signal).catch(() => null);
        }
      })();
    },

    cancelPrefetch() {
      prefetchController?.abort();
      prefetchController = null;
    },

    pin(cell) {
      pinned.set(cell, (pinned.get(cell) ?? 0) + 1);
    },

    unpin(cell) {
      const held = pinned.get(cell);
      if (held === undefined) {return;}
      if (held <= 1) {pinned.delete(cell);}
      else {pinned.set(cell, held - 1);}
    },

    onStatus(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    stats: () => ({
      residentCells: resident.size,
      residentBytes,
      knownMissing: missingAt.size,
      stitchLinks,
    }),

    clear() {
      // Deliberately ignores pins: clear() is an explicit reset, and a caller
      // that runs it during a search has already decided that search is over.
      pinned.clear();
      for (const key of [...resident.keys()]) {evict(key);}
      missingAt.clear();
      stitchedPairs.clear();
      stitchLinks = 0;
    },
  };
}
