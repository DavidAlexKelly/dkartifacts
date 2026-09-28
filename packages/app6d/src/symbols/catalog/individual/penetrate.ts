// symbols/catalog/individual/penetrate.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { blockFamily, blockHandles } from "../../families";

export const PENETRATE_NAME = "svg-penetrate" as const;

export const penetrateSymbol: SymbolDefinition = {
    title: 'Penetrate',
    params: { A: P(129, 889), B: P(1809, 889), barrierHalf: 840, chevLen: 204, chevSpread: 35, arrowCount: 1, label: 'P', labelSize: 218 },
    generate: blockFamily, handles: blockHandles, unitAnchor: 'start', meta: { sidcTaskId: "penetrate" },
  };
