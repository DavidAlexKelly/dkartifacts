/**
 * Byte-budgeted LRU for file bodies.
 *
 * Extracted from bytes.ts so it can be tested without a network, a browser, or
 * a Foundry token. It was previously a handful of module-level variables and
 * two private functions, which meant the eviction arithmetic — the part most
 * likely to be wrong — had no way of being exercised.
 *
 * A JS Map iterates in insertion order, so "delete then re-set on access"
 * turns it into an LRU whose least-recently-used entry is always first.
 */

export interface ResidentCache {
  /** Body for `key`, marking it most-recently-used. */
  get(key: string): ArrayBuffer | undefined;
  /** Insert or replace, evicting from the least-recently-used end if needed. */
  set(key: string, body: ArrayBuffer): void;
  has(key: string): boolean;
  clear(): void;
  /** Total resident bytes. */
  readonly bytes: number;
  /** Number of resident entries. */
  readonly size: number;
  /** The ceiling this cache was built with. */
  readonly budget: number;
}

export function createResidentCache(budgetBytes: number): ResidentCache {
  const entries = new Map<string, ArrayBuffer>();
  let bytes = 0;

  return {
    get(key) {
      const hit = entries.get(key);
      if (hit === undefined) {return undefined;}
      entries.delete(key);
      entries.set(key, hit);
      return hit;
    },

    set(key, body) {
      const existing = entries.get(key);
      if (existing) {
        bytes -= existing.byteLength;
        entries.delete(key);
      }
      entries.set(key, body);
      bytes += body.byteLength;

      // `size > 1` keeps one entry even when it alone exceeds the budget:
      // evicting the thing that was just asked for would guarantee a re-fetch
      // and make no progress. A single archive can legitimately be larger than
      // a small budget.
      while (bytes > budgetBytes && entries.size > 1) {
        const oldest = entries.keys().next();
        if (oldest.done) {break;}
        const victim = entries.get(oldest.value);
        entries.delete(oldest.value);
        bytes -= victim ? victim.byteLength : 0;
      }
    },

    has(key) {
      return entries.has(key);
    },

    clear() {
      entries.clear();
      bytes = 0;
    },

    get bytes() {
      return bytes;
    },
    get size() {
      return entries.size;
    },
    get budget() {
      return budgetBytes;
    },
  };
}
