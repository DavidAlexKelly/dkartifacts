// symbols/catalog/individual/lane-marker.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { laneMarkerFamily, laneMarkerHandles } from "../../families";

export const LANE_MARKER_NAME = "svg-lane-marker" as const;

export const laneMarkerSymbol: SymbolDefinition = { title: 'Lane Marker', params: { A: P(200, 900), B: P(1900, 900), bandHalf: 90, capLen: 180, capHalf: 160 }, generate: laneMarkerFamily, handles: laneMarkerHandles, unitAnchor: 'center', meta: { sidcTaskId: "lane" }, };
