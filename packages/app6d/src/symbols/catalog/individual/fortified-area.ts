// symbols/catalog/individual/fortified-area.ts — standalone, tree-shakeable.
import type { SymbolDefinition, EngineHandle, Params, Part } from "../../../engine/types";
import { P, dist, lineD, onCircle } from "../../../engine/geometry";
import { hPoint, hScalar, stroke } from "../../families";

export const FORTIFIED_AREA_NAME = "svg-fortified-area" as const;

export const fortifiedAreaSymbol: SymbolDefinition = {
    title: 'Fortified Area (ticked loop)',
    params: { center: P(950, 900), radius: 650, tickCount: 14, tickLen: 150 },
    generate(p: Params): Part[] {
      const parts: Part[] = [stroke(
        `M${(p.center.x + p.radius).toFixed(1)},${p.center.y.toFixed(1)} A${p.radius.toFixed(1)},${p.radius.toFixed(1)} 0 1,0 ${(p.center.x - p.radius).toFixed(1)},${p.center.y.toFixed(1)} A${p.radius.toFixed(1)},${p.radius.toFixed(1)} 0 1,0 ${(p.center.x + p.radius).toFixed(1)},${p.center.y.toFixed(1)}`,
      )];
      for (let k = 0; k < p.tickCount; k++) {
        const th = (k * 360) / p.tickCount;
        parts.push(stroke(lineD(onCircle(p.center, p.radius, th), onCircle(p.center, p.radius + p.tickLen, th))));
      }
      return parts;
    },
    handles(p: Params): EngineHandle[] {
      return [
        hPoint('center', p),
        hScalar('radius', onCircle(p.center, p.radius, 45), (pos) => ({ radius: Math.max(80, dist(pos, p.center)) })),
        hScalar('tickLen', onCircle(p.center, p.radius + p.tickLen, 0),
          (pos) => ({ tickLen: Math.max(20, dist(pos, p.center) - p.radius) })),
      ];
    },
    unitAnchor: 'center', meta: { sidcTaskId: "fortified-line" },
  };
