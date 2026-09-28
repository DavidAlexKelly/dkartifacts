// symbols/catalog/individual/irregular-target.ts — standalone, tree-shakeable.
//
// Reference #254. The target whose shape the ground dictates — three or more
// anchors, against the circular and rectangular targets' one.
//
// The label starts empty: the only text an irregular target carries is its
// target number, which is the caller's.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const IRREGULAR_TARGET_NAME = "svg-irregular-target" as const;

export const irregularTargetSymbol: SymbolDefinition = {
  title: 'Irregular Target',
  params: { ring: AREA_RING_DEFAULT, label: [], labelSize: 260, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
