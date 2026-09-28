// symbols/catalog/individual/air-control-point.ts — standalone, tree-shakeable.
//
// Reference #107. One anchor at the centre. A ring carrying "ACP": the
// template and the example both draw a single four-segment circle (678 and 666
// across the axis the curve's control points do not inflate), and the
// template's text — read with tools/control-measures/text.mjs — is "ACP" at
// 16pt with a "T" field beside it. Set `label` to include the designation.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { pointGlyph, glyphHandles } from "../../families";

export const AIR_CONTROL_POINT_NAME = "svg-air-control-point" as const;

const R = 560;

export const airControlPointSymbol: SymbolDefinition = {
  title: 'Air Control Point',
  params: { center: P(1024, 1024), scale: 1, rotation: 0, label: 'ACP', labelSize: 380 },
  generate: pointGlyph({
    circles: [{ c: P(0, 0), r: R }],
    strokes: [],
    labelSlot: { pos: P(0, 0), size: 420 },
  }),
  handles: glyphHandles(R),
  unitAnchor: 'center',
};
