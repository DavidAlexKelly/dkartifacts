// symbols/catalog/individual/uav-restricted-operations-zone.ts — standalone,
// tree-shakeable.
//
// Reference #126 (and #127-#129, the same row repeated by the crop). The
// unmanned aerial vehicle restricted operations zone — the ROZ's drawn area
// with its own label.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const UAV_RESTRICTED_OPERATIONS_ZONE_NAME = "svg-uav-restricted-operations-zone" as const;

export const uavRestrictedOperationsZoneSymbol: SymbolDefinition = {
  title: 'Unmanned Aerial Vehicle Restricted Operations Zone (UAVROZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['UAVROZ'], labelSize: 190, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
