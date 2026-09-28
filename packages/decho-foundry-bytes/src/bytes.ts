/**
 * foundryBytes — the single byte-access layer for Foundry dataset files.
 *
 * Everything that reads bytes out of a Foundry dataset goes through here:
 * PMTiles archives, glyph PBFs, sprite sheets, terrain rasters, graph tiles.
 * One place owns the auth token, the URL shape, retry-on-401, and both cache
 * tiers.
 *
 * WHY THIS EXISTS RATHER THAN OSDK `Files.content`
 * ------------------------------------------------
 * `Files.content()` resolves to a Blob and gives no way to set a `Range`
 * header. Ranged reads therefore go through `fetch()` directly — but the host
 * always comes from the same meta tag the OSDK clients use, never a hardcoded
 * enrollment host.
 *
 * TRANSFER MODE (measured, not assumed)
 * -------------------------------------
 * A SINGLE shared probe (settleRangeMode) resolves Range support before any
 * ranged read is allowed through:
 *
 *   206 Partial Content -> "ranged"     — stream byte ranges
 *   200 OK              -> "whole-file" — server ignored Range; cache the full
 *                                        buffer and slice locally
 *
 * Measured 2026-08-27 on the accenture enrollment: **200, not 206**. Foundry's
 * file-content endpoint does not honour Range, so we are on the whole-file path
 * and the basemap stays pre-chunked into per-cell archives. The probe is kept
 * because it costs nothing and will light up for free if that ever changes.
 *
 * CACHING — TWO TIERS
 * -------------------
 * Because whole files are the transfer unit, caching is what makes this
 * comfortable rather than painful.
 *
 *   Tier 1 — in-memory LRU with a hard byte budget (MEMORY_BUDGET_BYTES).
 *     Previously this map was unbounded and nothing was ever evicted, so a long
 *     session accumulated every archive it had touched until the tab died.
 *
 *   Tier 2 — Cache Storage, keyed by dataset transaction RID.
 *     Dataset files are immutable within a transaction, so a cached body can
 *     never go stale: a rebuild produces a new transaction RID, which produces
 *     a new key, and the old entries are pruned. This means a given archive is
 *     downloaded once *ever* per user rather than once per session, and an
 *     evicted Tier 1 entry usually costs a disk read rather than a re-download.
 *
 * Both tiers degrade safely. If Cache Storage is unavailable (non-secure
 * context) or the transaction RID cannot be resolved, persistence is skipped
 * and only Tier 1 applies.
 */

import { Branches } from "@osdk/foundry.datasets";
import { MediaSets } from "@osdk/foundry.mediasets";

import { access, foundryOrigin } from "./config";
import { createResidentCache } from "./lru";
import { createBrowserPersistentCache } from "./persistentCache";
import { createInFlightMap, abortError } from "./inflight";
import {
  LARGE_LANE_LIMIT,
  SMALL_LANE_LIMIT,
  createLane,
  isLargeFilePath,
  type Lane,
  type LaneStats,
} from "./lanes";
import {
  FoundryMalformedRequestError,
  errorForResponse,
} from "./errors";

// ── Tuning ──────────────────────────────────────────────────────────────────

/**
 * Ceiling for resident file bodies. Basemap cells are a few MB each, so this
 * holds a comfortable working set while leaving room for MapLibre's own tile
 * and texture memory. Eviction is least-recently-used.
 */
const MEMORY_BUDGET_BYTES = 128 * 1024 * 1024;


/** Synthetic origin for Cache Storage keys. Never actually requested. */
const CACHE_KEY_ORIGIN = "https://foundry-bytes.local";

// ── Range capability ────────────────────────────────────────────────────────

export type RangeMode = "probing" | "ranged" | "whole-file";

let rangeMode: RangeMode = "probing";

/** Which transfer mode we resolved to. "probing" until the first ranged read. */
export function getRangeMode(): RangeMode {
  return rangeMode;
}

/** Force whole-file mode, skipping the probe. For testing the fallback path. */
export function forceWholeFileMode(): void {
  rangeMode = "whole-file";
}

