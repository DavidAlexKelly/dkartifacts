// symbols/catalog/individual/wire-tick-line.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { tickRowFamily, tickRowHandles } from "../../families";

export const WIRE_TICK_LINE_NAME = "svg-wire-tick-line" as const;

export const wireTickLineSymbol: SymbolDefinition = { title: 'Wire Line (ticked, with arrow)', params: { A: P(200, 950), B: P(1900, 950), count: 9, tickSize: 70, tickShape: 'bar', dashed: false, headArrow: true }, generate: tickRowFamily, handles: tickRowHandles, unitAnchor: 'midline', meta: { sidcTaskId: "line-general-obstacles" }, };
