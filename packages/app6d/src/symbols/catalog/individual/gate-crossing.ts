// symbols/catalog/individual/gate-crossing.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { gateBracketFamily, gateBracketHandles } from "../../families";

export const GATE_CROSSING_NAME = "svg-gate-crossing" as const;

export const gateCrossingSymbol: SymbolDefinition = { title: 'Crossing Point / Gate', params: { P1: P(1750, 200), P2: P(1750, 1600), depth: 700, flagLen: 180 }, generate: gateBracketFamily, handles: gateBracketHandles, unitAnchor: 'center', meta: { sidcTaskId: "bridge-or-gap" }, };