/**
 * Resolve the transfer mode with exactly ONE request, shared by every caller.
 *
 * WHY THIS IS NOT JUST AN IF-STATEMENT IN getRange
 * ------------------------------------------------
 * `rangeMode` resets on every page load, and the ranged branch of getRange is
 * the one path in this module with neither in-flight dedupe nor the
 * concurrency gate — deliberately, because a real 206 is a few KB and
 * serialising those would be absurd.
 *
 * But while the mode is still "probing" we do not yet know the response is
 * small. MapLibre asks for a screenful of tiles at once; PMTiles turns each
 * into a getBytes call; every one of those took the ranged branch and every
 * one was answered with `200` and a FULL COPY of the same 10-25 MB archive.
 * ~20 concurrent full downloads of one file, on every cold load, before the
 * first response landed and flipped the mode.
 *
 * Settling the mode behind a single shared promise closes that window: the
 * first caller probes, everyone else awaits the same promise and then takes
 * the deduped, gated whole-file path.
 *
 * Callers can also settle it early against a file they know is small (see
 * globeMap/tiles.ts::settleTransferMode) so the probe never lands on an
 * archive in the first place.
 */
let probePromise: Promise<RangeMode> | null = null;

export function settleRangeMode(
  datasetRid: string,
  filePath: string,
): Promise<RangeMode> {
  if (rangeMode !== "probing") {return Promise.resolve(rangeMode);}
  if (!probePromise) {
    probePromise = probeRangeSupport(datasetRid, filePath).catch((err) => {
      // A failed probe must not wedge the app. Whole-file is the conservative
      // answer: it is deduped, gated and cached, so the cost of being wrong
      // is latency rather than a flood of requests.
       
      console.warn(
        "[foundryBytes] range probe failed; assuming whole-file transfers",
        err,
      );
      if (rangeMode === "probing") {rangeMode = "whole-file";}
      return rangeMode;
    });
  }
  return probePromise;
}

/**
 * Deliberately takes no AbortSignal. The conclusion is process-wide and
 * shared, so letting one caller's cancellation decide it — or worse, turn an
 * AbortError into "Range unsupported" — would be a bug for everyone else.
 */
async function probeRangeSupport(
  datasetRid: string,
  filePath: string,
): Promise<RangeMode> {
  const lane = laneFor(filePath);
  await acquireSlot(lane);
  try {
    const response = await authorisedFetch(contentUrl(datasetRid, filePath), {
      method: "GET",
      headers: { Range: "bytes=0-15" },
    });

    if (response.status === 206) {
      rangeMode = "ranged";
       
      console.info(
        "[foundryBytes] HTTP Range supported (206) — streaming byte ranges.",
      );
      await response.arrayBuffer(); // drain so the connection is reusable
      return rangeMode;
    }

    if (response.status === 200) {
      rangeMode = "whole-file";
       
      console.warn(
        "[foundryBytes] HTTP Range NOT supported (got 200, expected 206) — " +
          "using whole-file downloads with LRU + Cache Storage.",
      );
      // The server sent the whole file whether we wanted it or not. Keep it:
      // the caller that triggered the probe is about to ask for these bytes,
      // and discarding them buys a second full download.
      const body = await response.arrayBuffer();
      const key = cacheKey(datasetRid, filePath);
      if (!resident.has(key)) {
        resident.set(key, body);
        void writePersistent(datasetRid, filePath, body);
      }
      return rangeMode;
    }

    throw errorForResponse(
      response.status,
      response.statusText,
      datasetRid,
      filePath,
    );
  } finally {
    releaseSlot(lane);
  }
}

// ── Tier 1: in-memory LRU ───────────────────────────────────────────────────
//
// The cache, the lanes and the refcounted in-flight map all used to live here
// as module-level variables and private functions, which meant the three
// trickiest pieces of arithmetic in the package — eviction, queue release and
// waiter counting — could not be tested without a network and a browser. They
// are now separate modules with their own tests; this file wires them
// together and owns the Foundry-specific parts.

const resident = createResidentCache(MEMORY_BUDGET_BYTES);
const inFlight = createInFlightMap<ArrayBuffer | null>();

function cacheKey(datasetRid: string, filePath: string): string {
  return `${datasetRid}::${filePath}`;
}

/** Drop all resident bodies. Does not touch the persistent tier. */
export function clearFileCache(): void {
  resident.clear();
  inFlight.clear();
}

/** Current resident size, for diagnostics. */
export function getResidentBytes(): number {
  return resident.bytes;
}

