// symbols/catalog/individual/forward-edge-of-battle-area-planned.ts —
// standalone, tree-shakeable.
//
// Reference #69, "Proposed or On Order Forward Edge of the Battle Area". The
// same scalloped line, dashed — that is the publication's convention for
// proposed and on-order graphics throughout, rather than anything specific to
// this row, whose own artwork did not survive the crop.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { scallopLineFamily, polylineHandles } from "../../families";

export const FORWARD_EDGE_OF_BATTLE_AREA_PLANNED_NAME = "svg-forward-edge-of-battle-area-planned" as const;

export const forwardEdgeOfBattleAreaPlannedSymbol: SymbolDefinition = {
  title: 'Forward Edge of the Battle Area (FEBA), Proposed or On Order',
  params: {
    spine: [P(420, 1024), P(1628, 1024)], bumps: 6, side: 1,
    label: 'FEBA', labelSize: 230, dashed: true,
  },
  generate: scallopLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
