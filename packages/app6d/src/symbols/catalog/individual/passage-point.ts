// symbols/catalog/individual/passage-point.ts — standalone, tree-shakeable.
//
// Reference #10. "A specifically designated place where the passing units will
// pass through the stationary unit." Anchored at the tip, rotated in 90 degree
// increments.
//
// "PP" is the conventional abbreviation for this graphic. Unlike the "LU" on
// the linkup point it was not recovered from the extraction, so treat it as
// the default rather than as evidence — it is one param away from wrong.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const PASSAGE_POINT_NAME = "svg-passage-point" as const;

export const passagePointSymbol: SymbolDefinition = {
  title: 'Passage Point',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: 'PP', labelSize: 380 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
