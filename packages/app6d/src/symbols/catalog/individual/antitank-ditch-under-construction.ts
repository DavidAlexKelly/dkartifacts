// symbols/catalog/individual/antitank-ditch-under-construction.ts —
// standalone, tree-shakeable.
//
// Reference #293. Two anchors defining the line, with teeth standing on one
// side of it. Hollow teeth: the ditch is not finished. #294 is the same
// symbol with the teeth filled, and that is the only difference between them.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { tickRowFamily, tickRowHandles } from "../../families";

export const ANTITANK_DITCH_UNDER_CONSTRUCTION_NAME = "svg-antitank-ditch-under-construction" as const;

export const antitankDitchUnderConstructionSymbol: SymbolDefinition = {
  title: 'Antitank Ditch – Under Construction',
  params: {
    A: P(250, 1024), B: P(1800, 1024), count: 5, tickSize: 120,
    tickShape: 'tooth', dashed: false, headArrow: false,
  },
  generate: tickRowFamily,
  handles: tickRowHandles,
  unitAnchor: 'midline',
  meta: { sidcTaskId: "line-general-obstacles" },
};
