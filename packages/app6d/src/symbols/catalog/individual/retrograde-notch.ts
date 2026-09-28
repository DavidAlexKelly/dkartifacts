// symbols/catalog/individual/retrograde-notch.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { retrogradeArcFamily, retrogradeArcHandles } from "../../families";

export const RETROGRADE_NOTCH_NAME = "svg-retrograde-notch" as const;

export const retrogradeNotchSymbol: SymbolDefinition = { title: 'Retrograde Bracket (unlabeled)', params: { A: P(300, 1500), B: P(1700, 1500), r: 420, headLen: 220, headSpread: 45, label: '', labelSize: 210 }, generate: retrogradeArcFamily, handles: retrogradeArcHandles, unitAnchor: 'start' };
