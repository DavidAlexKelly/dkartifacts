// symbols/catalog/individual/low-altitude-missile-engagement-zone.ts —
// standalone, tree-shakeable.
//
// Reference #137. The low-altitude missile engagement zone: the same drawn
// airspace area as the MEZ, distinguished by its label.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const LOW_ALTITUDE_MISSILE_ENGAGEMENT_ZONE_NAME = "svg-low-altitude-missile-engagement-zone" as const;

export const lowAltitudeMissileEngagementZoneSymbol: SymbolDefinition = {
  title: 'Low Altitude Missile Engagement Zone (LOMEZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['LOMEZ'], labelSize: 220, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
