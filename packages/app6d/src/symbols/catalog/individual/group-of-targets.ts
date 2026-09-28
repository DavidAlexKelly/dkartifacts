// symbols/catalog/individual/group-of-targets.ts — standalone, tree-shakeable.
//
// Reference #257 (and #258, the same row again). "Two or more targets on which
// fire is desired simultaneously." Three or more anchors, the group's
// designation inside, so the label starts empty.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const GROUP_OF_TARGETS_NAME = "svg-group-of-targets" as const;

export const groupOfTargetsSymbol: SymbolDefinition = {
  title: 'Group of Targets',
  params: { ring: AREA_RING_DEFAULT, label: [], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
