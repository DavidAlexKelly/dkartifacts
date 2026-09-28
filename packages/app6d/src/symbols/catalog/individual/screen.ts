// symbols/catalog/individual/screen.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { zigzagHookFamily, zigzagHookHandles } from "../../families";

export const SCREEN_NAME = "svg-screen-ss" as const;

export const screenSymbol: SymbolDefinition = {
  title: 'Screen',
  params: {
    A: { x: 150, y: 499 }, B: { x: 99, y: 872 }, peaks: 3, amp: 140,
    hookLen: 260, hookAngle: 130, copies: 2, spacing: 900,
    label: 'S', labelSize: 160,
  },
  generate: zigzagHookFamily,
  handles: zigzagHookHandles,
  unitAnchor: 'start',
  meta: { sidcTaskId: "screen" },
};