// symbols/catalog/individual/line-of-departure.ts — standalone, tree-shakeable.
//
// Reference #96. "In land warfare, a line designated to coordinate the
// departure of attack elements." Same rules as the phase line: at least two
// anchors, extendable, information posted at both ends.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const LINE_OF_DEPARTURE_NAME = "svg-line-of-departure" as const;

export const lineOfDepartureSymbol: SymbolDefinition = {
  title: 'Line of Departure',
  params: { spine: [P(520, 1024), P(1528, 1024)], label: 'LD', labelSize: 260, dashed: false },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
  meta: { sidcTaskId: "line-of-departure" },
};
