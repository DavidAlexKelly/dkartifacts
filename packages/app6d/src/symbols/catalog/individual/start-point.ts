// symbols/catalog/individual/start-point.ts — standalone, tree-shakeable.
//
// Reference #16. "A well defined point on a route at which a movement of
// vehicles begins to be under the control of the commander of this movement."
//
// No DRAW RULES page; the extracted template is the family's inverted cone.
// "SP" is both the doctrinal abbreviation and what the publication's example
// crop (folder #18) reads.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const START_POINT_NAME = "svg-start-point" as const;

export const startPointSymbol: SymbolDefinition = {
  title: 'Start Point',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: 'SP', labelSize: 380 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
