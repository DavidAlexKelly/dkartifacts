// symbols/catalog/individual/contain.ts — standalone, tree-shakeable.
import type { SymbolDefinition, EngineHandle, Params, Part } from "../../../engine/types";
import { P, angleOf, chevron, circleArcs, dist, labelGapHalf, lerp, lineD, lineWithGap, norm, onCircle, sub } from "../../../engine/geometry";
import { hPoint, hScalar, stroke, textP } from "../../families";

export const CONTAIN_NAME = "svg-contain" as const;

export const containSymbol: SymbolDefinition = {
    title: 'Contain',
    params: { center: P(750, 882), radius: 585, rotation: 0, tickCount: 10, tickLen: 196, arrowFrom: P(1917, 882), chevLen: 142, chevSpread: 35, label: 'ENY', labelSize: 185, apexLabel: 'C', apexLabelSize: 185 },
    generate(p: Params): Part[] {
      const parts: Part[] = [];
      const apex = p.rotation + 180;
      const gaps = p.apexLabel ? [{ angle: apex, half: labelGapHalf(p.apexLabel, p.apexLabelSize) / (p.radius * Math.PI / 180) }] : [];
      circleArcs(p.center, p.radius, p.rotation, 90, gaps).forEach(d => parts.push(stroke(d)));
      const a0 = p.rotation - 90;
      for (let k = 1; k <= p.tickCount; k++) {
        const th = a0 - k * 180 / (p.tickCount + 1);
        if (Math.abs((((th - apex) % 360) + 540) % 360 - 180) < 8) {continue;}
        parts.push(stroke(lineD(onCircle(p.center, p.radius, th), onCircle(p.center, p.radius - p.tickLen, th))));
      }
      if (p.apexLabel) {parts.push(textP(p.apexLabel, onCircle(p.center, p.radius, apex), p.apexLabelSize));}
      const dir = norm(sub(p.center, p.arrowFrom));
      const mid = lerp(p.arrowFrom, p.center, 0.5);
      lineWithGap(p.arrowFrom, p.center, mid, labelGapHalf(p.label, p.labelSize)).forEach(d => parts.push(stroke(d)));
      parts.push(stroke(chevron(p.center, dir, p.chevLen, p.chevSpread)));
      parts.push(textP(p.label, mid, p.labelSize));
      return parts;
    },
    handles: (p: Params): EngineHandle[] => [
      hPoint('center', p), hPoint('arrowFrom', p),
      hScalar('radius', onCircle(p.center, p.radius, p.rotation + 180),
        (pos) => ({ radius: Math.max(60, dist(pos, p.center)), rotation: angleOf(sub(pos, p.center)) - 180 })),
    ],
    unitAnchor: 'center', meta: { sidcTaskId: "contain" },
  };
