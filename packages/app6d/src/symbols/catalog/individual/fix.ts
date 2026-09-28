// symbols/catalog/individual/fix.ts — standalone, tree-shakeable.
import type { SymbolDefinition, EngineHandle, Params, Part } from "../../../engine/types";
import { P, add, chevron, lerp, mul, norm, perp, polyD, project, sub } from "../../../engine/geometry";
import { hPoint, hScalar, stroke, textP } from "../../families";

export const FIX_NAME = "svg-fix" as const;

export const fixSymbol: SymbolDefinition = {
    title: 'Fix',
    params: { A: P(244, 889), B: P(1890, 889), t0: 0.15, t1: 0.75, peaks: 6, amp: 164, chevLen: 465, chevSpread: 45, label: 'F', labelSize: 218 },
    generate(p: Params): Part[] {
      const dir = norm(sub(p.B, p.A)), n = perp(dir);
      const z0 = lerp(p.A, p.B, p.t0), z1 = lerp(p.A, p.B, p.t1);
      const pts = [p.A, z0];
      for (let k = 1; k <= p.peaks; k++) {
        const t = (k - 0.5) / p.peaks;
        pts.push(add(lerp(z0, z1, t), mul(n, (k % 2 ? -1 : 1) * p.amp)));
      }
      pts.push(z1, p.B);
      const parts: Part[] = [stroke(polyD(pts))];
      parts.push(stroke(chevron(p.B, dir, p.chevLen, p.chevSpread)));
      if (p.label) {parts.push(textP(p.label, add(p.A, mul(dir, -10)), p.labelSize));}
      return parts;
    },
    handles: (p: Params): EngineHandle[] => {
      const dir = norm(sub(p.B, p.A)), n = perp(dir);
      const z0 = lerp(p.A, p.B, p.t0), z1 = lerp(p.A, p.B, p.t1);
      return [
        hPoint('A', p), hPoint('B', p),
        hScalar('amp', add(lerp(z0, z1, 0.5 / p.peaks), mul(n, -p.amp)),
          (pos) => ({ amp: Math.max(20, Math.abs(project(pos, lerp(p.A, p.B, 0.5), n))) })),
      ];
    },
    unitAnchor: 'start', meta: { sidcTaskId: "fix" },
  };
