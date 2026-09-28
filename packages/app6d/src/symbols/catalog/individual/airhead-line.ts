// symbols/catalog/individual/airhead-line.ts — standalone, tree-shakeable.
//
// Reference #50. "A line denoting the limits of the objective area for an
// airborne assault." A line rather than an area, despite sitting among the
// three-anchor rows: extra anchors extend it, as with the phase line, and the
// designation is posted at both ends.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const AIRHEAD_LINE_NAME = "svg-airhead-line" as const;

export const airheadLineSymbol: SymbolDefinition = {
  title: 'Airhead Line',
  params: {
    spine: [P(420, 1024), P(1628, 1024)], label: 'AIRHEAD', labelSize: 190, dashed: false,
  },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
