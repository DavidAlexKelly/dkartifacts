// symbols/catalog/individual/base-defence-zone.ts — standalone, tree-shakeable.
//
// Reference #121. "A zone established around airbases to enhance the
// effectiveness of local air defence." Three or more anchors.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const BASE_DEFENCE_ZONE_NAME = "svg-base-defence-zone" as const;

export const baseDefenceZoneSymbol: SymbolDefinition = {
  title: 'Base Defence Zone (BDZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['BDZ'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
