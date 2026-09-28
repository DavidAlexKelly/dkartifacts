// symbols/catalog/individual/occupy.ts — standalone, tree-shakeable.
import type { SymbolDefinition, Params, Part } from "../../../engine/types";
import { P, add, angleOf, circleArcs, gapArrowDir, labelGapHalf, lineD, mul, onCircle, rot } from "../../../engine/geometry";
import { circleHandles, stroke, textP } from "../../families";

export const OCCUPY_NAME = "svg-occupy" as const;

export const occupySymbol: SymbolDefinition = {
    title: 'Occupy',
    params: { center: P(977, 890), radius: 847, gapAngle: 165, gapHalf: 15, armHalf: 245, labelAngle: 0, label: 'O', labelSize: 144 },
    generate(p: Params): Part[] {
      const parts: Part[] = [];
      const gaps = p.label ? [{ angle: p.labelAngle, half: labelGapHalf(p.label, p.labelSize) / (p.radius * Math.PI / 180) }] : [];
      circleArcs(p.center, p.radius, p.gapAngle, p.gapHalf, gaps).forEach(d => parts.push(stroke(d)));
      const a0 = p.gapAngle - p.gapHalf;
      const c = onCircle(p.center, p.radius, a0);
      const tang = angleOf(gapArrowDir(a0));
      for (const off of [-45, 45]) {
        const d = rot(P(1, 0), tang + off);
        parts.push(stroke(lineD(add(c, mul(d, -p.armHalf)), add(c, mul(d, p.armHalf)))));
      }
      if (p.label) {parts.push(textP(p.label, onCircle(p.center, p.radius, p.labelAngle), p.labelSize, p.labelAngle + 90));}
      return parts;
    },
    handles: circleHandles,
    unitAnchor: 'center', meta: { sidcTaskId: "occupy" },
  };
