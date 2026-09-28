// symbols/catalog/individual/point-of-departure.ts — standalone, tree-shakeable.
//
// Reference #105. "A specific place where a unit will cross the line of
// departure." One anchor at the tip of the inverted cone, drawn upright.
//
// The extracted template is the same cone as the rest of the family, at
// 544 wide against #1's 584 — the difference is the page crop's scale, not the
// symbol, so the shared proportions are used unchanged. Labelled "PD", read
// out of the template with tools/control-measures/text.mjs.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const POINT_OF_DEPARTURE_NAME = "svg-point-of-departure" as const;

export const pointOfDepartureSymbol: SymbolDefinition = {
  title: 'Point of Departure',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: 'PD', labelSize: 380 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
