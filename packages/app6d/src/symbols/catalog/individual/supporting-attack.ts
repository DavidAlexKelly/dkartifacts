// symbols/catalog/individual/supporting-attack.ts — standalone, tree-shakeable.
import type { SymbolDefinition, Params, Part } from "../../../engine/types";
import { P } from "../../../engine/geometry";
import { axisHandles, axisOfAdvance } from "../../families";

export const SUPPORTING_ATTACK_NAME = "svg-supporting-attack" as const;

export const supportingAttackSymbol: SymbolDefinition = {
    title: 'Supporting Attack',
    params: { spine: [P(300, 1816), P(300, 867), P(750, 580), P(1829, 580)], halfWidth: 260, headLen: 601, headHalf: 521 },
    generate(p: Params): Part[] { return [axisOfAdvance(p as any)]; },
    handles: axisHandles,
    unitAnchor: 'start', meta: { sidcTaskId: "supporting-attack" },
  };
