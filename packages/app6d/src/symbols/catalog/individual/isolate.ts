// symbols/catalog/individual/isolate.ts — standalone, tree-shakeable.
import type { SymbolDefinition, Params, Part } from "../../../engine/types";
import { P, chevron, circleArcs, gapArrowDir, onCircle, polyD } from "../../../engine/geometry";
import { circleHandles, stroke } from "../../families";

export const ISOLATE_NAME = "svg-isolate" as const;

export const isolateSymbol: SymbolDefinition = {
    title: 'Isolate',
    params: { center: P(973, 891), radius: 858, gapAngle: 165, gapHalf: 15, headLen: 243, inwardCount: 7, inwardDepth: 0.23, inwardSpread: 7.8 },
    generate(p: Params): Part[] {
      const parts: Part[] = [];
      circleArcs(p.center, p.radius, p.gapAngle, p.gapHalf).forEach(d => parts.push(stroke(d)));
      const a0 = p.gapAngle - p.gapHalf, S = 360 - 2 * p.gapHalf;
      parts.push(stroke(chevron(onCircle(p.center, p.radius, a0), gapArrowDir(a0), p.headLen, 45)));
      for (let k = 1; k <= p.inwardCount; k++) {
        const th = a0 - k * S / (p.inwardCount + 1);
        const v = onCircle(p.center, p.radius * (1 - p.inwardDepth), th);
        parts.push(stroke(polyD([onCircle(p.center, p.radius, th - p.inwardSpread), v, onCircle(p.center, p.radius, th + p.inwardSpread)])));
      }
      return parts;
    },
    handles: circleHandles,
    unitAnchor: 'center', meta: { sidcTaskId: "isolate" },
  };