/**
 * The resident ceiling. Exposed so speculative callers (prefetch) can back off
 * before they start evicting the tiles the user is actually looking at.
 */
export function getMemoryBudgetBytes(): number {
  return MEMORY_BUDGET_BYTES;
}

// ── Tier 2: Cache Storage, keyed by transaction RID ─────────────────────────
//
// Dataset files are immutable within a transaction, so a cached body can never
// go stale: a rebuild produces a new transaction RID, which produces a new key,
// and the old entries are pruned. A given archive is therefore downloaded once
// per user, ever — not once per session.
//
// The budget, eviction and quota handling live in ./persistentCache; this file
// owns only the Foundry-specific part, which is working out the transaction RID
// that makes a key immutable.

const persistent = createBrowserPersistentCache();

/** datasetRid -> current transaction RID (or null if unresolvable). */
const transactionRids = new Map<string, Promise<string | null>>();

function resolveTransactionRid(datasetRid: string): Promise<string | null> {
  const existing = transactionRids.get(datasetRid);
  if (existing) {return existing;}

  const pending = (async () => {
    try {
      const branch = await Branches.get(
        access().platformClient,
        datasetRid,
        "master",
      );
      return branch.transactionRid ?? null;
    } catch {
      // Not fatal: without a transaction RID we simply skip persistence rather
      // than risk serving bytes from a superseded build.
      return null;
    }
  })();

  transactionRids.set(datasetRid, pending);
  void pending.then((rid) => {
    if (rid) {void pruneStaleEntries(datasetRid, rid);}
  });
  return pending;
}

function persistentKey(
  datasetRid: string,
  transactionRid: string,
  filePath: string,
): string {
  return `${CACHE_KEY_ORIGIN}/${encodeURIComponent(
    datasetRid,
  )}/${encodeURIComponent(transactionRid)}/${encodeURIComponent(filePath)}`;
}


/**
 * Remove persisted bodies for this dataset that belong to a superseded
 * transaction. Runs once per dataset per session, off the hot path.
 */
async function pruneStaleEntries(
  datasetRid: string,
  currentTransactionRid: string,
): Promise<void> {
  const prefix = `${CACHE_KEY_ORIGIN}/${encodeURIComponent(datasetRid)}/`;
  await persistent.prune(
    prefix,
    `${prefix}${encodeURIComponent(currentTransactionRid)}/`,
  );
}

async function readPersistent(
  datasetRid: string,
  filePath: string,
): Promise<ArrayBuffer | null> {
  const transactionRid = await resolveTransactionRid(datasetRid);
  if (!transactionRid) {return null;}
  return persistent.read(persistentKey(datasetRid, transactionRid, filePath));
}

async function writePersistent(
  datasetRid: string,
  filePath: string,
  body: ArrayBuffer,
): Promise<void> {
  const transactionRid = await resolveTransactionRid(datasetRid);
  if (!transactionRid) {return;}
  await persistent.write(
    persistentKey(datasetRid, transactionRid, filePath),
    body,
  );
}

/**
 * Cache statistics, for a diagnostics panel: how many archives are persisted,
 * how many bytes that is, the cap in force, and the whole-origin figures the
 * browser reports.
 */
export function getCacheStats() {
  return persistent.stats();
}

/** Drop the persistent tier. clearFileCache() only ever dropped memory. */
export function clearPersistentCache(): Promise<void> {
  return persistent.clear();
}

/**
 * Register declared sizes so the index can be rebuilt from cache.keys() without
 * reading any bodies. Tile sources pass their resolver's bytesForPath.
 */
export function registerCacheSizeSource(
  source: (key: string) => number | undefined,
): void {
  persistent.addSizeSource(source);
}

// ── Request plumbing ────────────────────────────────────────────────────────

/**
 * The origin is resolved per call rather than captured at module load: the
 * host application configures it (see ./config), and that can happen after
 * this module is imported. See config.foundryOrigin() for why it is pinned.
 */

/** RIDs are opaque identifiers; anything with URL structure in it is invalid. */
const RID_PATTERN = /^ri\.[A-Za-z0-9._-]+$/;

