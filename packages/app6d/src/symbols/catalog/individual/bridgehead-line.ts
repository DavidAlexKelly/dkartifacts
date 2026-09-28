// symbols/catalog/individual/bridgehead-line.ts — standalone, tree-shakeable.
//
// Reference #51. "The limit of the objective area in the development of the
// bridgehead." Two or more anchors, extendable, text posted at both ends —
// the same rules, word for word, as the phase line.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const BRIDGEHEAD_LINE_NAME = "svg-bridgehead-line" as const;

export const bridgeheadLineSymbol: SymbolDefinition = {
  title: 'Bridgehead Line',
  params: { spine: [P(520, 1024), P(1528, 1024)], label: 'BL', labelSize: 260, dashed: false },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
