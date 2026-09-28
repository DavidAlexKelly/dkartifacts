// symbols/catalog/individual/search-area.ts — standalone, tree-shakeable.
//
// Reference #165. The area assigned to a search — a drawn area with a movable
// label block. Spelled out: no abbreviation survived the crop.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const SEARCH_AREA_NAME = "svg-search-area" as const;

export const searchAreaSymbol: SymbolDefinition = {
  title: 'Search Area',
  params: { ring: AREA_RING_DEFAULT, label: ['SEARCH', 'AREA'], labelSize: 200, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
