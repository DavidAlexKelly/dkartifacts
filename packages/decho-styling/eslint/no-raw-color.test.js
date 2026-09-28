/**
 * The lint rule, under ESLint's own RuleTester.
 *
 * A rule shipped without this is a rule that quietly reports nothing: the
 * failure mode is silence, and silence looks exactly like a clean codebase.
 * The escape hatches matter as much as the reports — a rule that cannot be
 * escaped where colour genuinely must be a literal is a rule teams disable
 * wholesale, and then it protects nothing at all.
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noRawColor } from "./index.js";

// RuleTester reaches for global describe/it; vitest does not install globals
// here, so hand them over explicitly.
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-raw-color", noRawColor, {
  valid: [
    // The point of the rule: tokens are fine.
    { code: 'const c = "var(--decho-color-accent)";' },
    { code: 'const c = tokensFor("modern").color.accent;' },
    // Not colours.
    { code: 'const id = "#heading";' },
    { code: 'const s = "hello world";' },
    // Explicitly allowed values — a brand colour that is legitimately fixed.
    {
      code: 'const brand = "#c8102e";',
      options: [{ allow: ["#C8102E"] }],
    },
    // Files that talk to a renderer.
    {
      code: 'map.setPaintProperty("l", "circle-color", "#4a7c59");',
      filename: "src/map/layers.ts",
      options: [{ allowIn: ["**/map/**"] }],
    },
    // Functional notation, when a project has decided to allow it.
    {
      code: 'const c = "rgba(108, 92, 231, 0.2)";',
      options: [{ allowFunctional: true }],
    },
  ],

  invalid: [
    {
      code: 'const c = "#6c5ce7";',
      errors: [{ messageId: "rawColor" }],
    },
    {
      code: 'const c = "#fff";',
      errors: [{ messageId: "rawColor" }],
    },
    {
      // Eight digits: a hex with alpha is still a hard-coded colour.
      code: 'const c = "#6c5ce733";',
      errors: [{ messageId: "rawColor" }],
    },
    {
      code: 'const style = { color: "#e9ecfb" };',
      errors: [{ messageId: "rawColor" }],
    },
    {
      // A template literal with no expressions reads as a plain string to a
      // human, so it should to the linter too.
      code: "const c = `#6c5ce7`;",
      errors: [{ messageId: "rawColor" }],
    },
    {
      code: 'const c = "rgb(108, 92, 231)";',
      errors: [{ messageId: "rawColor" }],
    },
    {
      // allowIn is a path filter, not a blanket switch: a file outside the
      // pattern is still checked.
      code: 'const c = "#4a7c59";',
      filename: "src/panels/Sidebar.tsx",
      options: [{ allowIn: ["**/map/**"] }],
      errors: [{ messageId: "rawColor" }],
    },
  ],
});
