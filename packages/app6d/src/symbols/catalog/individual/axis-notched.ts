// symbols/catalog/individual/axis-notched.ts — standalone, tree-shakeable.
import type { SymbolDefinition, Params } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { axisHandles, axisOfAdvance } from "../../families";

export const AXIS_NOTCHED_NAME = "svg-axis-notched" as const;

export const axisNotchedSymbol: SymbolDefinition = { title: 'Axis of Advance (notched)', params: { spine: [P(60, 1500), P(60, 700), P(600, 300), P(1900, 300)], halfWidth: 200, headLen: 300, headHalf: 260, dashed: false }, generate(p: Params) { return [axisOfAdvance(p as any)]; }, handles: axisHandles, unitAnchor: 'start' };
