// symbols/catalog/individual/block.ts
// Standalone, tree-shakeable: importing this module only pulls in this one
// symbol's definition — nothing runs as a side effect, nothing is
// registered anywhere. Combine it into a catalog yourself:
//
//   const catalog = new SymbolCatalog({ [BLOCK_NAME]: blockSymbol, ... });
//
// or import the pre-built INDIVIDUAL_SYMBOLS / APP6D_CATALOG from the
// barrel files instead.
import { P } from "../../../engine/geometry";
import type { SymbolDefinition } from "../../../engine/types";
import { blockFamily, blockHandles } from "../../families";

export const BLOCK_NAME = "svg-block" as const;

export const blockSymbol: SymbolDefinition = {
  title: 'Block',
  params: { A: P(129, 889), B: P(1809, 889), barrierHalf: 840, chevLen: 0, chevSpread: 35, arrowCount: 1, label: 'B', labelSize: 218 },
  generate: blockFamily,
  handles: blockHandles,
  unitAnchor: 'start',
  meta: { sidcTaskId: "block" },
};