// symbols/catalog/individual/sector-range-fan.ts — standalone, tree-shakeable.
//
// Reference #284, one anchor at the centre: the sector of fire or observation
// assigned to a weapon, radar or unit. The same range rings as the circular
// fan, cut to a bearing and a width, with the two bounding radials drawn out
// to the outermost ring.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { rangeFanFamily, rangeFanHandles } from "../../families";

export const SECTOR_RANGE_FAN_NAME = "svg-sector-range-fan" as const;

export const sectorRangeFanSymbol: SymbolDefinition = {
  title: 'Sector Range Fan',
  params: {
    center: P(1024, 1300), scale: 1, rotation: 0,
    radii: [420, 760], start: -120, sweep: 60, labels: [], labelSize: 190,
  },
  generate: rangeFanFamily,
  handles: rangeFanHandles,
  unitAnchor: 'center',
  meta: { sidcTaskId: "sector" },
};
