// symbols/paramTypes.ts — per-symbol parameter types for better DX than the
// engine's generic Params (Record<string, unknown>). Only symbols with a
// declared entry here get typed applyHandleTyped()/paramsForTyped() —
// everything else still works untyped via the generic engine API.
//
// These wrappers take an explicit SymbolCatalog (no default) since this
// module lives at the engine/symbols layer, not the domain layer. Pass
// APP6D_CATALOG (from "./index") if you want the built-in catalog's
// symbols typed:
//
//   paramsForTyped(APP6D_CATALOG, "svg-block", { barrierHalf: 900 })
import type { Pt } from "../engine/geometry";
import type { SymbolCatalog } from "../engine/catalog";
import { applyHandle as applyHandleUntyped, paramsFor as paramsForUntyped } from "../engine/render";

export interface BlockParams {
  A: Pt; B: Pt; barrierHalf: number; chevLen: number; chevSpread: number;
  arrowCount: 1 | 3; label: string; labelSize: number; railOffset?: number;
}
export interface SeizeParams {
  center: Pt; radius: number; gapAngle: number; gapHalf: number;
  headLen: number; labelAngle: number; label: string; labelSize: number;
  markerAngle: number; markerRadius: number;
}
export interface ScreenParams {
  A: Pt; B: Pt; peaks: number; amp: number; hookLen: number; hookAngle: number;
  copies: number; spacing: number; label: string; labelSize: number;
}
export interface DestroyParams {
  center: Pt; scale: number; rotation: number;
}
export interface CounterattackParams {
  spine: Pt[]; halfWidth: number; headLen: number; headHalf: number;
  label: string; labelSize: number; dashed: boolean;
}

/** Maps built-in symbol names to their typed param shape. Extend this as
 * you add more individually-typed symbols. */
export interface SymbolParamsMap {
  "svg-block": BlockParams;
  "svg-seize": SeizeParams;
  "svg-screen-ss": ScreenParams;
  "svg-destroy": DestroyParams;
  "svg-counterattack": CounterattackParams;
}

export function paramsForTyped<K extends keyof SymbolParamsMap>(
  catalog: SymbolCatalog,
  name: K,
  overrides?: Partial<SymbolParamsMap[K]>,
): SymbolParamsMap[K] {
  return paramsForUntyped(catalog, name, overrides as unknown as Record<string, unknown>) as SymbolParamsMap[K];
}

export function applyHandleTyped<K extends keyof SymbolParamsMap>(
  catalog: SymbolCatalog,
  name: K,
  params: SymbolParamsMap[K] | undefined,
  handleId: string,
  pos: Pt,
): SymbolParamsMap[K] {
  return applyHandleUntyped(catalog, name, params as unknown as Record<string, unknown>, handleId, pos) as SymbolParamsMap[K];
}