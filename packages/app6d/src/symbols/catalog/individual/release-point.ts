// symbols/catalog/individual/release-point.ts — standalone, tree-shakeable.
//
// Reference #14. "In road movements, a well defined point on a route at which
// the elements composing a column return under the authority of their
// respective commanders."
//
// No DRAW RULES page survived the crop; the extracted template is the family's
// inverted cone at the shared proportions. "RP" is the conventional
// abbreviation — unlike the rally point's "RLY" it was not recovered from the
// publication, so it is a default rather than evidence.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { coneMarkerFamily, coneMarkerHandles } from "../../families";

export const RELEASE_POINT_NAME = "svg-release-point" as const;

export const releasePointSymbol: SymbolDefinition = {
  title: 'Release Point',
  params: { tip: P(1024, 1700), size: 700, rotation: 0, label: 'RP', labelSize: 380 },
  generate: coneMarkerFamily,
  handles: coneMarkerHandles,
  unitAnchor: 'start',
};
