// symbols/catalog/individual/airspace-coordination-area-circular.ts —
// standalone, tree-shakeable.
//
// The circular ACA: a block of airspace in the target area within which
// friendly aircraft are reasonably safe from friendly surface fires.
//
// From TACTIC_TASK_CATALOG rather than the extracted rows — the entry
// `airspace-coordination-area-aca-circular` has been there with no graphic. A
// ring with the designation inside it, which is what "circular" means here;
// the minimum and maximum altitudes and the effective times go in the caller's
// label, one line each.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { pointGlyph, glyphHandles } from "../../families";

export const AIRSPACE_COORDINATION_AREA_CIRCULAR_NAME = "svg-airspace-coordination-area-circular" as const;

const R = 640;

export const airspaceCoordinationAreaCircularSymbol: SymbolDefinition = {
  title: 'Airspace Coordination Area (ACA), Circular',
  params: { center: P(1024, 1024), scale: 1, rotation: 0, label: 'ACA', labelSize: 260 },
  generate: pointGlyph({
    circles: [{ c: P(0, 0), r: R }],
    strokes: [],
    labelSlot: { pos: P(0, 0), size: 260 },
  }),
  handles: glyphHandles(R),
  unitAnchor: 'center',
  meta: { sidcTaskId: "airspace-coordination-area-aca-circular" },
};
