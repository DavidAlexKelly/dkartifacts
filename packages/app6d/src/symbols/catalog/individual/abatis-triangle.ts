// symbols/catalog/individual/abatis-triangle.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { tickRowFamily, tickRowHandles } from "../../families";

export const ABATIS_TRIANGLE_NAME = "svg-abatis-triangle" as const;

export const abatisTriangleSymbol: SymbolDefinition = { title: 'Abatis / Obstacle Row (triangle)', params: { A: P(200, 950), B: P(1900, 950), count: 4, tickSize: 110, tickShape: 'triangle', dashed: false, headArrow: false }, generate: tickRowFamily, handles: tickRowHandles, unitAnchor: 'midline', meta: { sidcTaskId: "line-general-obstacles" }, };
