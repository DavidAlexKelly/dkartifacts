// symbols/catalog/individual/minefield-square.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { tickRowFamily, tickRowHandles } from "../../families";

export const MINEFIELD_SQUARE_NAME = "svg-minefield-square" as const;

export const minefieldSquareSymbol: SymbolDefinition = { title: 'Minefield Marker (square row)', params: { A: P(200, 950), B: P(1900, 950), count: 4, tickSize: 100, tickShape: 'square', dashed: false, headArrow: false }, generate: tickRowFamily, handles: tickRowHandles, unitAnchor: 'midline', meta: { sidcTaskId: "static-depiction-minefield" }, };
