// symbols/catalog/individual/counterattack-by-fire.ts — standalone, tree-shakeable.
import type { SymbolDefinition, EngineHandle, Params, Part } from "../../../engine/types";
import { P, add, chevron, dot, lineD, mul, polyD, sub } from "../../../engine/geometry";
import { axisHandles, axisHead, axisOfAdvance, hScalar, stroke } from "../../families";

export const COUNTERATTACK_BY_FIRE_NAME = "svg-counterattack-by-fire" as const;

/**
 * The fire brace, placed off the head of the axis.
 *
 * `standoff` is how far beyond the arrow tip it sits, along the axis — a
 * distance, not a position. It used to be an absolute point, P(1688, 609),
 * which sits just past the tip of the pristine spine and nowhere near the tip
 * of a spine re-fitted to a route: the brace was left behind over open ground
 * while the arrow followed the unit, reading as geometry that belongs to some
 * other symbol.
 */
function fireFrame(p: Params) {
  const { tip, dir, normal } = axisHead(p as never);
  return { pos: add(tip, mul(dir, p.fire.standoff as number)), dir, normal };
}

export const counterattackByFireSymbol: SymbolDefinition = {
    title: 'Counterattack By Fire',
    params: {
      spine: [P(228, 1710), P(228, 940), P(560, 609), P(1570, 609)], halfWidth: 199, headLen: 348, headHalf: 400,
      label: 'CATK', labelSize: 160, dashed: true,
      fire: { standoff: 118, braceHalf: 400, wingBack: 237, wingOut: 132, stemLen: 230, headLen: 88 },
    },
    generate(p: Params): Part[] {
      const parts: Part[] = [axisOfAdvance(p as never)];
      const q = p.fire;
      const { pos, dir: d, normal: n } = fireFrame(p);
      const b1 = add(pos, mul(n, q.braceHalf)), b2 = add(pos, mul(n, -q.braceHalf));
      parts.push(stroke(polyD([
        add(b1, add(mul(d, -q.wingBack), mul(n, q.wingOut))), b1, b2,
        add(b2, add(mul(d, -q.wingBack), mul(n, -q.wingOut))),
      ]), true));
      const tip = add(pos, mul(d, q.stemLen));
      parts.push(stroke(lineD(pos, tip), true));
      parts.push(stroke(chevron(tip, d, q.headLen, 30)));
      return parts;
    },
    handles: (p: Params): EngineHandle[] => {
      const { pos, dir } = fireFrame(p);
      return [
        ...axisHandles(p),
        // Dragging the brace slides it along the axis rather than moving it
        // anywhere on the plane: it is part of this symbol, and the only
        // question the user is really asking is how far off the head it sits.
        hScalar('fire', pos, (next) => ({
          fire: {
            ...p.fire,
            standoff: Math.max(0, dot(sub(next, axisHead(p as never).tip), dir)),
          },
        })),
      ];
    },
    unitAnchor: 'start', meta: { sidcTaskId: "counterattack-by-fire" },
  };
