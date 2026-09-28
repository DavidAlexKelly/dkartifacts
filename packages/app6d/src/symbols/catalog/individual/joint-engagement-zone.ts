// symbols/catalog/individual/joint-engagement-zone.ts — standalone,
// tree-shakeable.
//
// Reference #132 (and #133-#135, the same row repeated by the crop). Airspace
// within which multiple air defence weapon systems engage air threats. Three
// or more anchors.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const JOINT_ENGAGEMENT_ZONE_NAME = "svg-joint-engagement-zone" as const;

export const jointEngagementZoneSymbol: SymbolDefinition = {
  title: 'Joint Engagement Zone (JEZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['JEZ'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
