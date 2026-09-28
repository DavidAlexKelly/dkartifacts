// symbols/catalog/individual/circular-target.ts — standalone, tree-shakeable.
//
// Reference #252, one anchor. The template draws a ring — 764 by 720, four
// curve segments — with a cross through its centre, and the target number
// alongside. The cross arms are derived from the radius so that resizing the
// target keeps them centred and proportionate.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { pointGlyph, glyphHandles } from "../../families";

export const CIRCULAR_TARGET_NAME = "svg-circular-target" as const;

const R = 560;
const ARM = R * 0.75;

export const circularTargetSymbol: SymbolDefinition = {
  title: 'Circular Target',
  params: { center: P(1024, 1024), scale: 1, rotation: 0, label: '', labelSize: 300 },
  generate: pointGlyph({
    circles: [{ c: P(0, 0), r: R }],
    strokes: [
      { pts: [P(-ARM, 0), P(ARM, 0)] },
      { pts: [P(0, -ARM), P(0, ARM)] },
    ],
    labelSlot: { pos: P(0, -R - 220), size: 300 },
  }),
  handles: glyphHandles(R),
  unitAnchor: 'center',
};
