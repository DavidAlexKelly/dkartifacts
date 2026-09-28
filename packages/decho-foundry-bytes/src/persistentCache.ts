/**
 * Tier 2: Cache Storage, with a budget.
 *
 * WHY THIS NEEDED WORK
 * --------------------
 * The persistent tier was unbounded. It grew towards the size of whatever
 * store it was pointed at — ~19 GB for the chunked planet basemap — and a
 * QuotaExceededError was caught and ignored, so on a modest device it stopped
 * persisting silently and every reload re-downloaded everything. There was also
 * no way to inspect it or clear it: clearFileCache() only ever dropped memory.
 *
 * THE AWKWARDNESS OF CACHE STORAGE
 * --------------------------------
 * It is a poor substrate for a budgeted cache:
 *
 *   - `keys()` returns Requests, not sizes. Learning an entry's size normally
 *     means match() plus reading the body, which defeats the point.
 *   - It records no access times, so there is nothing to sort an LRU by.
 *     `keys()` is insertion-ordered, which gives FIFO at best.
 *   - Quota is opaque, rounded for privacy, and wildly platform-dependent.
 *
 * HOW THIS SIDESTEPS ALL THREE
 * ----------------------------
 * A small index in localStorage records, per key, the size observed when it was
 * written and the time it was last read. That gives both the total and the
 * recency ordering with no I/O against Cache Storage at all.
 *
 * The index is a cache, not a source of truth. If it is lost — cleared storage,
 * a different device, a browser that evicted it — it is rebuilt from
 * `cache.keys()` plus the sizes DECLARED IN THE MANIFEST, which is why
 * Resolver.bytesForPath exists. Still no bodies read. Entries whose size cannot
 * be established either way are treated as unknown and evicted first, on the
 * grounds that an unmeasurable entry is not worth defending.
 */

// ── Index ───────────────────────────────────────────────────────────────────

export interface CacheEntryMeta {
  /** Size in bytes, as observed on write or declared by a manifest. */
  bytes?: number;
  /** Epoch millis of the last read (or of the write, initially). */
  lastUsed: number;
  /** Exempt from eviction. Reserved for an explicit "keep this region" flow. */
  pinned?: boolean;
}

export interface CacheIndex {
  get(key: string): CacheEntryMeta | undefined;
  /** Record a write. */
  put(key: string, meta: CacheEntryMeta): void;
  /** Record a read, without rewriting the body. */
  touch(key: string, now?: number): void;
  remove(key: string): void;
  entries(): Array<[string, CacheEntryMeta]>;
  /** Drop keys the cache no longer holds, and adopt ones it does. */
  reconcile(
    keys: string[],
    sizeFor: (key: string) => number | undefined,
  ): void;
  totalBytes(): number;
  clear(): void;
}

/**
 * Minimal shape of localStorage, injected so the index is testable and so a
 * non-browser context degrades to a memory-only index instead of throwing.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Deliberately still says "decho-basemap", even though this code no longer
 * lives there.
 *
 * This key and the Cache Storage name below identify data already on users'
 * disks — up to the whole cap's worth of archives. Renaming them on extraction
 * would orphan every one of those entries: nothing would read them, nothing
 * would prune them, and every user would silently re-download what they
 * already had. The name is a storage identifier, not a label.
 */
const INDEX_STORAGE_KEY = "decho-basemap:cache-index/v1";

export function createCacheIndex(
  storage: KeyValueStore | null,
  storageKey: string = INDEX_STORAGE_KEY,
): CacheIndex {
  let map = new Map<string, CacheEntryMeta>();

  if (storage) {
    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        map = new Map(Object.entries(JSON.parse(raw) as Record<string, CacheEntryMeta>));
      }
    } catch {
      // A corrupt index is not worth recovering: it rebuilds from the cache.
      map = new Map();
    }
  }

  // Flushing on every read would turn a cache hit into a synchronous JSON
  // serialisation of the whole index. Mark dirty and flush on a timer instead.
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    if (!dirty || !storage) {return;}
    dirty = false;
    try {
      storage.setItem(storageKey, JSON.stringify(Object.fromEntries(map)));
    } catch {
      // Quota on localStorage itself. The index is disposable; carry on with
      // the in-memory copy rather than failing a tile read.
    }
  };

  const schedule = () => {
    dirty = true;
    if (timer !== null || !storage) {return;}
    timer = setTimeout(flush, 2000);
  };

  return {
    get: (key) => map.get(key),

    put(key, meta) {
      map.set(key, meta);
      schedule();
    },

    touch(key, now = Date.now()) {
      const existing = map.get(key);
      if (!existing) {return;}
      existing.lastUsed = now;
      schedule();
    },

    remove(key) {
      map.delete(key);
      schedule();
    },

    entries: () => [...map.entries()],

    reconcile(keys, sizeFor) {
      const present = new Set(keys);
      for (const key of [...map.keys()]) {
        if (!present.has(key)) {map.delete(key);}
      }
      for (const key of keys) {
        const existing = map.get(key);
        if (existing) {
          // Adopt a declared size for an entry we only knew the age of.
          if (existing.bytes === undefined) {existing.bytes = sizeFor(key);}
          continue;
        }
        // Present in the cache but unknown to the index: date it to the epoch
        // so it is evicted before anything we have actually seen used.
        map.set(key, { bytes: sizeFor(key), lastUsed: 0 });
      }
      schedule();
    },

    totalBytes() {
      let total = 0;
      for (const meta of map.values()) {total += meta.bytes ?? 0;}
      return total;
    },

    clear() {
      map = new Map();
      schedule();
    },
  };
}

