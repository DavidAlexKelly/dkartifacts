// symbols/catalog/individual/canalize.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { bracketFamily, bracketHandles } from "../../families";

export const CANALIZE_NAME = "svg-canalize" as const;

export const canalizeSymbol: SymbolDefinition = {
    title: 'Canalize',
    params: { P1: P(1750, 159), P2: P(1750, 1622), depth: 1464, endStyle: 'slash', slashAngle: -32, slashLen: 277, headLen: 148, label: 'C', labelSize: 216 },
    generate: bracketFamily, handles: bracketHandles, unitAnchor: 'start', meta: { sidcTaskId: "canalize" },
  };
