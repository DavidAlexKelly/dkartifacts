// symbols/catalog/individual/bomb-area.ts — standalone, tree-shakeable.
//
// Reference #261. The area to be struck by bombing. Three or more anchors,
// with the designation inside — and TACTIC_TASK_CATALOG has had a `bomb-area`
// entry waiting for a graphic.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const BOMB_AREA_NAME = "svg-bomb-area" as const;

export const bombAreaSymbol: SymbolDefinition = {
  title: 'Bomb Area',
  params: { ring: AREA_RING_DEFAULT, label: ['BOMB'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
  meta: { sidcTaskId: "bomb-area" },
};
