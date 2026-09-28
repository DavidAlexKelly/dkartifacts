// symbols/catalog/individual/rectangular-target.ts — standalone,
// tree-shakeable.
//
// Reference #253, one anchor. The template draws a rectangle — four bars, 768
// by 546 — with a cross through its centre, the same construction as the
// circular target with a box in place of the ring.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { pointGlyph, glyphHandles } from "../../families";

export const RECTANGULAR_TARGET_NAME = "svg-rectangular-target" as const;

const HALF_W = 560;
const HALF_H = 400;

export const rectangularTargetSymbol: SymbolDefinition = {
  title: 'Rectangular Target',
  params: { center: P(1024, 1024), scale: 1, rotation: 0, label: '', labelSize: 300 },
  generate: pointGlyph({
    strokes: [
      {
        pts: [P(-HALF_W, -HALF_H), P(HALF_W, -HALF_H), P(HALF_W, HALF_H), P(-HALF_W, HALF_H)],
        closed: true,
      },
      { pts: [P(-HALF_H * 0.75, 0), P(HALF_H * 0.75, 0)] },
      { pts: [P(0, -HALF_H * 0.75), P(0, HALF_H * 0.75)] },
    ],
    labelSlot: { pos: P(0, -HALF_H - 220), size: 300 },
  }),
  handles: glyphHandles(HALF_W),
  unitAnchor: 'center',
};
