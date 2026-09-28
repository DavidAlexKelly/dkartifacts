// symbols/catalog/individual/final-coordination-line.ts — standalone,
// tree-shakeable.
//
// Reference #93. "A line close to the enemy position used to coordinate the
// final deployment of the assault force." Two or more anchors, text at both
// ends.
//
// Solid, on the evidence rather than from memory: some references draw the FCL
// dashed, but the publication's own example is a single unbroken path — a
// dashed line arrives from the PDF as one path per dash, and this is one path
// for the whole line. Set `dashed: true` if your reference says otherwise.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const FINAL_COORDINATION_LINE_NAME = "svg-final-coordination-line" as const;

export const finalCoordinationLineSymbol: SymbolDefinition = {
  title: 'Final Coordination Line',
  params: { spine: [P(520, 1024), P(1528, 1024)], label: 'FCL', labelSize: 250, dashed: false },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
