// symbols/catalog/individual/neutralize.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { glyphHandles, pointGlyph } from "../../families";

export const NEUTRALIZE_NAME = "svg-neutralize" as const;

export const neutralizeSymbol: SymbolDefinition = {
    title: 'Neutralize',
    params: { center: P(966, 886), scale: 1, rotation: 0 },
    generate: pointGlyph({
      strokes: [
        { pts: [P(177, 128), P(814, 542)] },
        { pts: [P(-210, -133), P(-814, -542)] },
        { pts: [P(-210, 133), P(-814, 542)], dashed: true },
        { pts: [P(177, -128), P(814, -542)], dashed: true },
      ],
      fills: [[P(-133, 161), P(-133, -156), P(-69, -156), P(57, 46), P(57, -156), P(123, -156), P(123, 161), P(57, 161), P(-69, -41), P(-69, 161)]],
    }),
    handles: glyphHandles(814),
    unitAnchor: 'center', meta: { sidcTaskId: "neutralize" },
  };
