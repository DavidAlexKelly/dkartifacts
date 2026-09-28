// symbols/catalog/individual/two-way-route.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { twoWayArrowFamily, twoWayArrowHandles } from "../../families";

export const TWO_WAY_ROUTE_NAME = "svg-two-way-route" as const;

export const twoWayRouteSymbol: SymbolDefinition = { title: 'Two-Way Route / Axis', params: { A: P(200, 900), B: P(1900, 900), headLen: 160, headSpread: 40 }, generate: twoWayArrowFamily, handles: twoWayArrowHandles, unitAnchor: 'start' };
