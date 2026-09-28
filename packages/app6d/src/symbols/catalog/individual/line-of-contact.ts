// symbols/catalog/individual/line-of-contact.ts — standalone, tree-shakeable.
//
// Reference #29. "A general trace delineating the locations where two opposing
// forces are in contact."
//
// The scalloped line with its bumps alternating from side to side: two forces,
// one trace, each of them on their own side of it. That is the only thing
// separating this from the FEBA, whose bumps all face the enemy — so it is a
// param on the family rather than a second family.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { scallopLineFamily, polylineHandles } from "../../families";

export const LINE_OF_CONTACT_NAME = "svg-line-of-contact" as const;

export const lineOfContactSymbol: SymbolDefinition = {
  title: 'Line of Contact',
  params: {
    spine: [P(420, 1024), P(1628, 1024)], bumps: 6, side: 1, alternate: true,
    label: 'LC', labelSize: 240, dashed: false,
  },
  generate: scallopLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
