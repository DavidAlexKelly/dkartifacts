// symbols/catalog/individual/sensor-zone.ts — standalone, tree-shakeable.
//
// Reference #279. A drawn ring with a movable label block. The publication
// gives this row no abbreviation that the extraction could recover, so the
// label is spelled out: unambiguous is better than an invented acronym.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const SENSOR_ZONE_NAME = "svg-sensor-zone" as const;

export const sensorZoneSymbol: SymbolDefinition = {
  title: 'Sensor Zone',
  params: { ring: AREA_RING_DEFAULT, label: ['SENSOR', 'ZONE'], labelSize: 210, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
