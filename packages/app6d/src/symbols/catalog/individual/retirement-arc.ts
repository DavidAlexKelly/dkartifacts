// symbols/catalog/individual/retirement-arc.ts — standalone, tree-shakeable.
import type { SymbolDefinition } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { retrogradeArcFamily, retrogradeArcHandles } from "../../families";

export const RETIREMENT_ARC_NAME = "svg-retirement-arc" as const;

export const retirementArcSymbol: SymbolDefinition = {
    title: 'Retirement',
    params: { A: P(36, 1235), B: P(1474, 1235), r: 430, headLen: 222, headSpread: 45, label: 'R', labelSize: 218 },
    generate: retrogradeArcFamily,
    handles: retrogradeArcHandles,
    // A retrograde is performed BY a unit, from A towards B: the unit is at the
  // start, not at a midpoint with no handle behind it.
  unitAnchor: 'start', meta: { sidcTaskId: "retirement" },
  };
