// symbols/catalog/individual/fire-support-safety-line.ts — standalone,
// tree-shakeable.
//
// Reference #236. "A line short of which indirect fire is not permitted
// without coordination." Same construction as the no-fire line: a line, a bar
// across each end, and the designation at both ends.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const FIRE_SUPPORT_SAFETY_LINE_NAME = "svg-fire-support-safety-line" as const;

export const fireSupportSafetyLineSymbol: SymbolDefinition = {
  title: 'Fire Support Safety Line (FSSL)',
  params: { spine: [P(520, 1024), P(1528, 1024)], label: 'FSSL', labelSize: 230, dashed: false, endTick: 360 },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
