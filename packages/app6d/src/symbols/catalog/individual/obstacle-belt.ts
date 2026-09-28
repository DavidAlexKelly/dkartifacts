// symbols/catalog/individual/obstacle-belt.ts — standalone, tree-shakeable.
//
// Reference #289. "An area designated at brigade level in which obstacle
// effort is concentrated." Three or more anchors. Sits between the obstacle
// zone (#290, division level) and the individual obstacles; spelled out, as
// none of the three recovered an abbreviation.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const OBSTACLE_BELT_NAME = "svg-obstacle-belt" as const;

export const obstacleBeltSymbol: SymbolDefinition = {
  title: 'Obstacle Belt',
  params: { ring: AREA_RING_DEFAULT, label: ['OBSTACLE', 'BELT'], labelSize: 200, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
