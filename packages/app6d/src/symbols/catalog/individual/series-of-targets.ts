// symbols/catalog/individual/series-of-targets.ts — standalone, tree-shakeable.
//
// Reference #255 (and #256, the same row again). "In artillery and naval fire
// support, a number of targets and/or groups of targets planned to be fired on
// in a predetermined sequence." Three or more anchors around the targets, with
// the series name inside — the caller's, so the label starts empty.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const SERIES_OF_TARGETS_NAME = "svg-series-of-targets" as const;

export const seriesOfTargetsSymbol: SymbolDefinition = {
  title: 'Series of Targets',
  params: { ring: AREA_RING_DEFAULT, label: [], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