/**
 * `filePath` is a SINGLE path parameter in
 * `/api/v2/datasets/{rid}/files/{filePath}/content`, so every reserved
 * character inside it — "/" included — must be percent-encoded. Sending the
 * slash literally produces a URL the router reads as multiple segments and
 * cannot match, which surfaces as a 404 even though the file exists.
 */
function encodeFilePath(filePath: string): string {
  return encodeURIComponent(filePath);
}

function contentUrl(datasetRid: string, filePath: string): string {
  // rule-regex-dos: RID_PATTERN is /^ri\.[A-Za-z0-9._-]+$/ — one character
  // class, no nesting, alternation or backtracking, so matching is linear in
  // input length. There is no catastrophic-backtracking input.
  // (`nosemgrep` must be the line immediately above the finding.)
  // nosemgrep
  if (!RID_PATTERN.test(datasetRid)) {
    throw new FoundryMalformedRequestError(
      `Refusing to fetch: malformed dataset RID "${datasetRid}"`,
      { rid: datasetRid },
    );
  }

  const segments = filePath.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    throw new FoundryMalformedRequestError(
      `Refusing to fetch: malformed file path "${filePath}"`,
      { rid: datasetRid, path: filePath },
    );
  }

  const origin = foundryOrigin();
  const url = new URL(
    `/api/v2/datasets/${encodeURIComponent(
      datasetRid,
    )}/files/${encodeFilePath(filePath)}/content`,
    origin,
  );

  // Belt and braces: assert same-origin before this can reach fetch().
  // Unreachable given the encoding above, which is the point.
  if (url.origin !== origin) {
    throw new Error(
      `Refusing to fetch: ${url.origin} is not the Foundry origin ${origin}`,
    );
  }
  return url.toString();
}

