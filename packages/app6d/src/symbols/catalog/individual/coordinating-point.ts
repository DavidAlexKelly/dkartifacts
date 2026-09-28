// symbols/catalog/individual/coordinating-point.ts — standalone, tree-shakeable.
//
// Reference #7. "Designated point at which, in all types of combat, adjacent
// units/formations must make contact for purposes of control and
// coordination." (AAP-6) One anchor, which "defines the centre of the symbol".
//
// A ring with a cross inscribed in it. The template draws the ring as four
// cubic segments and the cross as two straight paths spanning 569 units
// against the ring's 804 — 0.707 of the diameter, i.e. the arms end exactly on
// the ring at 45°, which is why they are derived from the radius here rather
// than written down.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { pointGlyph, glyphHandles } from "../../families";

export const COORDINATING_POINT_NAME = "svg-coordinating-point" as const;

const R = 620;
const ARM = R * Math.SQRT1_2;

export const coordinatingPointSymbol: SymbolDefinition = {
  title: 'Coordinating Point',
  params: { center: P(1024, 1024), scale: 1, rotation: 0 },
  generate: pointGlyph({
    circles: [{ c: P(0, 0), r: R }],
    strokes: [
      { pts: [P(-ARM, -ARM), P(ARM, ARM)] },
      { pts: [P(-ARM, ARM), P(ARM, -ARM)] },
    ],
  }),
  handles: glyphHandles(R),
  unitAnchor: 'center',
};
