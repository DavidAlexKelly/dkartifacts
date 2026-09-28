// symbols/catalog/individual/holding-line.ts — standalone, tree-shakeable.
//
// Reference #52. "In retrograde river crossing operations, the outer limit of
// the bridgehead." One of the labelled lines: the crop that should have held
// its draw rules caught the example's text instead, and reads "HL HL / PL T PL
// / PT 1 PT 2" — the designation twice, once for each end, which is the family
// this belongs to stated as plainly as the rules would have.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const HOLDING_LINE_NAME = "svg-holding-line" as const;

export const holdingLineSymbol: SymbolDefinition = {
  title: 'Holding Line (HL)',
  params: { spine: [P(520, 1024), P(1528, 1024)], label: 'HL', labelSize: 260, dashed: false },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