async function authorisedFetch(
  url: string,
  init: RequestInit,
  allowRetry = true,
): Promise<Response> {
  const token = await access().getToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  // rule-node-ssrf: `url` is not attacker-reachable as a host. contentUrl()
  // and mediaItemContentUrl() build every URL against the origin pinned by
  // configureBasemap(), percent-encode each path segment, reject "" / "."
  // / ".." segments, validate the RID shape, and assert same-origin before
  // returning. The origin is an enforced invariant, not an assumption.
  // nosemgrep
  const response = await fetch(url, { ...init, headers });

  // A 401 usually means the access token expired mid-session. auth() refreshes
  // on demand, so one retry with a freshly minted token is worth attempting.
  if (response.status === 401 && allowRetry) {
    return authorisedFetch(url, init, false);
  }
  return response;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch a whole dataset file.
 *
 * Resolution order: resident LRU -> in-flight request -> Cache Storage ->
 * network. Concurrent callers for the same file share one request.
 */
export function getFile(
  datasetRid: string,
  filePath: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  return fetchDatasetFile(datasetRid, filePath, false, signal) as Promise<ArrayBuffer>;
}

/**
 * Like getFile, but resolves to null instead of throwing when the file does not
 * exist (404).
 *
 * Absence is a normal, expected outcome for the chunked planet basemap: cells
 * are only written where there is data, and the majority of the globe is open
 * ocean. Treating that as an error would turn routine empty tiles into a flood
 * of exceptions.
 */
export function getFileOptional(
  datasetRid: string,
  filePath: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer | null> {
  return fetchDatasetFile(datasetRid, filePath, true, signal);
}

function fetchDatasetFile(
  datasetRid: string,
  filePath: string,
  allowMissing: boolean,
  signal?: AbortSignal,
): Promise<ArrayBuffer | null> {
  const key = cacheKey(datasetRid, filePath);

  const hit = resident.get(key);
  if (hit) {
    return Promise.resolve(hit);
  }

  // `allowMissing` is decided by whoever opens the request: a getFile and a
  // getFileOptional for the same path in the same tick share one fetch and
  // therefore one 404 policy. Harmless today (only the basemap uses the
  // optional form) but worth knowing before adding a third caller.
  return inFlight.join(
    key,
    (innerSignal) =>
      runDatasetFetch(datasetRid, filePath, key, allowMissing, innerSignal),
    signal,
  );
}

async function runDatasetFetch(
  datasetRid: string,
  filePath: string,
  key: string,
  allowMissing: boolean,
  signal: AbortSignal,
): Promise<ArrayBuffer | null> {
  const persisted = await readPersistent(datasetRid, filePath);
  if (persisted) {
    resident.set(key, persisted);
    return persisted;
  }

  // Same lanes as media items: basemap chunks are 10-25 MB whichever store
  // they come from, while glyphs and manifests are tiny and must not queue
  // behind them. Acquired only on the network path — the cache hits above need
  // no connection at all.
  const lane = laneFor(filePath);
  await acquireSlot(lane);
  try {
    // The queue may have held us for a while; if every waiter gave up in the
    // meantime there is nothing left to fetch.
    if (signal.aborted) {throw abortError();}

    const response = await authorisedFetch(contentUrl(datasetRid, filePath), {
      method: "GET",
      signal,
    });

    if (response.status === 404 && allowMissing) {return null;}
    if (!response.ok) {throw errorForResponse(
      response.status,
      response.statusText,
      datasetRid,
      filePath,
    );}

    const body = await response.arrayBuffer();
    resident.set(key, body);
    void writePersistent(datasetRid, filePath, body);
    return body;
  } finally {
    releaseSlot(lane);
  }
}

/**
 * Attach a caller to a shared in-flight request, honouring that caller's own
 * cancellation without disturbing the others. See InFlightEntry.
 */
/**
 * Fetch `length` bytes starting at `offset`.
 *
 * In ranged mode this is a single HTTP range request. In whole-file mode it
 * transparently downloads (once, then cached) and slices. Callers never need to
 * care which.
 */
export async function getRange(
  datasetRid: string,
  filePath: string,
  offset: number,
  length: number,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  // Never take the ranged branch on an unresolved mode: see settleRangeMode.
  // One shared probe decides for everyone, so a screenful of concurrent tile
  // reads cannot each be answered with a full copy of the same archive.
  if (rangeMode === "probing") {await settleRangeMode(datasetRid, filePath);}

  if (rangeMode === "whole-file") {
    const buffer = await getFile(datasetRid, filePath, signal);
    return buffer.slice(offset, offset + length);
  }

  const response = await authorisedFetch(contentUrl(datasetRid, filePath), {
    method: "GET",
    headers: { Range: `bytes=${offset}-${offset + length - 1}` },
    signal,
  });

  if (response.status === 206) {
    return response.arrayBuffer();
  }

  if (response.status === 200) {
    // Range header ignored on THIS file although the probe said otherwise.
    // Keep the body so the next read is free, but leave the resolved mode
    // alone — one inconsistent endpoint should not re-litigate it.
    const body = await response.arrayBuffer();
    const key = cacheKey(datasetRid, filePath);
    if (!resident.has(key)) {
      resident.set(key, body);
      void writePersistent(datasetRid, filePath, body);
    }
    return body.slice(offset, offset + length);
  }

  throw errorForResponse(
      response.status,
      response.statusText,
      datasetRid,
      filePath,
    );
}

/** Fetch a dataset file and parse it as UTF-8 JSON. */
export async function getJson<T>(
  datasetRid: string,
  filePath: string,
  signal?: AbortSignal,
): Promise<T> {
  const buffer = await getFile(datasetRid, filePath, signal);
  return JSON.parse(new TextDecoder().decode(buffer)) as T;
}

// ── Media sets ──────────────────────────────────────────────────────────────
//
// The chunked planet basemap lives in a media set rather than a dataset, so it
// needs a second access path. Reading an item is two calls: resolve the path to
// a media item RID, then fetch that item's content.
//
// The resolve step is memoised per (mediaSetRid, path) because it is pure
// overhead on the tile hot path. Media item RIDs are also IMMUTABLE — writing a
// new item at the same path mints a new RID — which makes them a better
// persistent-cache key than a dataset transaction RID, with no pruning needed.

/**
 * URL for a media item's content.
 *
 * Built by hand rather than via MediaSets.read() because the installed OSDK
 * typings and the platform docs disagree. The typings declare read() as
 * @public with a third parameter of `$headerParams?: { ReadToken? }` — no way
 * to pass `preview`. The docs state that Read Media Item IS a preview endpoint
 * and requires `preview=true` as a QUERY parameter. The platform decides what
 * the server accepts, so the docs win.
 *
 * Getting this wrong is what produced the opaque "TypeError: Failed to fetch"
 * on every chunk while the manifest (fetched after getRidByPath, which does set
 * preview) resolved fine.
 *
 * Same origin pinning and validation as the dataset path — see contentUrl().
 */
function mediaItemContentUrl(mediaSetRid: string, mediaItemRid: string): string {
  // rule-regex-dos: see contentUrl() — RID_PATTERN cannot backtrack.
  // nosemgrep
  if (!RID_PATTERN.test(mediaSetRid) || !RID_PATTERN.test(mediaItemRid)) {
    throw new Error(
      `Refusing to fetch: malformed RID(s) "${mediaSetRid}" / "${mediaItemRid}"`,
    );
  }

  const origin = foundryOrigin();
  const url = new URL(
    `/api/v2/mediasets/${encodeURIComponent(
      mediaSetRid,
    )}/items/${encodeURIComponent(mediaItemRid)}/content`,
    origin,
  );
  url.searchParams.set("preview", "true");

  if (url.origin !== origin) {
    throw new Error(
      `Refusing to fetch: ${url.origin} is not the Foundry origin ${origin}`,
    );
  }
  return url.toString();
}

// ── Concurrency lanes ───────────────────────────────────────────────────────
//
// MapLibre asks for a screenful of tiles at once, and at z12 each distinct cell
// is a separate 10-25 MB archive. Left unbounded that fans out into many large
// simultaneous transfers; bounded too tightly, everything queues behind the
// slowest one.
//
// WHY TWO LANES RATHER THAN ONE
// -----------------------------
// A single gate scheduled 25 MB archives and 20 KB glyph ranges as though they
// were the same thing. Two archive downloads occupied the whole gate, so the
// glyphs for the tiles already on screen waited behind them and labels popped
// in visibly late — despite costing a thousandth of the bytes. Small assets now
// have their own lane and can never be blocked by basemap traffic.
//
// WHY THE ARCHIVE LIMIT WENT FROM 2 TO 4
// --------------------------------------
// The original limit cited the browser's ~6-connections-per-origin cap. That is
// an HTTP/1.1 constraint; Foundry serves HTTP/2, which multiplexes every one of
// these over a single connection, so sockets were never the real limit —
// bandwidth share and time-to-first-tile are. Four keeps the pipe full without
// letting a screenful of cold z12 cells starve each other.
//
// These are tuning knobs, not correctness: the lane a request lands in only
// affects when it starts.
//
// IMPORTANT: a slot must cover the ENTIRE operation — for media items that
// means the RID lookup AND the content fetch. If concurrent calls all reach
// getRidByPath first they consume the budget before any content fetch starts,
// and the losers fail with an opaque "TypeError: Failed to fetch". Slots are
// therefore acquired at the start of the network path, after the cheap cache
// checks that need no connection at all.

const largeLane = createLane("large", LARGE_LANE_LIMIT);
const smallLane = createLane("small", SMALL_LANE_LIMIT);

function laneFor(filePath: string): Lane {
  // The classifier is configurable because "which files are big" is a property
  // of the application's data, not of this package. Read per call rather than
  // captured, since configuration can happen after this module is imported.
  const classify = access().isLargeFile ?? isLargeFilePath;
  return classify(filePath) ? largeLane : smallLane;
}

function acquireSlot(lane: Lane): Promise<void> {
  return lane.acquire();
}

function releaseSlot(lane: Lane): void {
  lane.release();
}

export function getLaneStats(): { large: LaneStats; small: LaneStats } {
  return { large: largeLane.stats, small: smallLane.stats };
}

/** (mediaSetRid::path) -> media item RID, or null when no item exists there. */
const mediaItemRids = new Map<string, Promise<string | null>>();

function resolveMediaItemRid(
  mediaSetRid: string,
  path: string,
): Promise<string | null> {
  const key = cacheKey(mediaSetRid, path);
  const existing = mediaItemRids.get(key);
  if (existing) {return existing;}

  const pending = (async () => {
    try {
      const response = await MediaSets.getRidByPath(
        access().platformClient,
        mediaSetRid,
        {
          mediaItemPath: path,
          // getRidByPath is annotated @beta in the OSDK. Beta v2 endpoints
          // reject the request with 400 Bad Request unless preview mode is set
          // — which is what this call originally failed with. MediaSets.read is
          // @public and needs no such flag.
          preview: true,
        },
      );
       
      console.info(`[foundryBytes] resolved RID for ${path}:`, response.mediaItemRid ?? "(null — path not in media set)");
      return response.mediaItemRid ?? null;
    } catch (err) {
      // A path that does not exist is entirely normal here: most basemap cells
      // are empty ocean and were never written. Treat it as "no item".
       
      console.warn(`[foundryBytes] getRidByPath failed for ${path}:`, err);
      return null;
    }
  })();

  mediaItemRids.set(key, pending);
  return pending;
}

/**
 * Fetch a media set item by path, or null if no item exists at that path.
 *
 * Uses the same two cache tiers as dataset files: the resident LRU, then Cache
 * Storage keyed by the immutable media item RID.
 *
 * The concurrency slot is acquired BEFORE the RID lookup so that the full
 * pipeline (getRidByPath + content fetch) counts against the gate. Without
 * this, 11 concurrent callers all fire getRidByPath simultaneously, exhaust
 * the browser's ~6 per-origin connections, and the losers fail immediately
 * with "TypeError: Failed to fetch" — before any content has been requested.
 */
export function getMediaItem(
  mediaSetRid: string,
  path: string,
): Promise<ArrayBuffer | null> {
  const key = cacheKey(mediaSetRid, path);

  const hit = resident.get(key);
  if (hit) {return Promise.resolve(hit);}

  const existing = mediaItemInFlight.get(key);
  if (existing) {return existing;}

  const pending = (async () => {
    // Cheap checks first — no network, no slot needed.
    // (Tier 1 hit is already handled above; this covers the persistent tier.)

    // Acquire the concurrency slot before touching the network at all — the
    // RID lookup is a round trip too, and must count against the same budget.
    const lane = laneFor(path);
    await acquireSlot(lane);
    try {
      const mediaItemRid = await resolveMediaItemRid(mediaSetRid, path);
       
      console.info(`[foundryBytes] getMediaItem: resolved rid for ${path}:`, mediaItemRid ?? "(null)");
      if (!mediaItemRid) {return null;}

      const persistentCacheKey = `${CACHE_KEY_ORIGIN}/mediaset/${encodeURIComponent(
        mediaItemRid,
      )}`;
      const persisted = await persistent.read(persistentCacheKey);
      if (persisted) {
         
        console.info(`[foundryBytes] getMediaItem: persistent cache hit for ${path} (${(persisted.byteLength / 1e6).toFixed(1)} MB)`);
        resident.set(key, persisted);
        return persisted;
      }

      const contentUrl = mediaItemContentUrl(mediaSetRid, mediaItemRid);
       
      console.info(`[foundryBytes] getMediaItem: fetching ${path} from ${contentUrl}`);
      const startedAt = performance.now();
      const response = await authorisedFetch(contentUrl, { method: "GET" });
       
      console.info(`[foundryBytes] getMediaItem: fetch returned status ${response.status} for ${path}`);
      if (!response.ok) {
        throw new Error(
          `Media set read failed: ${response.status} ${response.statusText} for ${path} in ${mediaSetRid}`,
        );
      }
      const body = await response.arrayBuffer();
      if (body.byteLength === 0) {
        throw new Error(
          `Media set item ${path} returned 0 bytes — response body was empty`,
        );
      }
       
      console.info(
        `[foundryBytes] media item ${path}: ${(body.byteLength / 1e6).toFixed(1)} MB ` +
          `in ${Math.round(performance.now() - startedAt)}ms`,
      );
      resident.set(key, body);
      void persistent.write(persistentCacheKey, body);
      return body;
    } catch (err) {
       
      console.warn(`[foundryBytes] getMediaItem THREW for ${path}:`, err);
      throw err;
    } finally {
      releaseSlot(lane);
    }
  })();

  mediaItemInFlight.set(key, pending);
  void pending.catch(() => {}).finally(() => mediaItemInFlight.delete(key));
  return pending;
}

const mediaItemInFlight = new Map<string, Promise<ArrayBuffer | null>>();

/** Fetch a media set item and parse it as UTF-8 JSON. */
export async function getMediaItemJson<T>(
  mediaSetRid: string,
  path: string,
): Promise<T | null> {
  const buffer = await getMediaItem(mediaSetRid, path);
  if (!buffer) {return null;}
  return JSON.parse(new TextDecoder().decode(buffer)) as T;
}
