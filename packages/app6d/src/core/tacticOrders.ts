// core/tacticOrders.ts — SIDC catalog + screen-space placement math for
// APP-6D-style tactical order graphics. Operates against an explicit
// SymbolCatalog value (no shared global state) — every function here
// takes `catalog` as its first argument. Pass APP6D_CATALOG from
// "@acc/app6d/symbols" for the built-in set, or your own
// catalog (built via `APP6D_CATALOG.extend({...})` or `new SymbolCatalog({...})`)
// if you've added custom graphics.
import type { SymbolCatalog } from "../engine/catalog";
import {
  render as engineRender,
  getHandles as engineGetHandles,
  applyHandle as engineApplyHandle,
} from "../engine/render";
import type { Params } from "../engine/types";
import { lookupTaskForOrder, lookupTaskBySidc } from "./tacticTaskCatalog";

export type TacticCategory = "Offensive" | "Defensive" | "Manoeuvre" | "Fire Support" | "Control Measures";
export type TacticIconFn = (colour: string) => string;

export interface Pt2 { x: number; y: number; }

export type MapRenderFn = (
  from: Pt2, to: Pt2, colour: string, mid?: Pt2,
  milxParams?: Record<string, unknown>, zoom?: number, arrowScale?: number,
) => string;

export interface TacticOrder {
  id: string;
  label: string;
  description: string;
  sidc: string;
  category: TacticCategory;
  keywords?: string[];
  icon: TacticIconFn;
  renderOnMap: MapRenderFn;
}

export interface MilxPlacementConfig {
  /** px per param-unit at `baseZoom`. Default: 0.004. */
  pxPerUnit: number;
  /** zoom level `pxPerUnit` was tuned for. Default: 7. */
  baseZoom: number;
}
export const DEFAULT_MILX_PLACEMENT: MilxPlacementConfig = { pxPerUnit: 0.004, baseZoom: 7 };
/**
 * Origin of the parameter box, exported because a SECOND renderer needs it.
 *
 * `renderOnMap` places a symbol with an affine transform — translate to the
 * anchor, scale by zoom, translate the param origin to zero — and anything
 * drawing the same symbol another way (as GeoJSON on the terrain, say) has to
 * use the SAME transform or the two disagree. Re-deriving these constants in a
 * second module is exactly how that happens: retune `pxPerUnit` and only one
 * renderer moves.
 */
export const MILX_ORIGIN: Pt2 = { x: 1050, y: 950 };
const MILX_STROKE_PX = 2.2;

export interface MilxTransform { s: number; f: Pt2; }
export function milxTransformFor(anchor: Pt2, zoom?: number, arrowScale?: number, cfg: MilxPlacementConfig = DEFAULT_MILX_PLACEMENT): MilxTransform {
  const zoomScale = zoom !== undefined ? Math.pow(2, zoom - cfg.baseZoom) : 1;
  return { s: cfg.pxPerUnit * zoomScale * (arrowScale ?? 1), f: anchor };
}
export function milxToScreen(tr: MilxTransform, p: Pt2): Pt2 {
  return { x: tr.f.x + (p.x - MILX_ORIGIN.x) * tr.s, y: tr.f.y + (p.y - MILX_ORIGIN.y) * tr.s };
}
export function screenToMilx(tr: MilxTransform, p: Pt2): Pt2 {
  return { x: MILX_ORIGIN.x + (p.x - tr.f.x) / tr.s, y: MILX_ORIGIN.y + (p.y - tr.f.y) / tr.s };
}

// ── SIDC ↔ catalog-name mapping ────────────────────────────────────────────
// NOTE: synthetic identifiers derived from catalog names (e.g. "svg-block"
// -> "SVGBLOCK"), NOT real MIL-STD-2525/APP-6 SIDCs — those live in
// tacticTaskCatalog.ts as a separate key space.
//
// Cached per SymbolCatalog reference: a SymbolCatalog is immutable once
// constructed, so this map can be built once and reused instead of
// recomputing it on every isMilxOrder/milxHandlesForOrder/applyMilxOrderHandle
// call — several of which run on every pointermove while dragging a handle.
const sidcKeyCache = new WeakMap<SymbolCatalog, Record<string, string>>();
function nameBySidcKey(catalog: SymbolCatalog): Record<string, string> {
  const cached = sidcKeyCache.get(catalog);
  if (cached) {return cached;}
  const map = Object.fromEntries(catalog.list().map((n) => [n.toUpperCase().replace(/-/g, ""), n]));
  sidcKeyCache.set(catalog, map);
  return map;
}

export function isMilxOrder(catalog: SymbolCatalog, sidc: string | undefined): boolean {
  if (!sidc) {return false;}
  return sidc in nameBySidcKey(catalog);
}

