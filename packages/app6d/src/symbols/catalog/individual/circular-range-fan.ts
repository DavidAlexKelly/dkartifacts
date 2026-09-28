// symbols/catalog/individual/circular-range-fan.ts — standalone, tree-shakeable.
//
// Reference #283, one anchor at the centre. The extracted template is two
// concentric rings — a weapon or sensor range fan, which is what the section
// it sits in ("Weapons / Radar Range Fans", as TACTIC_TASK_CATALOG also calls
// it) is for. Ranges are a list: a fan with four of them is four numbers, not
// four symbols.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { rangeFanFamily, rangeFanHandles } from "../../families";

export const CIRCULAR_RANGE_FAN_NAME = "svg-circular-range-fan" as const;

export const circularRangeFanSymbol: SymbolDefinition = {
  title: 'Circular Range Fan',
  params: {
    center: P(1024, 1024), scale: 1, rotation: 0,
    radii: [420, 700], sweep: 360, labels: [], labelSize: 190,
  },
  generate: rangeFanFamily,
  handles: rangeFanHandles,
  unitAnchor: 'center',
};
