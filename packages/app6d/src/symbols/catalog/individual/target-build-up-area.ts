// symbols/catalog/individual/target-build-up-area.ts — standalone,
// tree-shakeable.
//
// Reference #280. A drawn ring with a movable label block; "TBA" is the
// standard abbreviation.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const TARGET_BUILD_UP_AREA_NAME = "svg-target-build-up-area" as const;

export const targetBuildUpAreaSymbol: SymbolDefinition = {
  title: 'Target Build-up Area (TBA)',
  params: { ring: AREA_RING_DEFAULT, label: ['TBA'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
