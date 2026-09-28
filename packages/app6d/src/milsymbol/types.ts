// milsymbol/types.ts — the shared shape resolveSymbol() returns regardless
// of which renderer actually produced it.
import type { SymbolOptions } from "milsymbol";
import type { Params, RenderStyle } from "../engine/types";

export interface MilsymbolCompatOptions {
  /** Passed to render()/getParts() when `sidc` resolves to one of this
   * catalog's tactical graphics (e.g. milxParams-shaped overrides). */
  params?: Params;
  /** Passed to render() as stroke/strokeWidth/font/etc when `sidc`
   * resolves to a tactical graphic. Ignored on the milsymbol branch — use
   * `milsymbolOptions` for that. */
  style?: RenderStyle;
  /** Overrides renderSVG()'s default local coordinate box (viewBox/
   * width/height) for the tactical-graphic branch. Ignored on the
   * milsymbol branch, which sizes itself via `milsymbolOptions.size`. */
  size?: { viewBox?: string; width?: number; height?: number };
  /** Passed straight through to `new ms.Symbol(sidc, options)` when `sidc`
   * doesn't resolve to a tactical graphic and falls through to milsymbol
   * for a unit/equipment/installation icon. */
  milsymbolOptions?: SymbolOptions;
}

/**
 * The common surface both branches of resolveSymbol() expose, mirroring
 * milsymbol's own Symbol methods so callers can place/draw a resolved
 * symbol the same way regardless of which library actually rendered it.
 */
export interface ResolvedSymbol {
  /** Which renderer actually produced this symbol. */
  kind: "tactical-graphic" | "milsymbol";
  /** Standalone <svg>...</svg> markup. */
  asSVG(): string;
  /** Where, in this symbol's own local pixel space (the same box asSVG()
   * renders into), the symbol's true position/anchor sits — e.g. the tip
   * of a unit's frame, or a tactical graphic's declared `unitAnchor`
   * point. Place the rendered symbol so this point lands on the map
   * position, the same way you would with milsymbol's own getAnchor(). */
  getAnchor(): { x: number; y: number };
  /** The width/height of the local pixel box asSVG()/getAnchor() are
   * expressed in. */
  getSize(): { width: number; height: number };
}
