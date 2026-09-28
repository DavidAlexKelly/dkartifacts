// symbols/catalog/individual/general-area-planned.ts — standalone,
// tree-shakeable.
//
// Reference #32, "Friendly Planned or On Order Area" — the general area,
// dashed. Planned and on-order graphics are dashed throughout the publication,
// and status is the one difference here that is geometry rather than colour.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const GENERAL_AREA_PLANNED_NAME = "svg-general-area-planned" as const;

export const generalAreaPlannedSymbol: SymbolDefinition = {
  title: 'General Area, Planned or On Order',
  params: { ring: AREA_RING_DEFAULT, label: [], labelSize: 240, dashed: true },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
