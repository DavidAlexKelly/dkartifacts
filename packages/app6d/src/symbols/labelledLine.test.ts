/**
 * The labelled lines post their designation at BOTH ends, the right way up.
 *
 * spineCoherence.test.ts already proves nothing they draw is left behind when
 * the line is refitted. What it cannot see is the part that makes these
 * symbols usable: two labels, one per end, readable at any bearing. A line
 * running east to west is still read left to right — get that wrong and every
 * phase line drawn right-to-left is upside down on the map.
 */
import { describe, expect, it } from "vitest";

import { P, dist } from "../engine/geometry";
import { getParts, paramsFor } from "../engine/render";
import { APP6D_CATALOG } from "./index";
import type { Pt } from "../engine/geometry";

const lineSymbols = APP6D_CATALOG.list().filter((name) => {
  const p = paramsFor(APP6D_CATALOG, name);
  return Array.isArray(p.spine) && typeof p.label === "string" && p.halfWidth === undefined;
});

const textParts = (name: string, overrides?: Record<string, unknown>) =>
  getParts(APP6D_CATALOG, name, overrides).filter((part) => part.kind === "text") as
    Array<{ text: string; pos: Pt; size: number; rotate: number }>;

describe("labelled lines", () => {
  it("finds the family", () => {
    expect(lineSymbols.length).toBeGreaterThanOrEqual(8);
  });

  for (const name of lineSymbols) {
    const params = paramsFor(APP6D_CATALOG, name);
    const spine = params.spine as Pt[];

    it(`${name} labels both ends`, () => {
      const texts = textParts(name);
      expect(texts).toHaveLength(2);
      const first = spine[0];
      const last = spine[spine.length - 1];
      const reach = (params.labelSize as number) * 2;
      expect(Math.min(...texts.map((t) => dist(t.pos, first)))).toBeLessThan(reach);
      expect(Math.min(...texts.map((t) => dist(t.pos, last)))).toBeLessThan(reach);
    });

    it(`${name} stays readable when the line runs the other way`, () => {
      for (const rotate of textParts(name, { spine: [P(1600, 900), P(400, 900)] }).map((t) => t.rotate)) {
        expect(Math.abs(rotate)).toBeLessThanOrEqual(90);
      }
    });

    it(`${name} draws only the line when the label is cleared`, () => {
      expect(textParts(name, { label: "" })).toHaveLength(0);
    });
  }
});
