/**
 * Whole-file cache, keyed by CONTENT where the manifest gives a hash.
 *
 *   tier 1   in memory, LRU over a byte budget
 *   tier 2   Cache Storage, keyed by sha256 — survives reloads, and because the
 *            key is the content, a rebuilt dataset re-downloads only the files
 *            whose bytes changed. (decho-foundry-bytes keys by the dataset's
 *            latest transaction instead, so any rebuild invalidates every file.)
 *
 * Concurrent reads of one file share one request. Downloaded bytes are hashed
 * and checked against the manifest before they are persisted; a mismatch means
 * the manifest is stale, and is reported rather than cached under a wrong key.
 */
import type { FileStore } from "./stores";

const MEMORY_BUDGET = 256 * 1024 * 1024;
const CACHE_NAME = "decho-studio-v1";
const KEY_ORIGIN = "https://decho-studio.cache";

class Lru {
  private map = new Map<string, ArrayBuffer>();
  private bytes = 0;

  get(key: string): ArrayBuffer | undefined {
    const value = this.map.get(key);
    if (value) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: string, value: ArrayBuffer): void {
    const old = this.map.get(key);
    if (old) {this.bytes -= old.byteLength;}
    this.map.delete(key);
    this.map.set(key, value);
    this.bytes += value.byteLength;
    for (const [k, v] of this.map) {
      if (this.bytes <= MEMORY_BUDGET) {break;}
      this.map.delete(k);
      this.bytes -= v.byteLength;
    }
  }
}

const memory = new Lru();
const inflight = new Map<string, Promise<ArrayBuffer | null>>();
export const cacheStats = { network: 0, memory: 0, persistent: 0, hashMismatches: 0 };

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === "undefined" ? null : await caches.open(CACHE_NAME);
  } catch {
    return null; // private windows, non-secure origins
  }
}

/**
 * Read a file through both cache tiers. `sha256` is the manifest's declared
 * hash; without one the file is cached in memory only.
 */
export function readFile(store: FileStore, path: string, sha256?: string): Promise<ArrayBuffer | null> {
  const memKey = sha256 ?? `${store.key}|${path}`;
  const hit = memory.get(memKey);
  if (hit) {
    cacheStats.memory++;
    return Promise.resolve(hit);
  }
  const pending = inflight.get(memKey);
  if (pending) {return pending;}

  const work = (async () => {
    const persistentKey = sha256 ? `${KEY_ORIGIN}/sha256/${sha256}` : null;
    const cache = persistentKey ? await openCache() : null;
    if (cache && persistentKey) {
      const res = await cache.match(persistentKey);
      if (res) {
        const buf = await res.arrayBuffer();
        memory.set(memKey, buf);
        cacheStats.persistent++;
        return buf;
      }
    }
    const buf = await store.read(path);
    cacheStats.network++;
    if (!buf) {return null;}
    if (sha256) {
      const actual = await sha256Hex(buf);
      if (actual !== sha256) {
        cacheStats.hashMismatches++;
        console.warn(`decho-studio: ${path} in ${store.key} does not match its manifest hash; not caching it.`);
        memory.set(`${store.key}|${path}`, buf);
        return buf;
      }
      if (cache && persistentKey) {
        void cache.put(persistentKey, new Response(buf.slice(0))).catch(() => undefined);
      }
    }
    memory.set(memKey, buf);
    return buf;
  })();

  inflight.set(memKey, work);
  void work.finally(() => inflight.delete(memKey)).catch(() => undefined);
  return work;
}

export async function readJson<T>(store: FileStore, path: string, sha256?: string): Promise<T | null> {
  const buf = await readFile(store, path, sha256);
  return buf ? (JSON.parse(new TextDecoder().decode(buf)) as T) : null;
}
