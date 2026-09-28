// symbols/catalog/individual/linkup-point.ts — standalone, tree-shakeable.
//
// Reference #9. "A point where two infiltrating elements in the same or
// different infiltration lanes are scheduled to meet to consolidate before
// proceeding with their missions."
//
// Anchored at the tip. The rules add that this one "will be rotated in 90
// degree increments" — hence rotation about the tip, so turning the box aside
// leaves the marked point where it is. "LU" is the graphic's own abbreviation
// (it survives in the publication's example crop); a designation goes in the
// caller's own text, not in place of it.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const LINKUP_POINT_NAME = "svg-linkup-point" as const;

export const linkupPointSymbol: SymbolDefinition = {
  title: 'Linkup Point',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: 'LU', labelSize: 380 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
