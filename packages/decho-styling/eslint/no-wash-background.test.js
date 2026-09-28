/**
 * `no-wash-background`, tested against the shapes the estate actually writes.
 *
 * The bug this rule exists for was not exotic: a style object with a ternary in
 * it, which is how every selected-row background in every one of these widgets
 * is written.
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noWashBackground } from "./no-wash-background.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-wash-background", () => {
  it("accepts opaque backgrounds and washes used for anything else", () => {
    tester.run("no-wash-background", noWashBackground, {
      valid: [
        // The fix, since 1.3.1: the token, which is a custom property and so
        // follows the mode.
        "const s = { background: theme.color.accentTint };",
        "const s = { background: selected ? theme.color.accentTint : theme.color.surface };",
        // The fix as it was written before, still correct.
        "const s = { background: tint.accent };",
        "const s = { background: tintsFor(theme).accent };",
        // Opaque tokens.
        "const s = { background: theme.color.surface };",
        "const s = { backgroundColor: theme.color.surfaceRaised };",
        // A wash is fine anywhere that is not a background: borders, stripes,
        // shadows and gradients all sit on something already painted.
        "const s = { borderColor: theme.color.accentSoft };",
        "const s = { boxShadow: `0 0 0 2px ${theme.color.accentSoft}` };",
        "const s = { borderLeft: `3px solid ${theme.color.warningSoft}` };",
        // Not our tokens.
        "const s = { background: props.soft };",
        // Opaque composites are the fix, and must not be flagged.
        "const s = { background: over(theme.color.accentSoft, theme.color.surface) };",
        "const s = { background: \"rgba(161, 0, 255, 1)\" };",
        "const s = { background: \"rgb(246, 230, 255)\" };",
        // A translucent value anywhere but a background is fine.
        "const s = { boxShadow: `0 0 0 2px ${alpha(theme.color.accent, 0.3)}` };",
        "const s = { borderColor: alpha(theme.color.accent, 0.4) };",
      ],
      invalid: [],
    });
  });

  it("rejects a wash as a background, including inside a ternary", () => {
    tester.run("no-wash-background", noWashBackground, {
      valid: [],
      invalid: [
        {
          code: "const s = { background: theme.color.accentSoft };",
          errors: [{ messageId: "wash" }],
        },
        {
          code: "const s = { backgroundColor: theme.color.warningSoft };",
          errors: [{ messageId: "wash" }],
        },
        // The shape that actually shipped: selected rows and cards.
        {
          code: "const s = { background: selected ? theme.color.accentSoft : theme.color.surface };",
          errors: [{ messageId: "wash" }],
        },
        // Both arms wrong is two reports, because both are wrong.
        {
          code: "const s = { background: a ? theme.color.successSoft : theme.color.dangerSoft };",
          errors: [{ messageId: "wash" }, { messageId: "wash" }],
        },
        // Imperative style assignment.
        {
          code: "element.style.background = theme.color.neutralSoft;",
          errors: [{ messageId: "wash" }],
        },
        // Inside a template, which is how a shorthand gets written.
        {
          code: "const s = { background: `${theme.color.infoSoft}` };",
          errors: [{ messageId: "wash" }],
        },
        // The name of the token set does not matter, only the token.
        {
          code: "const s = { background: tokens.color.dangerSoft };",
          errors: [{ messageId: "wash" }],
        },
        // The same defect spelled as a function call. This is the one the
        // first version of the rule missed, and it shipped: two rule tables
        // painted their selected row with alpha(accent, 0.08) over a page the
        // host owns.
        {
          code: "const s = { background: alpha(theme.color.accent, 0.08) };",
          errors: [{ messageId: "translucent" }],
        },
        {
          code: "const s = { backgroundColor: selected ? alpha(theme.color.accent, 0.08) : theme.color.surface };",
          errors: [{ messageId: "translucent" }],
        },
        // And as a literal.
        {
          code: "const s = { background: \"rgba(161, 0, 255, 0.1)\" };",
          errors: [{ messageId: "translucent" }],
        },
        {
          code: "const s = { background: \"hsla(280, 100%, 50%, 0.2)\" };",
          errors: [{ messageId: "translucent" }],
        },
      ],
    });
  });
});
