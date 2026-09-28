// symbols/catalog/individual/air-to-air-restricted-operations-zone.ts —
// standalone, tree-shakeable.
//
// Reference #125. The air-to-air restricted operations zone: the same drawn
// airspace area as the ROZ, distinguished by its label.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const AIR_TO_AIR_RESTRICTED_OPERATIONS_ZONE_NAME = "svg-air-to-air-restricted-operations-zone" as const;

export const airToAirRestrictedOperationsZoneSymbol: SymbolDefinition = {
  title: 'Air-to-Air Restricted Operations Zone (AARROZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['AARROZ'], labelSize: 190, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
