// symbols/catalog/individual/aviation-axis-of-advance.ts — standalone, tree-shakeable.
import type { SymbolDefinition, Params, Part } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { axisHandles, axisOfAdvance } from "../../families";

export const AVIATION_AXIS_OF_ADVANCE_NAME = "svg-aviation-axis-of-advance" as const;

// Authored outside the parameter box until now: the spine ran to x 2503 and
// y 2172 against a 0-2048 box, so the /symbols page clipped the arrowhead and
// put the tail — which is the unit's own position — off the bottom of the tile
// entirely. Same shape, scaled by 0.8 about its own centre and re-centred, with
// halfWidth, headLen and headHalf scaled to match so the proportions hold.
export const aviationAxisOfAdvanceSymbol: SymbolDefinition = {
    title: 'Aviation Axis Of Advance',
    params: { spine: [P(276, 1864), P(276, 893), P(568, 425), P(1110, 685), P(1959, 685)], halfWidth: 187, headLen: 425, headHalf: 260 },
    generate(p: Params): Part[] { return [axisOfAdvance(p as any)]; },
    handles: axisHandles,
    unitAnchor: 'start',
  };
