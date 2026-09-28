// symbols/catalog/individual/fire-support-coordination-line.ts — standalone,
// tree-shakeable.
//
// Reference #235. The FSCL: beyond it, forces may attack surface targets
// without further coordination with the establishing headquarters. Two or more
// anchors, text posted at both ends.
//
// The establishing headquarters and the effective date-time group belong with
// the label in practice — "FSCL 3 BDE" over a DTG — but the publication posts
// one string at each end, so this is one string.
//
// Capped with a bar across each end, as the example crop draws it: a tall
// vertical path at either end of the line, alongside the two text blocks.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const FIRE_SUPPORT_COORDINATION_LINE_NAME = "svg-fire-support-coordination-line" as const;

export const fireSupportCoordinationLineSymbol: SymbolDefinition = {
  title: 'Fire Support Coordination Line (FSCL)',
  params: { spine: [P(520, 1024), P(1528, 1024)], label: 'FSCL', labelSize: 230, dashed: false, endTick: 360 },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
