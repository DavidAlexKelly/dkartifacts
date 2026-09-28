// symbols/catalog/individual/general-area.ts — standalone, tree-shakeable.
//
// Reference #31, "Friendly Area": three or more anchors and nothing else. The
// graphic is the boundary — the affiliation is the colour a renderer applies,
// which is why there is no separate enemy version (#48, #49) here, and the
// designation is the caller's, which is why the label starts empty.
//
// Useful in its own right as the plain drawn area: an unnamed piece of ground
// that has to be marked as one.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const GENERAL_AREA_NAME = "svg-general-area" as const;

export const generalAreaSymbol: SymbolDefinition = {
  title: 'General Area',
  params: { ring: AREA_RING_DEFAULT, label: [], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
