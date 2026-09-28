// symbols/catalog/individual/no-fire-line.ts — standalone, tree-shakeable.
//
// Reference #237. A line short of which no fires are delivered without
// coordination. Two or more anchors, a bar across each end, and the
// designation posted at both ends — measured off the example crop, where the
// end bars stand about a third of the line's length tall and the text sits
// below the line at each end.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const NO_FIRE_LINE_NAME = "svg-no-fire-line" as const;

export const noFireLineSymbol: SymbolDefinition = {
  title: 'No Fire Line (NFL)',
  params: { spine: [P(520, 1024), P(1528, 1024)], label: 'NFL', labelSize: 240, dashed: false, endTick: 360 },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
