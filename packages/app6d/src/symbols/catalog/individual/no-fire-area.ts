// symbols/catalog/individual/no-fire-area.ts — standalone, tree-shakeable.
//
// Reference #241. "An area into which no fires or the effects of fires are
// allowed." Same shape as the other fire-support areas: a drawn ring with a
// movable label block inside it.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const NO_FIRE_AREA_NAME = "svg-no-fire-area" as const;

export const noFireAreaSymbol: SymbolDefinition = {
  title: 'No Fire Area (NFA)',
  params: { ring: AREA_RING_DEFAULT, label: ['NFA'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
