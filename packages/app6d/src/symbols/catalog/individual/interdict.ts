// symbols/catalog/individual/interdict.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { glyphHandles, pointGlyph } from "../../families";

export const INTERDICT_NAME = "svg-interdict" as const;

export const interdictSymbol: SymbolDefinition = {
    title: 'Interdict',
    params: { center: P(966, 883), scale: 1, rotation: 0 },
    generate: pointGlyph({
      strokes: [
        { pts: [P(645, -545), P(819, -545), P(819, -381), P(819, -545), P(95, -66)] },
        { pts: [P(-116, 65), P(-819, 545)] },
        { pts: [P(-819, -1), P(-116, -1)] },
        { pts: [P(95, -1), P(814, -1), P(650, -163), P(814, -1), P(650, 163)] },
      ],
      fills: [[P(-36, -147), P(-36, 163), P(30, 163), P(30, -147)]],
    }),
    handles: glyphHandles(819),
    unitAnchor: 'center', meta: { sidcTaskId: "interdict" },
  };
