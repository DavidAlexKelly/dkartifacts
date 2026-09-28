// symbols/catalog/individual/reload-point.ts — standalone, tree-shakeable.
//
// Reference #270. No DRAW RULES page; the extracted template is the family's
// inverted cone at the shared proportions. "RLP" comes from the publication's
// example crop (folder #273).
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const RELOAD_POINT_NAME = "svg-reload-point" as const;

export const reloadPointSymbol: SymbolDefinition = {
  title: 'Reload Point',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: 'RLP', labelSize: 330 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
