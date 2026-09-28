// symbols/catalog/individual/axis-notched-simple.ts — standalone, tree-shakeable.
import type { SymbolDefinition, Params } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { axisHandles, axisOfAdvance } from "../../families";

export const AXIS_NOTCHED_SIMPLE_NAME = "svg-axis-notched-simple" as const;

export const axisNotchedSimpleSymbol: SymbolDefinition = { title: 'Axis of Advance (simple step)', params: { spine: [P(60, 1500), P(60, 700), P(1900, 700)], halfWidth: 180, headLen: 260, headHalf: 220, dashed: false }, generate(p: Params) { return [axisOfAdvance(p as any)]; }, handles: axisHandles, unitAnchor: 'start' };
