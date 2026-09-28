// symbols/catalog/individual/follow-and-assume.ts — standalone, tree-shakeable.
import type { SymbolDefinition, EngineHandle, Params, Part } from "../../../engine/types";
import { P, add, lineD, mul, norm, perp, polyD, sub } from "../../../engine/geometry";
import { hPoint, stroke } from "../../families";

export const FOLLOW_AND_ASSUME_NAME = "svg-follow-and-assume" as const;

export const followAndAssumeSymbol: SymbolDefinition = {
    title: 'Follow And Assume',
    params: { A: P(36, 890), B: P(1906, 890), boxHalf: 175, boxRectLen: 431, boxPointLen: 604, headLen: 431, headOuterHalf: 435, headInnerHalf: 289, headInnerLen: 143 },
    generate(p: Params): Part[] {
      const d = norm(sub(p.B, p.A)), n = perp(d);
      const parts: Part[] = [];
      const pTip = add(p.A, mul(d, p.boxPointLen));
      parts.push(stroke(polyD([
        add(p.A, mul(n, p.boxHalf)), add(add(p.A, mul(d, p.boxRectLen)), mul(n, p.boxHalf)),
        pTip,
        add(add(p.A, mul(d, p.boxRectLen)), mul(n, -p.boxHalf)), add(p.A, mul(n, -p.boxHalf)),
      ], true)));
      const base = sub(p.B, mul(d, p.headLen));
      const inner = sub(p.B, mul(d, p.headInnerLen));
      parts.push(stroke(polyD([
        p.B, add(base, mul(n, p.headOuterHalf)), add(base, mul(n, p.headInnerHalf)),
        inner,
        add(base, mul(n, -p.headInnerHalf)), add(base, mul(n, -p.headOuterHalf)),
      ], true)));
      parts.push(stroke(lineD(pTip, add(base, mul(d, (p.headLen - p.headInnerLen) * 0.66))), true));
      return parts;
    },
    handles: (p: Params): EngineHandle[] => [hPoint('A', p), hPoint('B', p)],
    unitAnchor: 'start', meta: { sidcTaskId: "follow-and-assume" },
  };
