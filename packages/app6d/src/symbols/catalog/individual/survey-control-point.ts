// symbols/catalog/individual/survey-control-point.ts — standalone, tree-shakeable.
//
// Reference #271. No DRAW RULES page; the extracted template is the family's
// inverted cone at the shared proportions, labelled "SCP" — read out of the
// template with tools/control-measures/text.mjs, which reads the page's <use>
// glyphs that the path-only extraction never saw.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const SURVEY_CONTROL_POINT_NAME = "svg-survey-control-point" as const;

export const surveyControlPointSymbol: SymbolDefinition = {
  title: 'Survey Control Point',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: 'SCP', labelSize: 330 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
