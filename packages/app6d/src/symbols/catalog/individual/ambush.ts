// symbols/catalog/individual/ambush.ts — standalone, tree-shakeable.
import type { SymbolDefinition, EngineHandle, Params, Part } from "../../../engine/types";
import { P, type Pt, add, chevron, lerp, lineD, mul, norm, perp, polyD, project, sub } from "../../../engine/geometry";
import { hPoint, hScalar, stroke } from "../../families";

export const AMBUSH_NAME = "svg-ambush" as const;

export const ambushSymbol: SymbolDefinition = {
    title: 'Ambush',
    params: { A: P(500, 100), B: P(500, 1200), peaks: 4, amp: 170, tickCount: 5, tickReach: 350, arrowLen: 950, arrowHeadLen: 150, arrowHeadSpread: 35 },
    generate(p: Params): Part[] {
      const parts: Part[] = [];
      const dir = norm(sub(p.B, p.A));
      const n = perp(dir);
      const curvePts: Pt[] = [p.A];
      for (let k = 1; k <= p.peaks; k++) {
        const t = k / (p.peaks + 1);
        const side = k % 2 === 1 ? 1 : -1;
        curvePts.push(add(lerp(p.A, p.B, t), mul(n, side * p.amp)));
      }
      curvePts.push(p.B);
      parts.push(stroke(polyD(curvePts)));
      for (let i = 0; i < p.tickCount; i++) {
        const t = (i + 0.5) / p.tickCount;
        const segT = t * (curvePts.length - 1);
        const i0 = Math.min(curvePts.length - 2, Math.floor(segT));
        const localT = segT - i0;
        const curvePos = lerp(curvePts[i0], curvePts[i0 + 1], localT);
        const target = add(curvePos, mul(n, -p.tickReach));
        parts.push(stroke(lineD(curvePos, target)));
      }
      const mid = lerp(p.A, p.B, 0.5);
      const arrowTip = add(mid, mul(n, p.arrowLen));
      parts.push(stroke(lineD(mid, arrowTip)));
      parts.push(stroke(chevron(arrowTip, n, p.arrowHeadLen, p.arrowHeadSpread)));
      return parts;
    },
    handles(p: Params): EngineHandle[] {
      const dir = norm(sub(p.B, p.A)), n = perp(dir);
      const mid = lerp(p.A, p.B, 0.5);
      const firstPeakBase = lerp(p.A, p.B, 1 / (p.peaks + 1));
      const firstTickBase = lerp(p.A, p.B, 0.5 / p.tickCount);
      return [
        hPoint('A', p), hPoint('B', p),
        hScalar('amp', add(firstPeakBase, mul(n, p.amp)),
          (pos) => ({ amp: Math.max(20, Math.abs(project(pos, firstPeakBase, n))) })),
        hScalar('arrowLen', add(mid, mul(n, p.arrowLen)),
          (pos) => ({ arrowLen: Math.max(60, project(pos, mid, n)) })),
        hScalar('tickReach', add(firstTickBase, mul(n, -p.tickReach)),
          (pos) => ({ tickReach: Math.max(20, -project(pos, firstTickBase, n)) })),
      ];
    },
    unitAnchor: 'start', meta: { sidcTaskId: "ambush" },
  };
