// symbols/catalog/individual/bypass.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { bracketFamily, bracketHandles } from "../../families";

export const BYPASS_NAME = "svg-bypass" as const;

export const bypassSymbol: SymbolDefinition = {
    title: 'Bypass',
    params: { P1: P(1805, 142), P2: P(1805, 1638), depth: 1495, endStyle: 'arrow', slashAngle: 0, slashLen: 0, headLen: 148, label: 'B', labelSize: 216 },
    generate: bracketFamily, handles: bracketHandles, unitAnchor: 'start', meta: { sidcTaskId: "bypass" },
  };
