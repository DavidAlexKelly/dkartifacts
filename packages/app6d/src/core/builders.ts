// core/builders.ts — semantic order builders. Removes the need to know
// what an internal param like `barrierHalf: 840` means — pass real
// distances/positions instead. Takes an explicit SymbolCatalog (needed to
// resolve task names to SIDCs via resolveTacticSidc).
import type { SymbolCatalog } from "../engine/catalog";
import { resolveTacticSidc } from "./tacticOrders";

export interface Order {
  sidc: string;
  from: [number, number];
  to: [number, number];
  colour?: string;
  milxParams?: Record<string, unknown>;
}

/** Approximate internal-units-per-real-unit scale. Tune per your map's
 * coordinate system (this is intentionally a rough heuristic, not a
 * calibrated projection — the underlying symbol geometry isn't
 * georeferenced). */
export interface BuilderScale {
  /** how many internal param units correspond to one "real" distance unit
   * (metres, screen px, whatever `from`/`to` are expressed in) */
  unitsPerRealUnit: number;
}
const DEFAULT_SCALE: BuilderScale = { unitsPerRealUnit: 1 };

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function createOrderBuilders(catalog: SymbolCatalog) {
  return {
    /** A Seize order centred at `at`, with a given real-world radius. */
    seize(at: [number, number], radius = 500, scale: BuilderScale = DEFAULT_SCALE): Order {
      return {
        sidc: resolveTacticSidc(catalog, "Seize")!,
        from: at,
        to: at,
        milxParams: { center: { x: 1050, y: 950 }, radius: radius * scale.unitsPerRealUnit },
      };
    },

    /** A Block order from `from` to `to` (the barrier line sits at `to`). */
    block(from: [number, number], to: [number, number], scale: BuilderScale = DEFAULT_SCALE): Order {
      const d = dist(from, to) * scale.unitsPerRealUnit;
      return {
        sidc: resolveTacticSidc(catalog, "Block")!,
        from,
        to,
        milxParams: {
          A: { x: 129, y: 889 },
          B: { x: 129 + d, y: 889 },
          barrierHalf: Math.max(200, d * 0.4),
        },
      };
    },

    /** A Screen line from `from` to `to`. */
    screen(from: [number, number], to: [number, number]): Order {
      return { sidc: resolveTacticSidc(catalog, "Screen")!, from, to };
    },

    /** A Secure order at a point. */
    secure(at: [number, number], radius = 400, scale: BuilderScale = DEFAULT_SCALE): Order {
      return {
        sidc: resolveTacticSidc(catalog, "Secure")!,
        from: at,
        to: at,
        milxParams: { center: { x: 916, y: 890 }, radius: radius * scale.unitsPerRealUnit },
      };
    },

    /** A simple Counterattack axis with a straight two-point spine. */
    attackAxis(from: [number, number], to: [number, number]): Order {
      return {
        sidc: resolveTacticSidc(catalog, "Counterattack")!,
        from,
        to,
        milxParams: {
          spine: [{ x: 281, y: 1696 }, { x: 281, y: 900 }],
        },
      };
    },
  };
}

export type OrderBuilders = ReturnType<typeof createOrderBuilders>;