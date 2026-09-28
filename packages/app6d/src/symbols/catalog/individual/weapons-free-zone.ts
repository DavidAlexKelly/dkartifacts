// symbols/catalog/individual/weapons-free-zone.ts — standalone, tree-shakeable.
//
// Reference #143 (and #144, the same row again). "An air defence zone
// established around key assets, where weapon systems may fire at any target
// not positively identified as friendly." Three or more anchors.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const WEAPONS_FREE_ZONE_NAME = "svg-weapons-free-zone" as const;

export const weaponsFreeZoneSymbol: SymbolDefinition = {
  title: 'Weapons Free Zone (WFZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['WFZ'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