export function milxHasCenterHandle(catalog: SymbolCatalog, sidc: string | undefined): boolean {
  const map = nameBySidcKey(catalog);
  const name = sidc ? map[sidc] : undefined;
  if (!name) {return false;}
  return engineGetHandles(catalog, name).some((h) => h.id === "center");
}

export interface MilxMapHandle { id: string; kind: "point" | "scalar"; pos: Pt2; }

export function milxHandlesForOrder(
  catalog: SymbolCatalog, sidc: string, anchor: Pt2, params?: Record<string, unknown>, zoom?: number, arrowScale?: number, cfg?: MilxPlacementConfig,
): MilxMapHandle[] {
  const name = nameBySidcKey(catalog)[sidc];
  if (!name) {return [];}
  const tr = milxTransformFor(anchor, zoom, arrowScale, cfg);
  return engineGetHandles(catalog, name, params).map((h) => ({ id: h.id, kind: h.kind, pos: milxToScreen(tr, h.pos) }));
}

/**
 * The point (in the same param/local coordinate space as a symbol's own
 * handles — i.e. what `getHandles()` returns, NOT screen or world space)
 * that represents "the anchor" for a symbol instance: where a unit marker
 * or a milsymbol-style getAnchor() caller should consider its true
 * position to be. Resolution order per `unitAnchor`:
 *
 *  - "center": a literal "center" handle if the symbol has one.
 *  - "start":  "spine0", else "A", else "P1", else "tip" (the conventional
 *              first-point names used across the built-in families; "tip" is
 *              the inverted-cone point markers, whose anchor is their point).
 *  - "end":    the last "spine*" handle, else "B", else "P2".
 *  - "midline": the midpoint of the "start"/"end" pair above.
 *
 * Falls back to the first/last point handle (by array position) for
 * start/end, and to the centroid of all point handles for center/midline/
 * unrecognised/undeclared — so a symbol with fully bespoke handle names
 * (e.g. "svg-support-by-fire-position") or no unitAnchor at all still gets
 * a sensible anchor instead of `undefined`, everywhere except the
 * deliberately-conservative milxFromForAnchorClick click-placement flow
 * below (which treats "no unitAnchor" as "don't touch the click point").
 *
 * Returns undefined only if the symbol has no point-kind handles at all.
 */
/**
 * The anchor as a HANDLE, not just a point: `{ id, pos }`.
 *
 * `id` is undefined for "midline" and for the centroid fallbacks, which are
 * derived positions with no single handle behind them — a caller wanting to
 * drag "the anchor" must handle that, and silently returning one of the two
 * midline handles would be worse than saying so.
 *
 * Exported because attaching a unit to a graphic needs the id, not the point:
 * keeping the rest of a symbol still while its anchor follows a moving unit
 * means re-applying every OTHER handle, which you cannot express without
 * knowing which one is the anchor. Consumers were otherwise re-deriving these
 * rules — spine0, else A, else P1, and so on — from this function's prose.
 */
export function resolveUnitAnchorHandle(
  catalog: SymbolCatalog,
  name: string,
  overrides?: Params,
): { id?: string; pos: Pt2 } | undefined {
  const unitAnchor = catalog.get(name)?.unitAnchor;
  const handles = engineGetHandles(catalog, name, overrides);
  const pointHandles = handles.filter((h) => h.kind === "point");
  if (pointHandles.length === 0) {return undefined;}

  const centroid = (): { pos: Pt2 } => ({
    pos: {
      x: pointHandles.reduce((s, h) => s + h.pos.x, 0) / pointHandles.length,
      y: pointHandles.reduce((s, h) => s + h.pos.y, 0) / pointHandles.length,
    },
  });

  if (unitAnchor === "center") {
    return handles.find((h) => h.id === "center") ?? centroid();
  }
  if (unitAnchor === "start") {
    return (
      handles.find((h) => h.id === "spine0")
      ?? handles.find((h) => h.id === "A")
      ?? handles.find((h) => h.id === "P1")
      ?? handles.find((h) => h.id === "tip")
      ?? pointHandles[0]
    );
  }
  if (unitAnchor === "end") {
    const spineHandles = handles.filter((h) => h.id.startsWith("spine"));
    if (spineHandles.length > 0) {return spineHandles[spineHandles.length - 1];}
    return (
      handles.find((h) => h.id === "B")
      ?? handles.find((h) => h.id === "P2")
      ?? pointHandles[pointHandles.length - 1]
    );
  }
  if (unitAnchor === "midline") {
    const hA = handles.find((h) => h.id === "A") ?? handles.find((h) => h.id === "P1") ?? pointHandles[0];
    const hB = handles.find((h) => h.id === "B") ?? handles.find((h) => h.id === "P2") ?? pointHandles[pointHandles.length - 1];
    if (hA === hB) {return hA;}
    return { pos: { x: (hA.pos.x + hB.pos.x) / 2, y: (hA.pos.y + hB.pos.y) / 2 } };
  }
  return centroid();
}

