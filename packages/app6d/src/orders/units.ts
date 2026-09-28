/**
 * Unit markers.
 *
 * Rendering goes through the tactical graphics library's `resolveSymbol`
 * rather than milsymbol directly. That matters more than it looks: a SIDC
 * handed to this map might be a unit ("SFGPUCI-----D---", milsymbol's job) or
 * a tactical graphic ("GFTPO---------G" / "SVGOCCUPY", the catalog's job), and
 * resolveSymbol picks the right renderer while exposing one asSVG()/
 * getAnchor()/getSize() shape for both. A host can therefore drop a control
 * measure onto the palette and it just draws.
 */

import { resolveSymbol } from "../milsymbol/index";
import type { SymbolCatalog } from "../engine/index";

export interface UnitMarkerOptions {
  /** Icon size in px. Default 26. */
  size?: number;
  /** Thicker stroke and a glow, for the selected unit. */
  selected?: boolean;
}

const DEFAULT_SIZE = 26;

function resolve(
  catalog: SymbolCatalog,
  sidc: string,
  { size = DEFAULT_SIZE, selected = false }: UnitMarkerOptions,
) {
  return resolveSymbol(catalog, sidc, {
    milsymbolOptions: { size, strokeWidth: selected ? 3 : 1.5 },
    size: { width: size * 2, height: size * 2 },
  });
}

/**
 * SVG markup for a unit. Returns a fallback dot rather than throwing: a bad
 * SIDC in one row of somebody's data should not take the map down.
 */
export function unitMarkerSvg(
  catalog: SymbolCatalog,
  sidc: string,
  options: UnitMarkerOptions = {},
): string {
  const size = options.size ?? DEFAULT_SIZE;
  try {
    return resolve(catalog, sidc, options).asSVG();
  } catch {
    const r = size / 2 - 2;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="#1976d2" stroke="#fff" stroke-width="2"/>` +
      `</svg>`
    );
  }
}

/**
 * How far to shift the rendered icon so its ANCHOR — not the centre of its
 * bounding box — lands on the map position.
 *
 * A unit frame's anchor is its octagon centre, which for anything with an
 * echelon glyph or a mobility indicator is well off the box centre. Without
 * this the symbol looks placed correctly on its own and visibly wrong the
 * moment it sits next to a route or an objective.
 *
 * Returns a MapLibre `Marker` offset, in px.
 */
export function unitMarkerOffset(
  catalog: SymbolCatalog,
  sidc: string,
  options: UnitMarkerOptions = {},
): [number, number] {
  try {
    const symbol = resolve(catalog, sidc, options);
    const box = symbol.getSize();
    const anchor = symbol.getAnchor();
    return [box.width / 2 - anchor.x, box.height / 2 - anchor.y];
  } catch {
    return [0, 0];
  }
}
