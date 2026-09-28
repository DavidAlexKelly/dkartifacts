// symbols/catalog/individual/cover-cc.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { zigzagHookFamily, zigzagHookHandles } from "../../families";

export const COVER_CC_NAME = "svg-cover-cc" as const;

export const coverCcSymbol: SymbolDefinition = {
    title: 'Cover',
    params: { A: P(150, 499), B: P(99, 872), peaks: 3, amp: 140, hookLen: 260, hookAngle: 130, copies: 2, spacing: 900, label: 'C', labelSize: 160 },
    generate: zigzagHookFamily,
    handles: zigzagHookHandles,
    unitAnchor: 'start', meta: { sidcTaskId: "cover" },
  };
