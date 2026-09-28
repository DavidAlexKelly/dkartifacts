// symbols/catalog/individual/control-point.ts — standalone, tree-shakeable.
//
// Reference #1, "Unspecified Control Point". One anchor point, which "defines
// the tip of the inverted cone"; static size; drawn upright. The cone carries
// no fixed abbreviation of its own — whatever it is controlling is the
// caller's designation — so `label` starts empty.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const CONTROL_POINT_NAME = "svg-control-point" as const;

export const controlPointSymbol: SymbolDefinition = {
  title: 'Unspecified Control Point',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: '', labelSize: 380 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
