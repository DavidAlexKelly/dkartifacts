// symbols/catalog/individual/destroy.ts — standalone, tree-shakeable.
import { P } from "../../../engine/geometry";
import type { SymbolDefinition } from "../../../engine/types";
import { pointGlyph, glyphHandles } from "../../families";

export const DESTROY_NAME = "svg-destroy" as const;

export const destroySymbol: SymbolDefinition = {
  title: 'Destroy',
  params: { center: P(963, 888), scale: 1, rotation: 0 },
  generate: pointGlyph({
    strokes: [
      { pts: [P(-185, 127), P(-926, 618)] },
      { pts: [P(-907, -618), P(-185, -133)] },
      { pts: [P(926, -618), P(185, -127)] },
      { pts: [P(201, 127), P(923, 612)] },
    ],
    label: { text: 'D', pos: P(9, 34), size: 410 },
  }),
  handles: glyphHandles(926),
  unitAnchor: 'center',
  meta: { sidcTaskId: "destroy" },
};