// symbols/catalog/individual/forward-line-of-own-troops-planned.ts —
// standalone, tree-shakeable.
//
// References #23, #24 and #25, "Friendly Planned or On Order" — the same row
// three times over. The scalloped forward line, dashed, which is the
// publication's convention for proposed and on-order graphics throughout.
//
// #22 "Friendly Present" is the solid one, already in the catalog as the FLOT;
// its example crop is the same `M C6` chain of curve segments. #26 to #28, the
// enemy versions, are not separate symbols here: the difference is the
// affiliation colour a renderer applies, not the geometry.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { scallopLineFamily, polylineHandles } from "../../families";

export const FORWARD_LINE_OF_OWN_TROOPS_PLANNED_NAME = "svg-forward-line-of-own-troops-planned" as const;

export const forwardLineOfOwnTroopsPlannedSymbol: SymbolDefinition = {
  title: 'Forward Line of Own Troops (FLOT), Planned or On Order',
  params: {
    spine: [P(420, 1024), P(1628, 1024)], bumps: 6, side: 1,
    label: 'FLOT', labelSize: 220, dashed: true,
  },
  generate: scallopLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