/** The handle a unit attaches to, or undefined if the anchor is derived. */
export function getUnitAnchorHandleId(catalog: SymbolCatalog, name: string, overrides?: Params): string | undefined {
  return resolveUnitAnchorHandle(catalog, name, overrides)?.id;
}

export function getSymbolAnchorPoint(catalog: SymbolCatalog, name: string, overrides?: Params): Pt2 | undefined {
  return resolveUnitAnchorHandle(catalog, name, overrides)?.pos;
}

export function milxFromForAnchorClick(catalog: SymbolCatalog, sidc: string, clickPx: Pt2, zoom?: number, arrowScale?: number, cfg?: MilxPlacementConfig, overrides?: Record<string, unknown>): Pt2 {
  const name = nameBySidcKey(catalog)[sidc];
  if (!name) {return clickPx;}
  if (!catalog.get(name)?.unitAnchor) {return clickPx;}

  const tr = milxTransformFor(clickPx, zoom, arrowScale, cfg);
  // `overrides` matters: the anchor is a handle position, and handle positions
  // move with the params. Computing it from the symbol's DEFAULTS — which is
  // all this could do before — put the anchor of an order whose spine had been
  // bent along a route wherever the pristine symbol's first bend happened to
  // be, which is exactly the offset this function exists to remove.
  const anchorPoint = getSymbolAnchorPoint(catalog, name, overrides);
  if (!anchorPoint) {return clickPx;}

  const anchorScreenWithFromAtClick = milxToScreen(tr, anchorPoint);
  const dx = clickPx.x - anchorScreenWithFromAtClick.x, dy = clickPx.y - anchorScreenWithFromAtClick.y;
  return { x: clickPx.x + dx, y: clickPx.y + dy };
}

export function applyMilxOrderHandle(
  catalog: SymbolCatalog, sidc: string, anchor: Pt2, params: Record<string, unknown> | undefined, handleId: string,
  screenPos: Pt2, zoom?: number, arrowScale?: number, cfg?: MilxPlacementConfig,
): Record<string, unknown> | null {
  const name = nameBySidcKey(catalog)[sidc];
  if (!name) {return null;}
  const tr = milxTransformFor(anchor, zoom, arrowScale, cfg);
  try {
    return engineApplyHandle(catalog, name, params, handleId, screenToMilx(tr, screenPos));
  } catch {
    return null;
  }
}

function buildTacticOrder(catalog: SymbolCatalog, name: string): TacticOrder {
  return {
    id: name,
    label: name.replace(/^svg-/, "").replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
    description: "",
    sidc: name.toUpperCase().replace(/-/g, ""),
    category: "Control Measures",
    keywords: name.split("-").filter(Boolean),
    icon: (c: string) => {
      const s = 40 / 2300;
      const inner = engineRender(catalog, name, undefined, { stroke: c, strokeWidth: 130 });
      return `<g transform="scale(${s.toFixed(5)}) translate(100,200)">${inner}</g>`;
    },
    renderOnMap: (f: Pt2, _t: Pt2, colour: string, _mid?: Pt2, milxParams?: Record<string, unknown>, zoom?: number, arrowScale?: number) => {
      const tr = milxTransformFor(f, zoom, arrowScale);
      const inner = engineRender(catalog, name, milxParams, { stroke: colour, strokeWidth: MILX_STROKE_PX / tr.s });
      return `<g transform="translate(${tr.f.x.toFixed(1)},${tr.f.y.toFixed(1)}) scale(${tr.s.toFixed(6)}) translate(${(-MILX_ORIGIN.x).toFixed(1)},${(-MILX_ORIGIN.y).toFixed(1)})">${inner}</g>`;
    },
  };
}

/**
 * All tactic orders derived from `catalog`. Since a SymbolCatalog is
 * immutable, this is safe to call as often as you like (e.g. inside a
 * `useMemo` keyed on the catalog reference) — it will always return the
 * same result for the same catalog, with no dependency on module-load
 * timing anywhere.
 */
export function getTacticOrders(catalog: SymbolCatalog): TacticOrder[] {
  return catalog.list().map((name) => buildTacticOrder(catalog, name));
}

export const TACTIC_CATEGORIES: TacticCategory[] = ["Offensive", "Defensive", "Manoeuvre", "Fire Support", "Control Measures"];

