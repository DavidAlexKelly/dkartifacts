// symbols/catalog/individual/single-fence.ts — standalone, tree-shakeable.
//
// Reference #304. Two anchors defining the line, with posts crossing it — the
// extracted template is a line with three short bars through it, evenly
// spaced, which is the tick row with `bar` ticks.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { tickRowFamily, tickRowHandles } from "../../families";

export const SINGLE_FENCE_NAME = "svg-single-fence" as const;

export const singleFenceSymbol: SymbolDefinition = {
  title: 'Single Fence',
  params: {
    A: P(250, 1024), B: P(1800, 1024), count: 3, tickSize: 150,
    tickShape: 'bar', dashed: false, headArrow: false,
  },
  generate: tickRowFamily,
  handles: tickRowHandles,
  unitAnchor: 'midline',
  meta: { sidcTaskId: "unspecified-wire-obstacle" },
};
