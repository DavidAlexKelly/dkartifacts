// symbols/catalog/individual/fire-support-area.ts — standalone, tree-shakeable.
//
// Reference #263. "An appropriate manoeuvre area assigned to a fire support
// ship from which it can deliver gunfire support." Three or more anchors.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const FIRE_SUPPORT_AREA_NAME = "svg-fire-support-area" as const;

export const fireSupportAreaSymbol: SymbolDefinition = {
  title: 'Fire Support Area (FSA)',
  params: { ring: AREA_RING_DEFAULT, label: ['FSA'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