// ── Policy (pure, and therefore tested) ─────────────────────────────────────

export interface CapOptions {
  /** Hard ceiling this package imposes on itself. */
  maxBytes: number;
  /** Never claim more than this share of what the browser reports available. */
  quotaFraction: number;
}

/**
 * The effective cap.
 *
 * `navigator.storage.estimate()` reports the whole origin, including the OSDK's
 * own caches and the app bundle, so it is not a measure of our usage — it is
 * only used to avoid claiming a silly share of a small quota.
 */
export function resolveCap(
  options: CapOptions,
  quotaTotal?: number,
): number {
  if (!quotaTotal || quotaTotal <= 0) {return options.maxBytes;}
  return Math.min(options.maxBytes, Math.floor(quotaTotal * options.quotaFraction));
}

export interface VictimSelection {
  keys: string[];
  freedBytes: number;
}

/**
 * Choose what to evict to get from `currentBytes` down to `targetBytes`.
 *
 * Ranked by `bytes * age`, not age alone. A pure LRU evicts the low-zoom
 * archive as soon as the user spends a while zoomed in — and that file is small
 * and needed by every subsequent pan, so re-fetching it is the worst possible
 * trade. Weighting by size protects it naturally and sheds the 30 MB z12 cell
 * that was visited once.
 *
 * Unknown sizes sort first: an entry we cannot measure cannot be budgeted, and
 * keeping it means the accounting stays wrong.
 */
export function selectVictims(
  entries: Array<[string, CacheEntryMeta]>,
  opts: { currentBytes: number; targetBytes: number; now?: number },
): VictimSelection {
  const now = opts.now ?? Date.now();
  let over = opts.currentBytes - opts.targetBytes;
  if (over <= 0) {return { keys: [], freedBytes: 0 };}

  const scored = entries
    .filter(([, meta]) => !meta.pinned)
    .map(([key, meta]) => {
      const age = Math.max(0, now - meta.lastUsed);
      const bytes = meta.bytes;
      return {
        key,
        bytes: bytes ?? 0,
        // Unknown size gets Infinity so it is shed before anything measurable.
        score: bytes === undefined ? Number.POSITIVE_INFINITY : bytes * age,
      };
    })
    .sort((a, b) => b.score - a.score);

  const keys: string[] = [];
  let freedBytes = 0;
  for (const candidate of scored) {
    if (over <= 0) {break;}
    keys.push(candidate.key);
    freedBytes += candidate.bytes;
    over -= candidate.bytes;
    // An unknown-size entry frees an unknown amount, so stop assuming progress
    // and let the next pass re-measure.
    if (candidate.score === Number.POSITIVE_INFINITY) {break;}
  }
  return { keys, freedBytes };
}

// ── The cache itself ────────────────────────────────────────────────────────

export interface PersistentCacheOptions extends CapOptions {
  cacheName: string;
  /** Evict down to this share of the cap, so writes do not each trigger a pass. */
  evictToFraction: number;
  /** Cache names to delete once, on first use. */
  supersedes?: string[];
}

export interface CacheStats {
  entries: number;
  bytes: number;
  cap: number;
  /** Whole-origin figures from the Storage API, when available. */
  quotaUsage?: number;
  quotaTotal?: number;
}

export interface PersistentCache {
  read(key: string): Promise<ArrayBuffer | null>;
  write(key: string, body: ArrayBuffer): Promise<void>;
  /** Delete every key starting with `prefix` except those under `keep`. */
  prune(prefix: string, keep: string): Promise<void>;
  stats(): Promise<CacheStats>;
  clear(): Promise<void>;
  /**
   * Register a source of declared sizes, so the index can be rebuilt without
   * reading bodies. Tile sources register their resolver's bytesForPath.
   */
  addSizeSource(source: (key: string) => number | undefined): void;
}

const available = () =>
  typeof caches !== "undefined" && typeof Request !== "undefined";

