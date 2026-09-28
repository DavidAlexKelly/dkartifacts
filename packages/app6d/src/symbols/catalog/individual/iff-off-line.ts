// symbols/catalog/individual/iff-off-line.ts — standalone, tree-shakeable.
//
// Reference #111. The line demarking where friendly aircraft switch their
// identification-friend-or-foe transponders off. Two or more anchors,
// extendable, text posted at both ends.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const IFF_OFF_LINE_NAME = "svg-iff-off-line" as const;

export const iffOffLineSymbol: SymbolDefinition = {
  title: 'IFF Off Line',
  params: { spine: [P(520, 1024), P(1528, 1024)], label: 'IFF OFF', labelSize: 190, dashed: false },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
