// symbols/catalog/individual/extraction-zone.ts — standalone, tree-shakeable.
//
// Reference #42. "A specified drop zone used for the delivery of supplies or
// equipment by low-altitude extraction." Three or more anchors.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const EXTRACTION_ZONE_NAME = "svg-extraction-zone" as const;

export const extractionZoneSymbol: SymbolDefinition = {
  title: 'Extraction Zone (EZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['EZ'], labelSize: 260, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
