// symbols/catalog/individual/free-fire-area.ts — standalone, tree-shakeable.
//
// Reference #240. "A specific designated area into which any weapon system may
// fire without additional coordination with the establishing headquarters."
// An area the user draws, with the label block inside it — the rules say the
// block "shall be movable and scalable as a block within the area", which is
// why its position is stored as a fraction of the ring rather than as a point.
//
// In use the block is three lines: the abbreviation, the establishing
// headquarters, and the effective date-time group. `label` takes an array.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const FREE_FIRE_AREA_NAME = "svg-free-fire-area" as const;

export const freeFireAreaSymbol: SymbolDefinition = {
  title: 'Free Fire Area (FFA)',
  params: { ring: AREA_RING_DEFAULT, label: ['FFA'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
