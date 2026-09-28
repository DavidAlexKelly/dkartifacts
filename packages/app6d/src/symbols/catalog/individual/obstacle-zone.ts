// symbols/catalog/individual/obstacle-zone.ts — standalone, tree-shakeable.
//
// Reference #290. "An area designated at corps or division level in which
// barrier and obstacle effort is planned." A drawn ring with a movable label
// block. Spelled out rather than abbreviated: the publication did not give
// this row an abbreviation the extraction could recover.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const OBSTACLE_ZONE_NAME = "svg-obstacle-zone" as const;

export const obstacleZoneSymbol: SymbolDefinition = {
  title: 'Obstacle Zone',
  params: { ring: AREA_RING_DEFAULT, label: ['OBSTACLE', 'ZONE'], labelSize: 200, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
  meta: { sidcTaskId: "zone" },
};
