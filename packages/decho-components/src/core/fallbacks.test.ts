/**
 * The seam between this package and @acc/decho-styling, tested.
 *
 * There is no import of that package in `src/` — that is the point of the
 * design — which means the agreement between the two is unenforced by the
 * compiler and has to be enforced here instead. This is the same bargain the
 * styling package makes with its own generated stylesheet: saying the same
 * thing twice is the design, drifting is the failure mode, so the drift is
 * what is tested.
 *
 * What would break without these tests:
 *
 *   - A token added to the styling package is invisible here, so a recipe
 *     reaching for it gets `undefined` and React drops the declaration.
 *   - A *value* changed there leaves this package's fallback stale. Nothing
 *     fails: themed pages stay right, un-themed pages quietly keep the old
 *     colour, and the two look different in front of a customer.
 *   - A variable *name* that disagrees is the worst of the three, because
 *     `var(--decho-colour-surface, #111318)` is valid CSS that silently uses
 *     the fallback for ever.
 */

import { describe, expect, it } from "vitest";
import {
  DECHO_TOKENS,
  tokenVariableName as stylingVariableName,
  tokensFor,
} from "@acc/decho-styling";
import { BASE_TOKENS, VAR_TOKENS, tokenVariableName } from "./vars.js";

const classic = tokensFor("classic");

const groups = Object.keys(BASE_TOKENS) as (keyof typeof BASE_TOKENS)[];

const entries = groups.flatMap((group) =>
  Object.keys(BASE_TOKENS[group]).map((key) => ({ group, key })),
);

describe("the generated fallbacks", () => {
  it("cover every group the styling package declares", () => {
    expect(groups.sort()).toEqual(Object.keys(DECHO_TOKENS).sort());
  });

  it.each(groups)("cover every token in %s, and no extras", (group) => {
    const theirs = Object.keys(
      classic[group as keyof typeof classic] as Record<string, string>,
    ).sort();
    expect(Object.keys(BASE_TOKENS[group]).sort()).toEqual(theirs);
  });

  it.each(entries)("match classic's value for $group.$key", ({ group, key }) => {
    const theirs = (classic[group as keyof typeof classic] as Record<string, string>)[key];
    expect((BASE_TOKENS[group] as Record<string, string>)[key]).toBe(theirs);
  });
});

describe("the var() references", () => {
  it.each(entries)(
    "name $group.$key the way the styling package does",
    ({ group, key }) => {
      // Not a re-derivation of the same rule twice: `tokenVariableName` here is
      // this package's own implementation and the imported one is theirs. The
      // generator uses a third copy, which this comparison also covers,
      // because VAR_TOKENS below was produced by it.
      expect(tokenVariableName(group, key)).toBe(stylingVariableName(group as never, key));
    },
  );

  it.each(entries)(
    "wrap $group.$key as var(name, classic value)",
    ({ group, key }) => {
      const name = stylingVariableName(group as never, key);
      const value = (classic[group as keyof typeof classic] as Record<string, string>)[key];
      expect((VAR_TOKENS[group] as Record<string, string>)[key]).toBe(
        `var(${name}, ${value})`,
      );
    },
  );
});

describe("the identity the whole mechanism rests on", () => {
  /**
   * A theme's CSS variables are only its *deltas* from the base set. So for
   * any theme: what an element inside it resolves to == that theme's value if
   * it overrides the token, and the base value otherwise. Which is exactly
   * `tokensFor(theme)`.
   *
   * If this ever fails, the fallbacks are no longer the base set and every
   * un-overridden token in every theme is silently wrong.
   */
  it("classic's values are the fallbacks, so deltas compose", () => {
    for (const group of groups) {
      expect(BASE_TOKENS[group]).toEqual(classic[group as keyof typeof classic]);
    }
  });
});
