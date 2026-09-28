// symbols/catalog/individual/zone-of-responsibility.ts — standalone,
// tree-shakeable.
//
// Reference #282. A drawn ring with a movable label block; "ZOR" is the
// standard abbreviation.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const ZONE_OF_RESPONSIBILITY_NAME = "svg-zone-of-responsibility" as const;

export const zoneOfResponsibilitySymbol: SymbolDefinition = {
  title: 'Zone of Responsibility (ZOR)',
  params: { ring: AREA_RING_DEFAULT, label: ['ZOR'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
