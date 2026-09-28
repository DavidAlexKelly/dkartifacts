// symbols/catalog/individual/target-value-area.ts — standalone, tree-shakeable.
//
// Reference #281. A drawn ring with a movable label block; "TVA" is the
// standard abbreviation.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const TARGET_VALUE_AREA_NAME = "svg-target-value-area" as const;

export const targetValueAreaSymbol: SymbolDefinition = {
  title: 'Target Value Area (TVA)',
  params: { ring: AREA_RING_DEFAULT, label: ['TVA'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
