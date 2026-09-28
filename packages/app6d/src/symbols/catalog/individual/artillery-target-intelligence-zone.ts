// symbols/catalog/individual/artillery-target-intelligence-zone.ts —
// standalone, tree-shakeable.
//
// Reference #274. "An area in enemy territory that the commander monitors
// closely for the appearance of high-payoff targets." A drawn ring with a
// movable label block; "ATIZ" is the standard abbreviation.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const ARTILLERY_TARGET_INTELLIGENCE_ZONE_NAME = "svg-artillery-target-intelligence-zone" as const;

export const artilleryTargetIntelligenceZoneSymbol: SymbolDefinition = {
  title: 'Artillery Target Intelligence Zone (ATIZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['ATIZ'], labelSize: 230, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
