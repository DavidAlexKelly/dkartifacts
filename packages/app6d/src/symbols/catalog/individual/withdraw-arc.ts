// symbols/catalog/individual/withdraw-arc.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { retrogradeArcFamily, retrogradeArcHandles } from "../../families";

export const WITHDRAW_ARC_NAME = "svg-withdraw-arc" as const;

export const withdrawArcSymbol: SymbolDefinition = { title: 'Withdraw (W, arc)', params: { A: P(300, 1500), B: P(1700, 1500), r: 420, headLen: 220, headSpread: 45, label: 'W', labelSize: 210 }, generate: retrogradeArcFamily, handles: retrogradeArcHandles, unitAnchor: 'start', meta: { sidcTaskId: "withdraw" }, };
