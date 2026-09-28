// symbols/catalog/individual/waypoint.ts — standalone, tree-shakeable.
//
// Reference #19. "A designated point or series of points loaded and stored in a
// global positioning system or other electronic navigational aid system to
// facilitate movement." One anchor, which "defines the centre of the symbol".
//
// A diagonal cross. Template and example agree: two straight paths crossing at
// the centre over a square extent (779 and 899 respectively, both square to
// within a unit), and nothing else.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { pointGlyph, glyphHandles } from "../../families";

export const WAYPOINT_NAME = "svg-waypoint" as const;

const ARM = 450;

export const waypointSymbol: SymbolDefinition = {
  title: 'Waypoint',
  params: { center: P(1024, 1024), scale: 1, rotation: 0, label: '', labelSize: 300 },
  generate: pointGlyph({
    strokes: [
      { pts: [P(-ARM, -ARM), P(ARM, ARM)] },
      { pts: [P(-ARM, ARM), P(ARM, -ARM)] },
    ],
    // The template carries a "T" field above the cross and no abbreviation of
    // its own, so the slot exists and starts empty: a waypoint's text is its
    // number.
    labelSlot: { pos: P(0, -ARM - 260), size: 300 },
  }),
  handles: glyphHandles(ARM),
  unitAnchor: 'center',
};
