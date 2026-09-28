// symbols/catalog/individual/main-attack.ts — standalone, tree-shakeable.
import type { SymbolDefinition, Params, Part } from "../../../engine/types";
import { P, polyD } from "../../../engine/geometry";
import { axisHandles, axisMainEffortNotch, axisOfAdvance, stroke } from "../../families";

export const MAIN_ATTACK_NAME = "svg-main-attack" as const;

export const mainAttackSymbol: SymbolDefinition = {
    title: 'Main Attack',
    params: {
      spine: [P(300, 1816), P(300, 867), P(750, 580), P(1829, 580)],
      halfWidth: 260, headLen: 601, headHalf: 521,
    },
    // The notch is DERIVED from the head, not stored.
    //
    // It used to be three absolute points — top P(1228,320), tip P(1529,580),
    // bottom P(1228,841) — which describe the notch correctly for the spine
    // above and for no other. Bend the spine to follow a route, as any map
    // consumer does on placement, and the axis moved while the notch stayed
    // behind: a stray chevron sitting in open country, and half the symbol
    // ignoring the unit it belonged to.
    //
    // Those coordinates were not arbitrary — they are the head base ±
    // halfWidth, reaching headLen/2 forward — so deriving them reproduces this
    // symbol exactly as authored and keeps doing so at any spine.
    generate(p: Params): Part[] {
      return [
        axisOfAdvance(p as never),
        stroke(polyD(axisMainEffortNotch(p as never))),
      ];
    },
    handles: axisHandles,
    unitAnchor: 'start', meta: { sidcTaskId: "main-attack" },
  };
