// symbols/catalog/individual/unexploded-ordnance-area.ts — standalone,
// tree-shakeable.
//
// Reference #335. An area containing unexploded explosive ordnance. Three or
// more anchors, "UXO" inside.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const UNEXPLODED_ORDNANCE_AREA_NAME = "svg-unexploded-ordnance-area" as const;

export const unexplodedOrdnanceAreaSymbol: SymbolDefinition = {
  title: 'Unexploded Explosive Ordnance (UXO) Area',
  params: { ring: AREA_RING_DEFAULT, label: ['UXO'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
};
