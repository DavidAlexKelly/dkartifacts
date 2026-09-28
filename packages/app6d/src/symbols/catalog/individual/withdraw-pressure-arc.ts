// symbols/catalog/individual/withdraw-pressure-arc.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { retrogradeArcFamily, retrogradeArcHandles } from "../../families";

export const WITHDRAW_PRESSURE_ARC_NAME = "svg-withdraw-pressure-arc" as const;

export const withdrawPressureArcSymbol: SymbolDefinition = { title: 'Withdraw Under Pressure (WP, arc)', params: { A: P(300, 1500), B: P(1700, 1500), r: 420, headLen: 220, headSpread: 45, label: 'WP', labelSize: 200 }, generate: retrogradeArcFamily, handles: retrogradeArcHandles, unitAnchor: 'start', meta: { sidcTaskId: "under-pressure" }, };
