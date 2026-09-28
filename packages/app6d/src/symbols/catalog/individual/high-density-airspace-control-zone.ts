// symbols/catalog/individual/high-density-airspace-control-zone.ts —
// standalone, tree-shakeable.
//
// Reference #122 (and #123, the same row again). "Airspace of defined
// dimensions in which there is a concentrated employment of numerous and
// varied weapons and airspace users." Three or more anchors.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const HIGH_DENSITY_AIRSPACE_CONTROL_ZONE_NAME = "svg-high-density-airspace-control-zone" as const;

export const highDensityAirspaceControlZoneSymbol: SymbolDefinition = {
  title: 'High-Density Airspace Control Zone (HIDACZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['HIDACZ'], labelSize: 200, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
