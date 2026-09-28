// symbols/catalog/individual/call-for-fire-zone.ts — standalone, tree-shakeable.
//
// Reference #275. "A search area from which the commander wants to attack
// hostile firing systems." A drawn ring with a movable label block; "CFFZ" is
// the standard abbreviation.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const CALL_FOR_FIRE_ZONE_NAME = "svg-call-for-fire-zone" as const;

export const callForFireZoneSymbol: SymbolDefinition = {
  title: 'Call For Fire Zone (CFFZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['CFFZ'], labelSize: 230, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
