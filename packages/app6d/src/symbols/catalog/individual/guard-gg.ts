// symbols/catalog/individual/guard-gg.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { zigzagHookFamily, zigzagHookHandles } from "../../families";

export const GUARD_GG_NAME = "svg-guard-gg" as const;

export const guardGgSymbol: SymbolDefinition = {
    title: 'Guard',
    params: { A: P(150, 499), B: P(99, 872), peaks: 3, amp: 140, hookLen: 260, hookAngle: 130, copies: 2, spacing: 900, label: 'G', labelSize: 160 },
    generate: zigzagHookFamily,
    handles: zigzagHookHandles,
    unitAnchor: 'start', meta: { sidcTaskId: "guard" },
  };
