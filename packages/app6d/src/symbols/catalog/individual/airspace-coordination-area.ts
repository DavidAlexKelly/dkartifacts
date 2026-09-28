// symbols/catalog/individual/airspace-coordination-area.ts — standalone,
// tree-shakeable.
//
// Reference #239. "A restricted area or route of travel specified for use by
// friendly aircraft, established to prevent friendly aircraft being fired on
// by friendly forces." Three or more anchors — the drawn-area form, against
// the circular one that TACTIC_TASK_CATALOG names separately.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const AIRSPACE_COORDINATION_AREA_NAME = "svg-airspace-coordination-area" as const;

export const airspaceCoordinationAreaSymbol: SymbolDefinition = {
  title: 'Airspace Coordination Area (ACA)',
  params: { ring: AREA_RING_DEFAULT, label: ['ACA'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
