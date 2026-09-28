// symbols/catalog/individual/breach.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { bracketFamily, bracketHandles } from "../../families";

export const BREACH_NAME = "svg-breach" as const;

export const breachSymbol: SymbolDefinition = {
    title: 'Breach',
    params: { P1: P(1771, 159), P2: P(1771, 1622), depth: 1463, endStyle: 'slash', slashAngle: 14, slashLen: 242, headLen: 148, label: 'B', labelSize: 216 },
    generate: bracketFamily, handles: bracketHandles, unitAnchor: 'start', meta: { sidcTaskId: "breach" },
  };
