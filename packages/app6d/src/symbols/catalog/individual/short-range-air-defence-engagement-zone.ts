// symbols/catalog/individual/short-range-air-defence-engagement-zone.ts —
// standalone, tree-shakeable.
//
// Reference #142. "In air defence, that airspace of defined dimensions within
// which the responsibility for engagement normally rests with short-range air
// defence weapons." A drawn area with a movable label block.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const SHORT_RANGE_AIR_DEFENCE_ENGAGEMENT_ZONE_NAME = "svg-short-range-air-defence-engagement-zone" as const;

export const shortRangeAirDefenceEngagementZoneSymbol: SymbolDefinition = {
  title: 'Short Range Air Defence Engagement Zone (SHORADEZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['SHORADEZ'], labelSize: 180, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
