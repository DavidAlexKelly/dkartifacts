// symbols/catalog/individual/weapon-engagement-zone.ts — standalone,
// tree-shakeable.
//
// Reference #130. "In air defence, airspace of defined dimensions within which
// the responsibility for engagement normally rests with a particular weapon
// system." Three or more anchors.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const WEAPON_ENGAGEMENT_ZONE_NAME = "svg-weapon-engagement-zone" as const;

export const weaponEngagementZoneSymbol: SymbolDefinition = {
  title: 'Weapon Engagement Zone (WEZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['WEZ'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
