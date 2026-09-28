// symbols/catalog/individual/screen-post.ts — standalone, tree-shakeable.
import type { SymbolDefinition, EngineHandle, Params, Part } from "../../../engine/types";
import { P, add, chevron, circleArcs, dist, gapArrowDir, labelGapHalf, onCircle } from "../../../engine/geometry";
import { circleHandles, hPoint, hScalar, stroke, textP } from "../../families";

export const SCREEN_POST_NAME = "svg-screen-post" as const;

export const screenPostSymbol: SymbolDefinition = {
    title: 'Screen (with Observation Post)',
    params: { center: P(750, 900), radius: 700, gapAngle: 165, gapHalf: 15, headLen: 200, labelAngle: 0, label: 'S', labelSize: 160, post: P(1550, 900), postRadius: 120 },
    generate(p: Params): Part[] {
      const parts: Part[] = [];
      const gaps = p.label ? [{ angle: p.labelAngle, half: labelGapHalf(p.label, p.labelSize) / (p.radius * Math.PI / 180) }] : [];
      circleArcs(p.center, p.radius, p.gapAngle, p.gapHalf, gaps).forEach((d) => parts.push(stroke(d)));
      const a0 = p.gapAngle - p.gapHalf;
      parts.push(stroke(chevron(onCircle(p.center, p.radius, a0), gapArrowDir(a0), p.headLen, 45)));
      if (p.label) {parts.push(textP(p.label, onCircle(p.center, p.radius, p.labelAngle), p.labelSize, p.labelAngle + 90));}
      parts.push(stroke(
        `M${(p.post.x - p.postRadius).toFixed(1)},${p.post.y.toFixed(1)} A${p.postRadius.toFixed(1)},${p.postRadius.toFixed(1)} 0 1,0 ${(p.post.x + p.postRadius).toFixed(1)},${p.post.y.toFixed(1)} A${p.postRadius.toFixed(1)},${p.postRadius.toFixed(1)} 0 1,0 ${(p.post.x - p.postRadius).toFixed(1)},${p.post.y.toFixed(1)}`,
      ));
      return parts;
    },
    handles(p: Params): EngineHandle[] {
      return [
        ...circleHandles(p),
        hPoint('post', p),
        hScalar('postRadius', add(p.post, P(p.postRadius, 0)), (pos) => ({ postRadius: Math.max(30, dist(pos, p.post)) })),
      ];
    },
    unitAnchor: 'center', meta: { sidcTaskId: "screen" },
  };
