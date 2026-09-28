// symbols/catalog/individual/wire-x.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { tickRowFamily, tickRowHandles } from "../../families";

export const WIRE_X_NAME = "svg-wire-x" as const;

export const wireXSymbol: SymbolDefinition = { title: 'Wire Obstacle (X row)', params: { A: P(200, 950), B: P(1900, 950), count: 5, tickSize: 90, tickShape: 'x', dashed: false, headArrow: false }, generate: tickRowFamily, handles: tickRowHandles, unitAnchor: 'midline', meta: { sidcTaskId: "unspecified-wire-obstacle" }, };
