// symbols/catalog/individual/firing-point.ts — standalone, tree-shakeable.
//
// Reference #264. Inverted cone anchored at its tip, drawn upright, labelled
// "FP" — the abbreviation survives in the publication's own example crop
// (folder #267), alongside the "T" field the caller fills in.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const FIRING_POINT_NAME = "svg-firing-point" as const;

export const firingPointSymbol: SymbolDefinition = {
  title: 'Firing Point',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: 'FP', labelSize: 380 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
