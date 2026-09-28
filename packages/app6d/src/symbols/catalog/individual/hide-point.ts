// symbols/catalog/individual/hide-point.ts — standalone, tree-shakeable.
//
// Reference #265. Inverted cone anchored at its tip, drawn upright, labelled
// "HP" (the example crop in folder #268 reads "HHPP TT" — the OCR doubled every
// character, which is how "HP" and the "T" field survived at all).
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const HIDE_POINT_NAME = "svg-hide-point" as const;

export const hidePointSymbol: SymbolDefinition = {
  title: 'Hide Point',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: 'HP', labelSize: 380 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
