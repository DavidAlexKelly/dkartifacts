// symbols/catalog/individual/fighter-engagement-zone.ts — standalone,
// tree-shakeable.
//
// Reference #131. "In air defence, airspace of defined dimensions within which
// the responsibility for engagement normally rests with fighter aircraft."
// Three or more anchors.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const FIGHTER_ENGAGEMENT_ZONE_NAME = "svg-fighter-engagement-zone" as const;

export const fighterEngagementZoneSymbol: SymbolDefinition = {
  title: 'Fighter Engagement Zone (FEZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['FEZ'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
