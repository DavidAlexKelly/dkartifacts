// symbols/catalog/individual/obstacle-line.ts — standalone, tree-shakeable.
//
// Reference #288. "A conceptual control measure used at battalion or lower
// level to show where obstacles are to be emplaced." Two anchors define the
// line.
//
// A zigzag, not a line with ticks: the example crop is a run of short diagonal
// segments end to end, each about 94 by 177, which is one continuous zigzag
// traced as separate strokes by the PDF.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { zigzagFamily, zigzagHandles } from "../../families";

export const OBSTACLE_LINE_NAME = "svg-obstacle-line" as const;

export const obstacleLineSymbol: SymbolDefinition = {
  title: 'Obstacle Line',
  params: { A: P(250, 1024), B: P(1800, 1024), peaks: 7, amp: 180, label: '', labelSize: 240 },
  generate: zigzagFamily,
  handles: zigzagHandles,
  unitAnchor: 'midline',
  meta: { sidcTaskId: "line-general-obstacles" },
};
