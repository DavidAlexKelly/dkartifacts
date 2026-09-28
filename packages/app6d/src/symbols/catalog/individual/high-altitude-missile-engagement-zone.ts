// symbols/catalog/individual/high-altitude-missile-engagement-zone.ts —
// standalone, tree-shakeable.
//
// Reference #138 (and #139-#141, which are the same row repeated by the page
// crop). The high-altitude missile engagement zone: the same drawn airspace
// area as the MEZ, distinguished by its label.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const HIGH_ALTITUDE_MISSILE_ENGAGEMENT_ZONE_NAME = "svg-high-altitude-missile-engagement-zone" as const;

export const highAltitudeMissileEngagementZoneSymbol: SymbolDefinition = {
  title: 'High Altitude Missile Engagement Zone (HIMEZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['HIMEZ'], labelSize: 220, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
