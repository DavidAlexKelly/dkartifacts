// symbols/catalog/individual/landing-zone.ts — standalone, tree-shakeable.
//
// Reference #43. "A specified zone used for the landing of aircraft." Three or
// more anchors defining the area.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const LANDING_ZONE_NAME = "svg-landing-zone" as const;

export const landingZoneSymbol: SymbolDefinition = {
  title: 'Landing Zone (LZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['LZ'], labelSize: 260, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
