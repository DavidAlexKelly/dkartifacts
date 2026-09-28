// symbols/catalog/individual/line-of-departure-line-of-contact.ts — standalone,
// tree-shakeable.
//
// Reference #97. "The designation of forward friendly positions when the line
// of departure and the line of contact are the same." Two or more anchors,
// text posted at both ends.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { labelledLineFamily, polylineHandles } from "../../families";

export const LINE_OF_DEPARTURE_LINE_OF_CONTACT_NAME = "svg-line-of-departure-line-of-contact" as const;

export const lineOfDepartureLineOfContactSymbol: SymbolDefinition = {
  title: 'Line of Departure/Line of Contact',
  params: { spine: [P(520, 1024), P(1528, 1024)], label: 'LD/LC', labelSize: 230, dashed: false },
  generate: labelledLineFamily,
  handles: polylineHandles,
  unitAnchor: 'start',
};
