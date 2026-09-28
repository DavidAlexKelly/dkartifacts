// symbols/catalog/individual/secure.ts — standalone, tree-shakeable.
import type { SymbolDefinition, Params, Part } from "../../../engine/types";
import { P, chevron, circleArcs, gapArrowDir, labelGapHalf, onCircle } from "../../../engine/geometry";
import { circleHandles, stroke, textP } from "../../families";

export const SECURE_NAME = "svg-secure" as const;

export const secureSymbol: SymbolDefinition = {
    title: 'Secure',
    params: { center: P(916, 890), radius: 865, gapAngle: 165, gapHalf: 15, headLen: 243, labelAngle: 0, label: 'S', labelSize: 144 },
    generate(p: Params): Part[] {
      const parts: Part[] = [];
      const gaps = p.label ? [{ angle: p.labelAngle, half: labelGapHalf(p.label, p.labelSize) / (p.radius * Math.PI / 180) }] : [];
      circleArcs(p.center, p.radius, p.gapAngle, p.gapHalf, gaps).forEach(d => parts.push(stroke(d)));
      const a0 = p.gapAngle - p.gapHalf;
      parts.push(stroke(chevron(onCircle(p.center, p.radius, a0), gapArrowDir(a0), p.headLen, 45)));
      if (p.label) {parts.push(textP(p.label, onCircle(p.center, p.radius, p.labelAngle), p.labelSize, p.labelAngle + 90));}
      return parts;
    },
    handles: circleHandles,
    unitAnchor: 'center', meta: { sidcTaskId: "secure" },
  };
