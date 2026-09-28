// symbols/catalog/individual/limit-of-advance.ts — standalone, tree-shakeable.
//
// Reference #95. "An easily recognized terrain feature beyond which attacking
// elements will not advance." Two or more anchors, text posted at both ends —
// which is exactly what the example crop shows: the line, and "LOA" at each
// end of it.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const LIMIT_OF_ADVANCE_NAME = "svg-limit-of-advance" as const;

export const limitOfAdvanceSymbol: SymbolDefinition = {
  title: 'Limit of Advance',
  params: { spine: [P(520, 1024), P(1528, 1024)], label: 'LOA', labelSize: 250, dashed: false },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
