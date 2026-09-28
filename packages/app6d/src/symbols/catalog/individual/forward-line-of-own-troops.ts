// symbols/catalog/individual/forward-line-of-own-troops.ts — standalone,
// tree-shakeable.
//
// The FLOT: the most forward positions of friendly forces at a given time.
//
// Not one of the 346 extracted rows — it comes from TACTIC_TASK_CATALOG, which
// has carried `forward-line-of-own-troops-flot` and its SIDC since before any
// of this, with no graphic behind it. It is the same scalloped line as the
// FEBA, which is why it is authored here rather than left as a task with
// nothing to draw.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { scallopLineFamily, polylineHandles } from "../../families";

export const FORWARD_LINE_OF_OWN_TROOPS_NAME = "svg-forward-line-of-own-troops" as const;

export const forwardLineOfOwnTroopsSymbol: SymbolDefinition = {
  title: 'Forward Line of Own Troops (FLOT)',
  params: {
    spine: [P(420, 1024), P(1628, 1024)], bumps: 6, side: 1,
    label: 'FLOT', labelSize: 220, dashed: false,
  },
  generate: scallopLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
  meta: { sidcTaskId: "forward-line-of-own-troops-flot" },
};
