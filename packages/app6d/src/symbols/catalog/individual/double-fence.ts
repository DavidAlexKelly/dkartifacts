// symbols/catalog/individual/double-fence.ts — standalone, tree-shakeable.
//
// Reference #305 (and #306, which is the same row printed twice). The single
// fence with paired posts: the extracted template shows two bars at each
// station rather than one, which is the only thing that distinguishes it.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { tickRowFamily, tickRowHandles } from "../../families";

export const DOUBLE_FENCE_NAME = "svg-double-fence" as const;

export const doubleFenceSymbol: SymbolDefinition = {
  title: 'Double Fence',
  params: {
    A: P(250, 1024), B: P(1800, 1024), count: 3, tickSize: 150,
    tickShape: 'double-bar', dashed: false, headArrow: false,
  },
  generate: tickRowFamily,
  handles: tickRowHandles,
  unitAnchor: 'midline',
  meta: { sidcTaskId: "unspecified-wire-obstacle" },
};
