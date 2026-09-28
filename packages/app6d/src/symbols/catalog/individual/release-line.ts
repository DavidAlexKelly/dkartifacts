// symbols/catalog/individual/release-line.ts — standalone, tree-shakeable.
//
// Reference #53. "Phase line used in river crossing operations that
// designates where crossing units revert to their parent formations." Its
// draw-rules crop caught the example instead and reads "RL RL / PL T PL /
// PT 1 PT 2": the designation posted at each of the two anchor points.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const RELEASE_LINE_NAME = "svg-release-line" as const;

export const releaseLineSymbol: SymbolDefinition = {
  title: 'Release Line (RL)',
  params: { spine: [P(520, 1024), P(1528, 1024)], label: 'RL', labelSize: 260, dashed: false },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
