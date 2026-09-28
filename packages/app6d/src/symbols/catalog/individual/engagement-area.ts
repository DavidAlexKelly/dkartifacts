// symbols/catalog/individual/engagement-area.ts — standalone, tree-shakeable.
//
// Reference #58. "An area where the commander intends to contain and destroy
// an enemy force with the massed effects of all available weapons." Three or
// more anchors defining the area.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const ENGAGEMENT_AREA_NAME = "svg-engagement-area" as const;

export const engagementAreaSymbol: SymbolDefinition = {
  title: 'Engagement Area (EA)',
  params: { ring: AREA_RING_DEFAULT, label: ['EA'], labelSize: 260, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
