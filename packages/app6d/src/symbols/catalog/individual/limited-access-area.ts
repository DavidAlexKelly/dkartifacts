// symbols/catalog/individual/limited-access-area.ts — standalone,
// tree-shakeable.
//
// Reference #46. An area to which access is limited. Three or more anchors;
// spelled out, no abbreviation having survived the crop.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const LIMITED_ACCESS_AREA_NAME = "svg-limited-access-area" as const;

export const limitedAccessAreaSymbol: SymbolDefinition = {
  title: 'Limited Access Area',
  params: { ring: AREA_RING_DEFAULT, label: ['LIMITED', 'ACCESS'], labelSize: 190, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
