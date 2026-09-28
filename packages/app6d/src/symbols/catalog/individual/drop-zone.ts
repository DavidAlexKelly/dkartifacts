// symbols/catalog/individual/drop-zone.ts — standalone, tree-shakeable.
//
// Reference #41. "A specified area upon which airborne troops, equipment or
// supplies are airdropped." Three or more anchors defining the area, with the
// designation inside it.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const DROP_ZONE_NAME = "svg-drop-zone" as const;

export const dropZoneSymbol: SymbolDefinition = {
  title: 'Drop Zone (DZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['DZ'], labelSize: 260, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
