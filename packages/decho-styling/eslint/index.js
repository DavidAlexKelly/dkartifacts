/**
 * @acc/decho-styling/eslint — keep colour out of the code.
 *
 *     // eslint.config.mjs
 *     import decho from "@acc/decho-styling/eslint";
 *
 *     export default [
 *       ...decho.configs.recommended,   // warns on raw colours, errors on washes
 *     ];
 *
 * WHY A LINT RULE AND NOT A CONVENTION
 * ------------------------------------
 * A design system holds only where drift is prevented by a machine. Three
 * adoptions in this org each began with roughly a thousand hard-coded hexes
 * that nobody had decided to write — they accumulated one deadline at a time,
 * each one locally reasonable. A convention does not survive that; a failing
 * check does.
 *
 * THE ESCAPE HATCH IS THE POINT
 * -----------------------------
 * Some colour genuinely cannot be a token. MapLibre paint properties, canvas
 * fillStyles, deck.gl accessors and milsymbol options take colour values and
 * silently render nothing when handed a CSS variable. A rule that forbids
 * those is a rule teams disable wholesale — so this one ships three ways out,
 * in increasing order of bluntness:
 *
 *   1. `allow: ["#ff0000"]`         — colours that are legitimately fixed
 *   2. `allowIn: ["**\/map/**"]`     — files that talk to a renderer
 *   3. `// eslint-disable-next-line decho/no-raw-color -- MapLibre paint`
 *
 * The third is preferred at a call site, because the comment records WHY, and
 * that reason is the thing the next person needs.
 */

const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNCTIONAL = /^(?:rgb|rgba|hsl|hsla)\(/i;

/**
 * Cheap glob: only `**` and `*`, which is all these patterns ever need.
 *
 * Hand-rolled rather than compiled to a RegExp. Building a regular expression
 * out of a config value is a ReDoS waiting to happen — a pattern like
 * `**\/*a*a*a*a*b` backtracks catastrophically — and a linter that can be
 * hung by its own configuration is a bad trade for six lines saved.
 */
function matchSegment(pattern, segment) {
  let p = 0;
  let s = 0;
  let star = -1;
  let mark = 0;
  while (s < segment.length) {
    if (p < pattern.length && pattern[p] === segment[s]) {
      p++;
      s++;
    } else if (p < pattern.length && pattern[p] === "*") {
      star = p++;
      mark = s;
    } else if (star >= 0) {
      p = star + 1;
      s = ++mark;
    } else {
      return false;
    }
  }
  while (p < pattern.length && pattern[p] === "*") p++;
  return p === pattern.length;
}

function matchFrom(patternParts, i, fileParts, j) {
  if (i === patternParts.length) return j === fileParts.length;
  if (patternParts[i] === "**") {
    for (let k = j; k <= fileParts.length; k++) {
      if (matchFrom(patternParts, i + 1, fileParts, k)) return true;
    }
    return false;
  }
  if (j >= fileParts.length) return false;
  if (!matchSegment(patternParts[i], fileParts[j])) return false;
  return matchFrom(patternParts, i + 1, fileParts, j + 1);
}

function matches(pattern, filename) {
  return matchFrom(pattern.split("/"), 0, filename.replace(/\\/g, "/").split("/"), 0);
}

const noRawColor = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Use design tokens instead of hard-coded colours, so the code follows the theme.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: { type: "array", items: { type: "string" } },
          allowIn: { type: "array", items: { type: "string" } },
          allowFunctional: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawColor:
        'Hard-coded colour "{{value}}". Use a token — var(--decho-…) in CSS-facing code, or tokensFor(theme) where a literal is required. If this is map, canvas or symbol paint, disable this line with a comment saying so.',
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const allow = new Set((options.allow ?? []).map((c) => c.toLowerCase()));
    const allowIn = options.allowIn ?? [];
    const allowFunctional = options.allowFunctional ?? false;
    const filename = context.filename ?? context.getFilename();

    if (allowIn.some((pattern) => matches(pattern, filename))) {
      return {};
    }

    function check(node, raw) {
      const value = String(raw).trim();
      const isColour = HEX.test(value) || (!allowFunctional && FUNCTIONAL.test(value));
      if (!isColour) return;
      if (allow.has(value.toLowerCase())) return;
      context.report({ node, messageId: "rawColor", data: { value } });
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      // Template literals with no expressions read as plain strings to a human,
      // so they should read that way to the linter too.
      TemplateLiteral(node) {
        if (node.expressions.length === 0 && node.quasis.length === 1) {
          check(node, node.quasis[0].value.cooked ?? "");
        }
      },
    };
  },
};

import { noWashBackground } from "./no-wash-background.js";

const plugin = {
  meta: { name: "@acc/decho-styling/eslint" },
  rules: {
    "no-raw-color": noRawColor,
    "no-wash-background": noWashBackground,
  },
};

plugin.configs = {
  /**
   * Warnings, not errors, on purpose: a repo adopting this has a thousand of
   * them on day one, and a rule that makes the build red before the migration
   * runs is a rule that gets deleted. Turn it up to "error" once `decho
   * migrate` has been through.
   */
  recommended: [
    {
      files: ["**/*.{ts,tsx,js,jsx}"],
      plugins: { decho: plugin },
      rules: {
        "decho/no-raw-color": "warn",
        // An error even in the gentle config, unlike no-raw-color: a hex
        // literal is debt you can pay down later, and a translucent background
        // is an element that renders in the host's colour today.
        "decho/no-wash-background": "error",
      },
    },
  ],
  strict: [
    {
      files: ["**/*.{ts,tsx,js,jsx}"],
      plugins: { decho: plugin },
      rules: {
        "decho/no-raw-color": "error",
        "decho/no-wash-background": "error",
      },
    },
  ],
};

export default plugin;
export { noRawColor, noWashBackground };
