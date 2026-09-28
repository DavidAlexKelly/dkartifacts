// symbols/catalog/individual/antitank-ditch-completed.ts — standalone,
// tree-shakeable.
//
// Reference #294. The same line of teeth as #293, filled: the ditch is dug.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { tickRowFamily, tickRowHandles } from "../../families";

export const ANTITANK_DITCH_COMPLETED_NAME = "svg-antitank-ditch-completed" as const;

export const antitankDitchCompletedSymbol: SymbolDefinition = {
  title: 'Antitank Ditch – Completed',
  params: {
    A: P(250, 1024), B: P(1800, 1024), count: 5, tickSize: 120,
    tickShape: 'tooth-filled', dashed: false, headArrow: false,
  },
  generate: tickRowFamily,
  handles: tickRowHandles,
  unitAnchor: 'midline',
  // TACTIC_TASK_CATALOG has had `complete-antitank-ditch` waiting for exactly
  // this graphic; the under-construction one stays on the general obstacle line.
  meta: { sidcTaskId: "complete-antitank-ditch" },
};
