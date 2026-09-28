// symbols/catalog/individual/disrupt.ts — standalone, tree-shakeable.
import type { SymbolDefinition, EngineHandle, Params, Part } from "../../../engine/types";
import { P, add, chevron, labelGapHalf, lerp, lineD, lineWithGap, mul, norm, project, right, sub } from "../../../engine/geometry";
import { hPoint, hScalar, stroke, textP } from "../../families";

export const DISRUPT_NAME = "svg-disrupt" as const;

export const disruptSymbol: SymbolDefinition = {
    title: 'Disrupt',
    params: { A: P(362, 1638), B: P(362, 142), maxLen: 1496, ratios: [1, 0.75, 0.5], stub: 300, chevLen: 183, chevSpread: 35, label: 'D', labelSize: 216 },
    generate(p: Params): Part[] {
      const dir = norm(sub(p.B, p.A));
      const out = right(dir);
      const parts: Part[] = [stroke(lineD(p.A, p.B))];
      const rows = [p.A, lerp(p.A, p.B, 0.5), p.B];
      rows.forEach((base, i) => {
        const tip = add(base, mul(out, p.maxLen * p.ratios[i]));
        if (i === 1) {
          const mid = lerp(base, tip, 0.5);
          lineWithGap(base, tip, mid, labelGapHalf(p.label, p.labelSize)).forEach(d => parts.push(stroke(d)));
          parts.push(textP(p.label, mid, p.labelSize));
          parts.push(stroke(lineD(base, add(base, mul(out, -p.stub)))));
        } else {parts.push(stroke(lineD(base, tip)));}
        parts.push(stroke(chevron(tip, out, p.chevLen, p.chevSpread)));
      });
      return parts;
    },
    handles: (p: Params): EngineHandle[] => [
      hPoint('A', p), hPoint('B', p),
      hScalar('maxLen', add(p.A, mul(right(norm(sub(p.B, p.A))), p.maxLen)),
        (pos) => ({ maxLen: Math.max(50, project(pos, p.A, right(norm(sub(p.B, p.A))))) })),
    ],
    unitAnchor: 'start', meta: { sidcTaskId: "disrupt" },
  };
