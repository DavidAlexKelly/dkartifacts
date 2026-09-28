// symbols/catalog/individual/launch-point.ts — standalone, tree-shakeable.
//
// Reference #266. Inverted cone anchored at its tip, drawn upright, labelled
// "LP" — recovered from the publication's example crop (folder #269).
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const LAUNCH_POINT_NAME = "svg-launch-point" as const;

export const launchPointSymbol: SymbolDefinition = {
  title: 'Launch Point',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: 'LP', labelSize: 380 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
