// symbols/catalog/individual/retain.ts — standalone, tree-shakeable.
import type { SymbolDefinition, Params, Part } from "../../../engine/types";
import { P, add, chevron, circleArcs, gapArrowDir, labelGapHalf, lineD, mul, onCircle } from "../../../engine/geometry";
import { circleHandles, stroke, textP } from "../../families";

export const RETAIN_NAME = "svg-retain" as const;

export const retainSymbol: SymbolDefinition = {
    title: 'Retain',
    params: { center: P(974, 895), radius: 596, gapAngle: 165, gapHalf: 15, tickCount: 16, tickLen: 170, headLen: 150, labelAngle: 0, label: 'R', labelSize: 144 },
    generate(p: Params): Part[] {
      const parts: Part[] = [];
      const gaps = p.label ? [{ angle: p.labelAngle, half: labelGapHalf(p.label, p.labelSize) / (p.radius * Math.PI / 180) }] : [];
      circleArcs(p.center, p.radius, p.gapAngle, p.gapHalf, gaps).forEach(d => parts.push(stroke(d)));
      const a0 = p.gapAngle - p.gapHalf, S = 360 - 2 * p.gapHalf;
      for (let k = 1; k <= p.tickCount; k++) {
        const th = a0 - k * S / (p.tickCount + 1);
        parts.push(stroke(lineD(onCircle(p.center, p.radius, th), onCircle(p.center, p.radius + p.tickLen, th))));
      }
      const tip = onCircle(p.center, p.radius, a0), dir = gapArrowDir(a0);
      parts.push(stroke(chevron(tip, dir, p.headLen, 40)));
      parts.push(stroke(chevron(add(tip, mul(dir, -p.headLen * 0.45)), dir, p.headLen, 40)));
      if (p.label) {parts.push(textP(p.label, onCircle(p.center, p.radius, p.labelAngle), p.labelSize, p.labelAngle + 90));}
      return parts;
    },
    handles: circleHandles,
    unitAnchor: 'center', meta: { sidcTaskId: "retain" },
  };
