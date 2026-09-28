// symbols/catalog/individual/ferry.ts — standalone, tree-shakeable.
//
// Reference #346. The ferry crossing site: two anchors across the obstacle,
// with a bar at each end.
//
// The template is unusually legible for this part of the publication — a band
// 1546 units long between two short uprights, one at either end — which is the
// labelled line with its end caps, and the same construction as the
// fire-support lines rather than anything new.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const FERRY_NAME = "svg-ferry" as const;

export const ferrySymbol: SymbolDefinition = {
  title: 'Ferry',
  params: {
    spine: [P(420, 1024), P(1628, 1024)], label: 'FERRY', labelSize: 200,
    dashed: false, endTick: 240,
  },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
