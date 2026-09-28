// symbols/catalog/individual/obstacle-free-zone.ts — standalone, tree-shakeable.
//
// Reference #291. An area in which no obstacles may be emplaced. A drawn ring
// with a movable label block, spelled out for the same reason as the obstacle
// zone: no abbreviation survived the crop.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const OBSTACLE_FREE_ZONE_NAME = "svg-obstacle-free-zone" as const;

export const obstacleFreeZoneSymbol: SymbolDefinition = {
  title: 'Obstacle Free Zone',
  params: { ring: AREA_RING_DEFAULT, label: ['OBSTACLE', 'FREE ZONE'], labelSize: 200, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
