/**
 * A byte-budgeted LRU for decoded DEM cells.
 *
 * WHY A SECOND CACHE, WHEN THE BYTE LAYER ALREADY HAS ONE
 * ------------------------------------------------------
 * The byte layer caches the chunk's FILE — compressed, in a resident LRU and in
 * Cache Storage. What this holds is the DECODED lattice, which is a different
 * object with a different size and a different lifetime: a 2° Int16 cell is
 * 11.5 MB decoded whatever its file was, and decoding it again is tens of
 * milliseconds of work that a pan should not pay repeatedly.
 *
 * The two budgets ADD UP, and that is worth being deliberate about: a DEM in
 * view costs its chunk bytes in the basemap's 128 MB resident budget plus its
 * decoded grid here. Hence a budget in bytes rather than a count of cells —
 * "four cells" means 46 MB of Int16 or 92 MB of Float32, which is not a budget,
 * it is a hope.
 */

import type { HeightGrid } from "./heightGrid.js";

export interface CellCache {
  get(key: string): HeightGrid | undefined;
  set(key: string, grid: HeightGrid): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
  readonly bytes: number;
  readonly size: number;
  readonly budget: number;
}

/**
 * 96 MB: room for eight Int16 cells, or four Float32 ones, which is more than a
 * viewport needs at any zoom (a tile spans at most four cells) while leaving
 * the browser's memory to MapLibre's own tiles and textures.
 */
export const DEFAULT_CELL_BUDGET_BYTES = 96 * 1024 * 1024;

export function createCellCache(
  budget = DEFAULT_CELL_BUDGET_BYTES,
): CellCache {
  const entries = new Map<string, HeightGrid>();
  let bytes = 0;

  const sizeOf = (grid: HeightGrid) => grid.values.byteLength;

  return {
    get(key) {
      const hit = entries.get(key);
      if (!hit) {return undefined;}
      // Re-insert to move it to the young end. Map preserves insertion order,
      // which is what makes this an LRU without a linked list.
      entries.delete(key);
      entries.set(key, hit);
      return hit;
    },

    set(key, grid) {
      const existing = entries.get(key);
      if (existing) {
        bytes -= sizeOf(existing);
        entries.delete(key);
      }
      entries.set(key, grid);
      bytes += sizeOf(grid);

      // A single cell larger than the whole budget is kept anyway: evicting it
      // immediately would mean never being able to answer a question about that
      // cell at all, which is worse than briefly exceeding a soft limit.
      while (bytes > budget && entries.size > 1) {
        const oldest = entries.keys().next();
        if (oldest.done) {break;}
        const victim = entries.get(oldest.value);
        entries.delete(oldest.value);
        if (victim) {bytes -= sizeOf(victim);}
      }
    },

    has: (key) => entries.has(key),

    delete(key) {
      const existing = entries.get(key);
      if (!existing) {return;}
      bytes -= sizeOf(existing);
      entries.delete(key);
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

    budget,
  };
}
