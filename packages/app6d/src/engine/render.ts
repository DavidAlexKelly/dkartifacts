// engine/render.ts — public rendering/editing API. Operates purely against
// an explicit SymbolCatalog value passed in by the caller — no shared
// registry, no global state. Construct a SymbolCatalog once (see
// engine/catalog.ts, or use @acc/app6d/symbols's pre-built
// APP6D_CATALOG) and pass it into every call here.
import type { Pt } from "./geometry";
import type { Params, Part, EngineHandle, RenderStyle } from "./types";
import type { SymbolCatalog } from "./catalog";
import { f, escapeXmlText, escapeXmlAttr } from "./geometry";

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

function deepMerge<T extends object>(base: T, over: DeepPartial<T> | undefined): T {
  const out = (Array.isArray(base) ? [...base] : { ...base }) as T;
  for (const k in (over ?? {})) {
    const v = (over as Params)[k];
    const b = (base as Params)[k];
    (out as Params)[k] =
      v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b)
        ? deepMerge(b, v)
        : v;
  }
  return out;
}

function requireDef(catalog: SymbolCatalog, name: string) {
  const def = catalog.get(name);
  if (!def) {
    throw new Error(
      `Unknown symbol: "${name}". Registered symbols: ${catalog.list().join(', ') || '(none)'}`,
    );
  }
  return def;
}

export function paramsFor(catalog: SymbolCatalog, name: string, overrides?: Params): Params {
  return deepMerge(requireDef(catalog, name).params, overrides);
}

/** The raw geometric parts for a symbol — use this if you want to render to
 * something other than SVG (Canvas2D, WebGL, PDF, …). */
export function getParts(catalog: SymbolCatalog, name: string, overrides?: Params): Part[] {
  const def = requireDef(catalog, name);
  return def.generate(paramsFor(catalog, name, overrides));
}

const DEFAULT_STYLE: Required<RenderStyle> = {
  stroke: 'rgb(66,160,255)',
  strokeWidth: 40,
  dash: null,
  font: 'Arial',
  opacity: 1,
};

function partsToSvg(parts: Part[], style?: RenderStyle): string {
  const s = { ...DEFAULT_STYLE, ...style };
  const dash = escapeXmlAttr(String(s.dash ?? `${s.strokeWidth * 2},${s.strokeWidth * 2}`));
  const stroke = escapeXmlAttr(s.stroke);
  const font = escapeXmlAttr(s.font);
  const chunks: string[] = [
    `<g fill="none" stroke="${stroke}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${s.opacity}">`,
  ];
  for (const part of parts) {
    if (part.kind === 'stroke') {
      chunks.push(`<path d="${part.d}"${part.dashed ? ` stroke-dasharray="${dash}"` : ''}/>`);
    } else if (part.kind === 'fill') {
      chunks.push(`<path d="${part.d}" fill="${stroke}" stroke="none"/>`);
    } else if (part.kind === 'text') {
      const tr = part.rotate ? ` transform="rotate(${f(part.rotate)} ${f(part.pos.x)} ${f(part.pos.y)})"` : '';
      chunks.push(
        `<text x="${f(part.pos.x)}" y="${f(part.pos.y)}" dy="0.35em" font-family="${font}" ` +
        `font-weight="bold" font-size="${f(part.size)}" text-anchor="middle" fill="${stroke}" stroke="none"${tr}>${escapeXmlText(part.text)}</text>`,
      );
    }
  }
  chunks.push('</g>');
  return chunks.join('');
}

/** Inner SVG markup (a <g> element). Insert via innerHTML / dangerouslySetInnerHTML. */
export function render(catalog: SymbolCatalog, name: string, overrides?: Params, style?: RenderStyle): string {
  return partsToSvg(getParts(catalog, name, overrides), style);
}

/** renderSVG()'s default local coordinate box — every built-in symbol's
 * params are authored to sit inside this box. Exported so other renderers
 * (e.g. the milsymbol-compat adapter) can map a param-space point into the
 * same local pixel space renderSVG() itself uses, without duplicating the
 * numbers. */
export const DEFAULT_SVG_BOX = { viewBox: '-100 -100 2300 2100', width: 230, height: 210 } as const;

/** Standalone <svg> document. */
export function renderSVG(
  catalog: SymbolCatalog,
  name: string,
  overrides?: Params,
  opts?: { viewBox?: string; width?: number; height?: number; style?: RenderStyle },
): string {
  const o = { ...DEFAULT_SVG_BOX, ...opts };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o.viewBox}" width="${o.width}" height="${o.height}">${render(catalog, name, overrides, o.style)}</svg>`;
}

/** Handle descriptors for the current params. render()/getParts() do NOT
 * draw these — a rendering layer (like overlay/OrderHandleController) draws
 * one marker per descriptor and calls applyHandle() on drag. */
export function getHandles(catalog: SymbolCatalog, name: string, overrides?: Params): EngineHandle[] {
  return requireDef(catalog, name).handles(paramsFor(catalog, name, overrides));
}

/** Apply one handle drag; returns the FULL merged params object. */
export function applyHandle(catalog: SymbolCatalog, name: string, overrides: Params | undefined, handleId: string, pos: Pt): Params {
  const p = paramsFor(catalog, name, overrides);
  const h = requireDef(catalog, name).handles(p).find(x => x.id === handleId);
  if (!h) {throw new Error(`Unknown handle '${handleId}' for symbol '${name}'`);}
  return deepMerge(p, h.set(pos));
}