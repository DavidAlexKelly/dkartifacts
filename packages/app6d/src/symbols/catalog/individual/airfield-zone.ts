// symbols/catalog/individual/airfield-zone.ts — standalone, tree-shakeable.
//
// Reference #21, whose rules are the clearest statement of this family in the
// publication: "requires at least three anchor points to define the boundary of
// the area. Add as many points as necessary to accurately represent the
// area." Spelled out, no abbreviation having survived the crop.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const AIRFIELD_ZONE_NAME = "svg-airfield-zone" as const;

export const airfieldZoneSymbol: SymbolDefinition = {
  title: 'Airfield Zone',
  params: { ring: AREA_RING_DEFAULT, label: ['AIRFIELD', 'ZONE'], labelSize: 190, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
