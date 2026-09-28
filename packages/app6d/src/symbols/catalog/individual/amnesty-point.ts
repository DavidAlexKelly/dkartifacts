// symbols/catalog/individual/amnesty-point.ts — standalone, tree-shakeable.
//
// Reference #2. Inverted cone, anchored at its tip, drawn upright, labelled
// "AMN" — read out of the template itself with tools/control-measures/text.mjs,
// at 16pt against the 12pt of the H, W, T and W1 field placeholders around it.
// That size difference is what separates a symbol's own abbreviation from the
// fields a caller fills in.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const AMNESTY_POINT_NAME = "svg-amnesty-point" as const;

export const amnestyPointSymbol: SymbolDefinition = {
  title: 'Amnesty Point',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: 'AMN', labelSize: 330 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
