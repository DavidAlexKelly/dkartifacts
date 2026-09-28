// symbols/catalog/individual/seize.ts — standalone, tree-shakeable.
import { onCircle, dist, sub, angleOf, chevron, gapArrowDir, circleArcs, labelGapHalf } from "../../../engine/geometry";
import type { SymbolDefinition, Part, Params, EngineHandle } from "../../../engine/types";
import { stroke, textP, hScalar, circleHandles } from "../../families";

export const SEIZE_NAME = "svg-seize" as const;

export const seizeSymbol: SymbolDefinition = {
  title: 'Seize',
  params: {
    center: { x: 950, y: 900 }, radius: 780, gapAngle: 165, gapHalf: 15,
    headLen: 210, labelAngle: 0, label: 'S', labelSize: 190,
    markerAngle: 200, markerRadius: 95,
  },
  generate(p: Params): Part[] {
    const parts: Part[] = [];
    const gaps = p.label
      ? [{ angle: p.labelAngle, half: labelGapHalf(p.label, p.labelSize) / (p.radius * Math.PI / 180) }]
      : [];
    circleArcs(p.center, p.radius, p.gapAngle, p.gapHalf, gaps).forEach((d) => parts.push(stroke(d)));
    const a0 = p.gapAngle - p.gapHalf;
    parts.push(stroke(chevron(onCircle(p.center, p.radius, a0), gapArrowDir(a0), p.headLen, 45)));
    if (p.label) {
      parts.push(textP(p.label, onCircle(p.center, p.radius, p.labelAngle), p.labelSize, p.labelAngle + 90));
    }
    const m = onCircle(p.center, p.radius, p.markerAngle);
    parts.push(stroke(
      `M${(m.x - p.markerRadius).toFixed(1)},${m.y.toFixed(1)} ` +
      `A${p.markerRadius.toFixed(1)},${p.markerRadius.toFixed(1)} 0 1,0 ${(m.x + p.markerRadius).toFixed(1)},${m.y.toFixed(1)} ` +
      `A${p.markerRadius.toFixed(1)},${p.markerRadius.toFixed(1)} 0 1,0 ${(m.x - p.markerRadius).toFixed(1)},${m.y.toFixed(1)}`,
    ));
    return parts;
  },
  handles(p: Params): EngineHandle[] {
    const base = circleHandles(p);
    const markerPos = onCircle(p.center, p.radius + p.markerRadius, p.markerAngle);
    base.push(hScalar('marker', markerPos, (pos) => ({
      markerAngle: angleOf(sub(pos, p.center)),
      markerRadius: Math.max(20, dist(pos, p.center) - p.radius),
    })));
    return base;
  },
  unitAnchor: 'center',
  meta: { sidcTaskId: "seize" },
};