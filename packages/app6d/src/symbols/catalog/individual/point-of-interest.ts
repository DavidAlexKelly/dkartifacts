// symbols/catalog/individual/point-of-interest.ts — standalone, tree-shakeable.
//
// Reference #11. Inverted cone anchored at its tip, rotated in 90 degree
// increments. The publication gives this row no definition and no fixed
// abbreviation that the extraction could confirm, so the cone is drawn empty
// and the text is the caller's.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const POINT_OF_INTEREST_NAME = "svg-point-of-interest" as const;

export const pointOfInterestSymbol: SymbolDefinition = {
  title: 'Point of Interest',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: '', labelSize: 380 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
