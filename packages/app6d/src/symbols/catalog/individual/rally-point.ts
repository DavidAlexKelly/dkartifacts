// symbols/catalog/individual/rally-point.ts — standalone, tree-shakeable.
//
// Reference #13. "An easily identifiable point on the ground at which units can
// reassemble and reorganise if they become dispersed."
//
// This row lost its DRAW RULES page to the crop, so the family comes from the
// geometry instead: the extracted template is the inverted cone at exactly the
// proportions the rest of the family shares (see tools/control-measures —
// box 4/3 of the width, taper 2/3). "RLY" is the doctrinal abbreviation and
// survives in the publication's example crop.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const RALLY_POINT_NAME = "svg-rally-point" as const;

export const rallyPointSymbol: SymbolDefinition = {
  title: 'Rally Point',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: 'RLY', labelSize: 330 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