export function createPersistentCache(
  options: PersistentCacheOptions,
  index: CacheIndex,
): PersistentCache {
  const sizeSources: Array<(key: string) => number | undefined> = [];
  const sizeFor = (key: string): number | undefined => {
    for (const source of sizeSources) {
      const bytes = source(key);
      if (typeof bytes === "number") {return bytes;}
    }
    return undefined;
  };

  let reconciled = false;
  let evicting: Promise<void> | null = null;

  const open = async () => caches.open(options.cacheName);

  const quota = async (): Promise<{ usage?: number; total?: number }> => {
    try {
      if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
        return {};
      }
      const est = await navigator.storage.estimate();
      return { usage: est.usage, total: est.quota };
    } catch {
      return {};
    }
  };

  /** Once per session: adopt whatever is already cached, drop superseded caches. */
  const reconcileOnce = async () => {
    if (reconciled) {return;}
    reconciled = true;
    try {
      for (const old of options.supersedes ?? []) {
        await caches.delete(old);
      }
      const cache = await open();
      const keys = (await cache.keys()).map((r) => r.url);
      index.reconcile(keys, sizeFor);
    } catch {
      /* best effort */
    }
  };

  const evictIfNeeded = async (force = false): Promise<void> => {
    if (evicting) {return evicting;}
    evicting = (async () => {
      try {
        const { total } = await quota();
        const cap = resolveCap(options, total);
        const currentBytes = index.totalBytes();
        if (!force && currentBytes <= cap) {return;}

        const targetBytes = Math.floor(
          cap * (force ? options.evictToFraction * 0.6 : options.evictToFraction),
        );
        const { keys } = selectVictims(index.entries(), {
          currentBytes,
          targetBytes,
        });
        if (keys.length === 0) {return;}

        const cache = await open();
        for (const key of keys) {
          try {
            await cache.delete(key);
          } finally {
            index.remove(key);
          }
        }
        console.info(
          `[decho-foundry-bytes] evicted ${keys.length} cached file(s) to stay under ` +
            `${(cap / 1e6).toFixed(0)} MB`,
        );
      } catch {
        /* eviction is best effort; a full cache is not a broken map */
      } finally {
        evicting = null;
      }
    })();
    return evicting;
  };

  return {
    addSizeSource(source) {
      sizeSources.push(source);
    },

    async read(key) {
      if (!available()) {return null;}
      try {
        await reconcileOnce();
        const cache = await open();
        const hit = await cache.match(key);
        if (!hit) {return null;}
        index.touch(key);
        return await hit.arrayBuffer();
      } catch {
        return null;
      }
    },

    async write(key, body) {
      if (!available()) {return;}
      await reconcileOnce();

      const store = async () => {
        const cache = await open();
        await cache.put(key, new Response(body));
        index.put(key, { bytes: body.byteLength, lastUsed: Date.now() });
      };

      try {
        await store();
      } catch (err) {
        // QuotaExceededError is the expected failure, and the only one worth
        // reacting to: evict hard and try once more. Previously this was
        // swallowed, so the cache silently stopped accepting writes forever.
        const quotaExceeded =
          err instanceof Error &&
          (err.name === "QuotaExceededError" ||
            err.name === "NS_ERROR_DOM_QUOTA_REACHED");
        if (!quotaExceeded) {return;}
        await evictIfNeeded(true);
        try {
          await store();
        } catch {
          /* give up quietly: a slow next load, not a broken map */
        }
        return;
      }

      void evictIfNeeded();
    },

    async prune(prefix, keep) {
      if (!available()) {return;}
      try {
        const cache = await open();
        const keys = await cache.keys();
        await Promise.all(
          keys
            .filter((r) => r.url.startsWith(prefix) && !r.url.startsWith(keep))
            .map(async (r) => {
              await cache.delete(r);
              index.remove(r.url);
            }),
        );
      } catch {
        /* pruning is best effort */
      }
    },

    async stats() {
      const { usage, total } = await quota();
      let entries = index.entries().length;
      if (available()) {
        try {
          await reconcileOnce();
          entries = index.entries().length;
        } catch {
          /* fall back to whatever the index knows */
        }
      }
      return {
        entries,
        bytes: index.totalBytes(),
        cap: resolveCap(options, total),
        quotaUsage: usage,
        quotaTotal: total,
      };
    },

    async clear() {
      index.clear();
      if (!available()) {return;}
      try {
        await caches.delete(options.cacheName);
      } catch {
        /* best effort */
      }
    },
  };
}

/** Convenience for the browser: localStorage-backed index, sensible defaults. */
export function createBrowserPersistentCache(
  overrides: Partial<PersistentCacheOptions> = {},
): PersistentCache {
  const storage: KeyValueStore | null =
    typeof localStorage !== "undefined" ? localStorage : null;
  return createPersistentCache(
    {
      // Unchanged on extraction, on purpose — see INDEX_STORAGE_KEY above.
      cacheName: "decho-basemap-v1",
      // Renamed from the pre-rename cache. Deleting it once reclaims the space
      // rather than leaving an orphan nobody will ever read.
      supersedes: ["foundry-bytes-v2"],
      maxBytes: 2 * 1024 * 1024 * 1024,
      quotaFraction: 0.5,
      evictToFraction: 0.8,
      ...overrides,
    },
    createCacheIndex(storage),
  );
}
