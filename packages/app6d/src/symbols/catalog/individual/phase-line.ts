// symbols/catalog/individual/phase-line.ts — standalone, tree-shakeable.
//
// Reference #30. "A line utilized for control and coordination of military
// operations." At least two anchors, more to extend the line, and the
// end-of-line information posted at both ends.
//
// The designation is normally the phase line's name — "PL ALPHA" — so `label`
// is the whole string rather than a fixed "PL" plus a field: the publication
// posts one piece of text at each end, not two.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const PHASE_LINE_NAME = "svg-phase-line" as const;

export const phaseLineSymbol: SymbolDefinition = {
  title: 'Phase Line',
  params: { spine: [P(520, 1024), P(1528, 1024)], label: 'PL', labelSize: 260, dashed: false },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
  meta: { sidcTaskId: "phase-line" },
};
