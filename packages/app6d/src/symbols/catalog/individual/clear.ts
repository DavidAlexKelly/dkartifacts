// symbols/catalog/individual/clear.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { blockFamily, blockHandles } from "../../families";

export const CLEAR_NAME = "svg-clear" as const;

export const clearSymbol: SymbolDefinition = {
    title: 'Clear',
    params: { A: P(129, 889), B: P(1809, 889), barrierHalf: 840, railOffset: 673, chevLen: 204, chevSpread: 35, arrowCount: 3, label: 'C', labelSize: 218 },
    generate: blockFamily, handles: blockHandles, unitAnchor: 'start', meta: { sidcTaskId: "clear" },
  };
