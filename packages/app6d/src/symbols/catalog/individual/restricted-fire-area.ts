// symbols/catalog/individual/restricted-fire-area.ts — standalone, tree-shakeable.
//
// Reference #242. "An area in which specific restrictions are imposed and into
// which fires that exceed those restrictions will not be delivered without
// coordination with the establishing headquarters." A drawn ring with a
// movable label block inside it.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const RESTRICTED_FIRE_AREA_NAME = "svg-restricted-fire-area" as const;

export const restrictedFireAreaSymbol: SymbolDefinition = {
  title: 'Restricted Fire Area (RFA)',
  params: { ring: AREA_RING_DEFAULT, label: ['RFA'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
