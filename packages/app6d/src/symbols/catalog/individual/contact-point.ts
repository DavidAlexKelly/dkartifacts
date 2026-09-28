// symbols/catalog/individual/contact-point.ts — standalone, tree-shakeable.
//
// Reference #6. "In land warfare, a point on the terrain, easily identifiable,
// where two or more units are required to make contact." (AAP-6) One anchor,
// which "defines the centre of the symbol".
//
// A plain box carrying the designation. Both the template and the example
// crops draw exactly that — a single rectangle, slightly wider than tall
// (779x713 and 905x830), with the designation inside it — so the box is
// authored at that proportion and the text is the caller's.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { pointGlyph, glyphHandles } from "../../families";

export const CONTACT_POINT_NAME = "svg-contact-point" as const;

const HALF_W = 450;
const HALF_H = 410;

export const contactPointSymbol: SymbolDefinition = {
  title: 'Contact Point',
  params: { center: P(1024, 1024), scale: 1, rotation: 0, label: '', labelSize: 420 },
  generate: pointGlyph({
    strokes: [{
      pts: [P(-HALF_W, -HALF_H), P(HALF_W, -HALF_H), P(HALF_W, HALF_H), P(-HALF_W, HALF_H)],
      closed: true,
    }],
    labelSlot: { pos: P(0, 0), size: 420 },
  }),
  handles: glyphHandles(HALF_W),
  unitAnchor: 'center',
  meta: { sidcTaskId: "contact-point" },
};
