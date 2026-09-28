// symbols/catalog/individual/delay-arc.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { retrogradeArcFamily, retrogradeArcHandles } from "../../families";

export const DELAY_ARC_NAME = "svg-delay-arc" as const;

export const delayArcSymbol: SymbolDefinition = { title: 'Delay (D, arc)', params: { A: P(300, 1500), B: P(1700, 1500), r: 420, headLen: 220, headSpread: 45, label: 'D', labelSize: 210 }, generate: retrogradeArcFamily, handles: retrogradeArcHandles, unitAnchor: 'start', meta: { sidcTaskId: "delay" }, };
