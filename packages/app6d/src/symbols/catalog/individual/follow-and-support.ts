// symbols/catalog/individual/follow-and-support.ts — standalone, tree-shakeable.
import type { SymbolDefinition, EngineHandle, Params, Part } from "../../../engine/types";
import { P, add, lineD, mul, norm, perp, polyD, sub } from "../../../engine/geometry";
import { fillP, hPoint, stroke } from "../../families";

export const FOLLOW_AND_SUPPORT_NAME = "svg-follow-and-support" as const;

export const followAndSupportSymbol: SymbolDefinition = {
    title: 'Follow And Support',
    params: { A: P(43, 889), B: P(1895, 888), boxHalf: 167, boxLen: 842, notch: 168, headLen: 287, headHalf: 167 },
    generate(p: Params): Part[] {
      const d = norm(sub(p.B, p.A)), n = perp(d);
      const parts: Part[] = [];
      const boxTip = add(p.A, mul(d, p.boxLen));
      parts.push(stroke(polyD([
        add(p.A, mul(d, p.notch)),
        add(p.A, mul(n, p.boxHalf)), add(add(p.A, mul(d, p.boxLen - p.notch)), mul(n, p.boxHalf)),
        boxTip,
        add(add(p.A, mul(d, p.boxLen - p.notch)), mul(n, -p.boxHalf)), add(p.A, mul(n, -p.boxHalf)),
      ], true)));
      const base = sub(p.B, mul(d, p.headLen));
      parts.push(stroke(lineD(boxTip, base)));
      parts.push(fillP(polyD([p.B, add(base, mul(n, p.headHalf)), add(base, mul(n, -p.headHalf))], true)));
      return parts;
    },
    handles: (p: Params): EngineHandle[] => [hPoint('A', p), hPoint('B', p)],
    unitAnchor: 'start', meta: { sidcTaskId: "follow-and-support" },
  };
