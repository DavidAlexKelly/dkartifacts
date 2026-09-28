// symbols/catalog/individual/censor-zone.ts — standalone, tree-shakeable.
//
// Reference #276. "An area from which radar is prohibited from reporting
// acquisitions." A drawn area with a movable label block, spelled out: no
// abbreviation survived the crop.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const CENSOR_ZONE_NAME = "svg-censor-zone" as const;

export const censorZoneSymbol: SymbolDefinition = {
  title: 'Censor Zone',
  params: { ring: AREA_RING_DEFAULT, label: ['CENSOR', 'ZONE'], labelSize: 200, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
