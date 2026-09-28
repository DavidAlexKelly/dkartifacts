// symbols/catalog/individual/decision-point.ts — standalone, tree-shakeable.
//
// Reference #8. "A point in space and time, identified during the planning
// process, where it is anticipated that the commander must make a decision
// concerning a specific course of action." One anchor at the centre.
//
// A five-pointed star, point upwards. The template's path is ten vertices —
// M691,397 L585,720 H237,720 L519,921 … — whose inner vertices sit at 0.382 of
// the outer radius: a regular pentagram, so it is generated as one rather than
// transcribed.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { pointGlyph, glyphHandles, starPoints } from "../../families";

export const DECISION_POINT_NAME = "svg-decision-point" as const;

const OUTER = 640;

export const decisionPointSymbol: SymbolDefinition = {
  title: 'Decision Point',
  params: { center: P(1024, 1024), scale: 1, rotation: 0 },
  generate: pointGlyph({
    strokes: [{ pts: starPoints(OUTER), closed: true }],
  }),
  handles: glyphHandles(OUTER),
  unitAnchor: 'center',
};
