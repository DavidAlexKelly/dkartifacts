// symbols/catalog/individual/downed-aircrew-pickup-point.ts — standalone,
// tree-shakeable.
//
// Reference #109 ("Downed Aircrew Pick-Up Pont" — the publication's own typo).
// Triaged static with one anchor, and the extracted template is the family's
// inverted cone at the shared proportions. No abbreviation was recovered from
// the crop, so the cone is drawn empty.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const DOWNED_AIRCREW_PICKUP_POINT_NAME = "svg-downed-aircrew-pickup-point" as const;

export const downedAircrewPickupPointSymbol: SymbolDefinition = {
  title: 'Downed Aircrew Pick-Up Point',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: '', labelSize: 380 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
