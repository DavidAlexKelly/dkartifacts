// @acc/app6d/milsymbol — resolves a SIDC to whichever
// renderer actually covers it: one of this library's own tactical
// graphics (Seize, Block, Screen, ...) if `sidc` names one — via either
// this library's synthetic renderer key or a real doctrinal MIL-STD-2525/
// APP-6 SIDC — otherwise a milsymbol unit/equipment/installation icon.
//
// milsymbol is only imported here, in this dedicated subpath, exactly
// like maplibre-gl is only imported under /maplibre — it's an optional
// peer dependency (see package.json); importing this module without it
// installed fails the same ordinary "module not found" way importing
// /maplibre without maplibre-gl installed does.
//
// Either branch returns an object exposing milsymbol's own asSVG()/
// getAnchor()/getSize() shape, so calling code doesn't need to know or
// care which library actually drew a given SIDC.
import ms from "milsymbol";
import type { SymbolCatalog } from "../engine/catalog";
import { renderSVG, DEFAULT_SVG_BOX } from "../engine/render";
import { resolveCatalogNameForSidc, getSymbolAnchorPoint } from "../core/tacticOrders";
import type { MilsymbolCompatOptions, ResolvedSymbol } from "./types";

export type { MilsymbolCompatOptions, ResolvedSymbol } from "./types";
export { resolveCatalogNameForSidc } from "../core/tacticOrders";

function tacticalGraphicSymbol(catalog: SymbolCatalog, name: string, options: MilsymbolCompatOptions): ResolvedSymbol {
  const viewBox = options.size?.viewBox ?? DEFAULT_SVG_BOX.viewBox;
  const width = options.size?.width ?? DEFAULT_SVG_BOX.width;
  const height = options.size?.height ?? DEFAULT_SVG_BOX.height;
  const [minX, minY, vbWidth, vbHeight] = viewBox.split(/\s+/).map(Number);

  return {
    kind: "tactical-graphic",
    asSVG: () => renderSVG(catalog, name, options.params, { viewBox, width, height, style: options.style }),
    getSize: () => ({ width, height }),
    getAnchor: () => {
      // undefined only for a symbol with zero point-kind handles at all —
      // no built-in symbol is like this, but a custom catalog entry could
      // be; fall back to the box's center rather than throwing.
      const anchor = getSymbolAnchorPoint(catalog, name, options.params) ?? { x: (minX + vbWidth / 2), y: (minY + vbHeight / 2) };
      return {
        x: (anchor.x - minX) * (width / vbWidth),
        y: (anchor.y - minY) * (height / vbHeight),
      };
    },
  };
}

function milsymbolSymbol(sidc: string, options: MilsymbolCompatOptions): ResolvedSymbol {
  const sym = new ms.Symbol(sidc, options.milsymbolOptions ?? {});
  return {
    kind: "milsymbol",
    asSVG: () => sym.asSVG(),
    getAnchor: () => sym.getAnchor(),
    getSize: () => sym.getSize(),
  };
}

/**
 * Resolves `sidc` to a renderable symbol, whichever library actually
 * covers it:
 *
 *   import { resolveSymbol } from "@acc/app6d/milsymbol";
 *   import { APP6D_CATALOG } from "@acc/app6d/symbols";
 *
 *   const sym = resolveSymbol(APP6D_CATALOG, sidc, { params, style });
 *   sym.asSVG();      // works whether sidc is a unit icon or a tactical graphic
 *   sym.getAnchor();  // consistent placement API either way
 *
 * `sidc` may be this library's own synthetic renderer key ("SVGSEIZE"), a
 * real doctrinal SIDC for one of its tactical graphics ("GFTPO---------G"
 * for Occupy), or a real SIDC for a unit/equipment/installation — the
 * first two resolve against `catalog`, the third falls through to
 * milsymbol (which must be installed; it's an optional peer dependency).
 */
export function resolveSymbol(catalog: SymbolCatalog, sidc: string, options: MilsymbolCompatOptions = {}): ResolvedSymbol {
  const name = resolveCatalogNameForSidc(catalog, sidc);
  if (name) {return tacticalGraphicSymbol(catalog, name, options);}
  return milsymbolSymbol(sidc, options);
}
