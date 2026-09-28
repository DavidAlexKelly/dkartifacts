// symbols/catalog/individual/obstacle-restricted-zone.ts — standalone,
// tree-shakeable.
//
// Reference #292. An area in which obstacle emplacement is limited. A drawn
// ring with a movable label block, spelled out: no abbreviation survived the
// crop.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const OBSTACLE_RESTRICTED_ZONE_NAME = "svg-obstacle-restricted-zone" as const;

export const obstacleRestrictedZoneSymbol: SymbolDefinition = {
  title: 'Obstacle Restricted Zone',
  params: { ring: AREA_RING_DEFAULT, label: ['OBSTACLE', 'RESTRICTED', 'ZONE'], labelSize: 190, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
