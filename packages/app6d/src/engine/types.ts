// engine/types.ts — generic parametric-graphic types. No domain knowledge
// (no APP-6D, no map library) lives here — this is the substrate the
// symbols/ package and any custom catalog builds on top of.
import type { Pt } from "./geometry";

export type Params = Record<string, any>;

export type Part =
  | { kind: 'stroke'; d: string; dashed: boolean }
  | { kind: 'fill'; d: string }
  | { kind: 'text'; text: string; pos: Pt; size: number; rotate: number };

export interface EngineHandle {
  id: string;
  kind: 'point' | 'scalar';
  /** current position of this handle, given the params it was built from */
  pos: Pt;
  /** apply a drag to this position -> partial param patch */
  set: (pos: Pt) => Params;
}

export interface RenderStyle {
  stroke?: string;
  strokeWidth?: number;
  dash?: string | null;
  font?: string;
  opacity?: number;
}

export interface SymbolDefinition {
  title: string;
  params: Params;
  generate: (p: Params) => Part[];
  handles: (p: Params) => EngineHandle[];
  /**
   * Where a "unit" (or any anchor entity) should sit relative to this
   * graphic, if your domain has that concept. Optional — the engine itself
   * doesn't require it.
   */
  unitAnchor?: "start" | "end" | "center" | "midline";
  /** Free-form metadata a catalog can attach (category, doctrinal id, …). */
  meta?: Record<string, unknown>;
}