// symbols/catalog/individual/forward-edge-of-battle-area.ts — standalone,
// tree-shakeable.
//
// Reference #68. "The foremost limits of a series of areas in which ground
// combat units are deployed." Two or more anchors, text at both ends.
//
// Scalloped, not straight: the publication's example draws the line as a
// single path of five curve segments, 723 long and 55 tall — bumps whose
// radius is half their spacing. The bumps face the enemy, which is the side
// `side` selects.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { scallopLineFamily, polylineHandles } from "../../families";

export const FORWARD_EDGE_OF_BATTLE_AREA_NAME = "svg-forward-edge-of-battle-area" as const;

export const forwardEdgeOfBattleAreaSymbol: SymbolDefinition = {
  title: 'Forward Edge of the Battle Area (FEBA)',
  params: {
    spine: [P(420, 1024), P(1628, 1024)], bumps: 6, side: 1,
    label: 'FEBA', labelSize: 230, dashed: false,
  },
  generate: scallopLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
