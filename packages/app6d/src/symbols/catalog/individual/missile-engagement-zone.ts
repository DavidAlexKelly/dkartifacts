// symbols/catalog/individual/missile-engagement-zone.ts — standalone,
// tree-shakeable.
//
// Reference #136. "In air defence, airspace of defined dimensions within which
// the responsibility for engagement of air threats normally rests with
// surface-to-air missile systems." A drawn area with a movable label block.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const MISSILE_ENGAGEMENT_ZONE_NAME = "svg-missile-engagement-zone" as const;

export const missileEngagementZoneSymbol: SymbolDefinition = {
  title: 'Missile Engagement Zone (MEZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['MEZ'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
  meta: { sidcTaskId: "missile-engagement-zone-mez" },
};
