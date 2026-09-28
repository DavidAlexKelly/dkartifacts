// symbols/catalog/individual/dead-space-area.ts — standalone, tree-shakeable.
//
// Reference #278. "An area where hostile weapons cannot be acquired by
// friendly sensors." A drawn area with a movable label block, spelled out: no
// abbreviation survived the crop.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const DEAD_SPACE_AREA_NAME = "svg-dead-space-area" as const;

export const deadSpaceAreaSymbol: SymbolDefinition = {
  title: 'Dead Space Area',
  params: { ring: AREA_RING_DEFAULT, label: ['DEAD SPACE', 'AREA'], labelSize: 190, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
