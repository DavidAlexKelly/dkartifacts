// symbols/catalog/individual/counterattack.ts — standalone, tree-shakeable.
import { P, dist, angleOf, sub, lerp } from "../../../engine/geometry";
import type { SymbolDefinition, Part, Params } from "../../../engine/types";
import { axisOfAdvance, axisHandles, textP } from "../../families";

export const COUNTERATTACK_NAME = "svg-counterattack" as const;

export const counterattackSymbol: SymbolDefinition = {
  title: 'Counterattack (CATK)',
  params: {
    spine: [P(281, 1696), P(281, 900), P(655, 550), P(1920, 547)],
    halfWidth: 243, headLen: 557, headHalf: 480, label: 'CATK', labelSize: 166, dashed: true,
  },
  generate(p: Params): Part[] {
    const parts: Part[] = [axisOfAdvance(p as any)];
    if (p.label) {
      let best = 0, bi = 0;
      for (let i = 0; i < p.spine.length - 1; i++) {
        const l = dist(p.spine[i], p.spine[i + 1]);
        if (l > best) { best = l; bi = i; }
      }
      const a = p.spine[bi], b = p.spine[bi + 1];
      let ang = angleOf(sub(b, a));
      if (ang > 90 || ang < -90) {ang += 180;}
      parts.push(textP(p.label, lerp(a, b, 0.5), p.labelSize, ang));
    }
    return parts;
  },
  handles: axisHandles,
  unitAnchor: 'start',
  meta: { sidcTaskId: "counterattack-catk" },
};