// ── Task-name → SIDC resolution ──────────────────────────────────────────
function byLabelIndex(orders: TacticOrder[]) { return new Map(orders.map((o) => [o.label.toLowerCase(), o])); }
function byIdIndex(orders: TacticOrder[]) { return new Map(orders.map((o) => [o.id.toLowerCase(), o])); }

export function resolveTacticSidc(catalog: SymbolCatalog, taskName: string | undefined): string | undefined {
  if (!taskName) {return undefined;}
  const normalized = taskName.trim().toLowerCase();
  if (!normalized) {return undefined;}

  const orders = getTacticOrders(catalog);
  const labelMatch = byLabelIndex(orders).get(normalized);
  if (labelMatch) {return labelMatch.sidc;}

  const svgKey = `svg-${normalized.replace(/\s+/g, "-")}`;
  const idMatch = byIdIndex(orders).get(svgKey);
  if (idMatch) {return idMatch.sidc;}

  return `TASK_${normalized.replace(/[\^a-z0-9]/g, "").toUpperCase()}`;
}

// ── Real doctrinal SIDC → catalog entry ──────────────────────────────────
// The reverse of the above: given a real MIL-STD-2525/APP-6 SIDC (as
// opposed to this library's synthetic "SVGSEIZE"-style renderer keys),
// find which catalog entry — if any — renders it. Built once per catalog
// from each SymbolDefinition's `meta.sidcTaskId` (which cross-references
// TACTIC_TASK_CATALOG's `id`), since a SymbolCatalog is immutable.
const taskIdToNameCache = new WeakMap<SymbolCatalog, Map<string, string>>();
function taskIdToName(catalog: SymbolCatalog): Map<string, string> {
  const cached = taskIdToNameCache.get(catalog);
  if (cached) {return cached;}
  const map = new Map<string, string>();
  for (const name of catalog.list()) {
    const taskId = catalog.get(name)?.meta?.sidcTaskId;
    if (typeof taskId === "string") {map.set(taskId, name);}
  }
  taskIdToNameCache.set(catalog, map);
  return map;
}

/**
 * Resolves any SIDC-shaped identifier to a catalog entry name — whichever
 * kind of SIDC the caller has on hand:
 *
 *  - This library's own synthetic renderer keys ("svg-seize" -> "SVGSEIZE").
 *  - A real doctrinal MIL-STD-2525/APP-6 SIDC (e.g. "GFTPO---------G" for
 *    Occupy), via each symbol's `meta.sidcTaskId` cross-referencing
 *    `TACTIC_TASK_CATALOG`.
 *
 * Not every built-in symbol has a corresponding doctrinal task catalogued
 * (a few are unlabeled/generic rendering variants of a labeled symbol, or
 * real graphics this library doesn't yet catalogue the doctrinal SIDC
 * for) — those still resolve via the synthetic key, just not via a real
 * SIDC. Returns undefined if `sidc` doesn't match anything in `catalog`
 * either way.
 */
export function resolveCatalogNameForSidc(catalog: SymbolCatalog, sidc: string): string | undefined {
  const bySynthetic = nameBySidcKey(catalog)[sidc];
  if (bySynthetic) {return bySynthetic;}
  const task = lookupTaskBySidc(sidc);
  if (!task) {return undefined;}
  return taskIdToName(catalog).get(task.id);
}

export function getUnitAnchorForSidc(catalog: SymbolCatalog, tacticSidc: string | undefined): "start" | "end" | "center" | "midline" | undefined {
  if (!tacticSidc) {return undefined;}
  const order = getTacticOrders(catalog).find((o) => o.sidc === tacticSidc);
  if (!order) {return undefined;}
  return catalog.get(order.id)?.unitAnchor;
}

export function computeUnitAnchorPosition(
  catalog: SymbolCatalog,
  arrow: { fromLat: number; fromLng: number; toLat: number; toLng: number; tacticSidc?: string },
): { lat: number; lng: number } | undefined {
  const anchor = getUnitAnchorForSidc(catalog, arrow.tacticSidc);
  if (!anchor) {return undefined;}
  if (isMilxOrder(catalog, arrow.tacticSidc)) {return { lat: arrow.fromLat, lng: arrow.fromLng };}
  switch (anchor) {
    case "start": return { lat: arrow.fromLat, lng: arrow.fromLng };
    case "end": return { lat: arrow.toLat, lng: arrow.toLng };
    case "center": return { lat: arrow.fromLat, lng: arrow.fromLng };
    case "midline": return { lat: (arrow.fromLat + arrow.toLat) / 2, lng: (arrow.fromLng + arrow.toLng) / 2 };
    default: return undefined;
  }
}

export { lookupTaskForOrder };