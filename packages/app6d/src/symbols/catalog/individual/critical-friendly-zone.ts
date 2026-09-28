// symbols/catalog/individual/critical-friendly-zone.ts — standalone,
// tree-shakeable.
//
// Reference #277. "An area, usually a friendly unit or location, that the
// manoeuvre commander designates as critical to the protection of an asset."
// A drawn ring with a movable label block; "CFZ" is the standard abbreviation.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const CRITICAL_FRIENDLY_ZONE_NAME = "svg-critical-friendly-zone" as const;

export const criticalFriendlyZoneSymbol: SymbolDefinition = {
  title: 'Critical Friendly Zone (CFZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['CFZ'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
