// symbols/catalog/individual/axis-notched-wide.ts — standalone, tree-shakeable.
import type { SymbolDefinition, Params } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { axisHandles, axisOfAdvance } from "../../families";

export const AXIS_NOTCHED_WIDE_NAME = "svg-axis-notched-wide" as const;

export const axisNotchedWideSymbol: SymbolDefinition = { title: 'Axis of Advance (wide step)', params: { spine: [P(60, 1600), P(500, 900), P(700, 900), P(1900, 300)], halfWidth: 220, headLen: 300, headHalf: 260, dashed: false }, generate(p: Params) { return [axisOfAdvance(p as any)]; }, handles: axisHandles, unitAnchor: 'start' };
