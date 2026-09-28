// symbols/catalog/individual/support-by-fire-position.ts — standalone, tree-shakeable.
import type { SymbolDefinition, EngineHandle, Params, Part } from "../../../engine/types";
import { P, lineD, polyD } from "../../../engine/geometry";
import { hPoint, stroke } from "../../families";

export const SUPPORT_BY_FIRE_POSITION_NAME = "svg-support-by-fire-position" as const;

export const supportByFirePositionSymbol: SymbolDefinition = {
    title: 'Support By Fire Position',
    params: {
      topOuter: P(46, 189), bendTop: P(272, 416), bendBottom: P(272, 1549), bottomOuter: P(46, 1776),
      wingTopTip: P(839, 41), wingBottomTip: P(839, 1924),
      notchTopA: P(662, 347), notchTopB: P(488, 83), notchBottomA: P(488, 1882), notchBottomB: P(662, 1618),
    },
    generate(p: Params): Part[] {
      return [
        stroke(polyD([p.topOuter, p.bendTop, p.bendBottom, p.bottomOuter])),
        stroke(lineD(p.bendTop, p.wingTopTip)),
        stroke(polyD([p.notchTopA, p.wingTopTip, p.notchTopB])),
        stroke(lineD(p.bendBottom, p.wingBottomTip)),
        stroke(polyD([p.notchBottomA, p.wingBottomTip, p.notchBottomB])),
      ];
    },
    handles(p: Params): EngineHandle[] {
      return ['topOuter', 'bendTop', 'bendBottom', 'bottomOuter', 'wingTopTip', 'wingBottomTip', 'notchTopA', 'notchTopB', 'notchBottomA', 'notchBottomB']
        .map((k) => hPoint(k, p));
    },
    unitAnchor: 'center', meta: { sidcTaskId: "support-by-fire-position" },
  };
