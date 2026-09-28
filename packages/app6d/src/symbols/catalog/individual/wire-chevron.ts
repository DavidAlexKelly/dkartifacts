// symbols/catalog/individual/wire-chevron.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { tickRowFamily, tickRowHandles } from "../../families";

export const WIRE_CHEVRON_NAME = "svg-wire-chevron" as const;

export const wireChevronSymbol: SymbolDefinition = { title: 'Wire Obstacle (chevron wave)', params: { A: P(200, 950), B: P(1900, 950), count: 6, tickSize: 130, tickShape: 'chevron', dashed: false, headArrow: false }, generate: tickRowFamily, handles: tickRowHandles, unitAnchor: 'midline', meta: { sidcTaskId: "unspecified-wire-obstacle" }, };
