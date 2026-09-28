/**
 * `no-wash-background` — do not paint a background with a translucent token.
 *
 * The `*Soft` tokens are washes: `rgba(161, 0, 255, 0.1)` and friends. They are
 * correct over a surface you painted, and wrong as the background of the thing
 * itself, because then what shows through is the page — and in a Foundry widget
 * the page belongs to the host.
 *
 * This is the rule that would have caught a real outage. Migrating five widget
 * sets onto the tokens, every opaque tint (`#faf8ff` selected rows, `#fff3e0`
 * warning chips, `#F0E0FF` progress tracks) was swapped for the matching
 * `*Soft` token. Nothing failed: tsc passed, the build passed, the lint passed,
 * and the cards, rows and progress bars rendered near-black in a dark Workshop
 * module.
 *
 *     background: theme.color.accentSoft      ✗
 *     background: theme.color.accentTint      ✓   the token — follows the mode
 *     background: tintsFor(theme).accent      ✓   the same value, read once
 *     borderColor: theme.color.accentSoft     ✓   not a background
 *
 * Reported as an error rather than a warning, unlike `no-raw-color`: a hex
 * literal is technical debt, and this is a rendering defect.
 */

/**
 * Both of these are set membership rather than patterns.
 *
 * Not style: a regex tested against source text is flagged by the code scanner
 * as a denial-of-service risk, and arguing that an anchored alternation is
 * linear is a worse use of everyone's time than not using one. A Set also says
 * what it means.
 */
const TONES = new Set(["accent", "info", "success", "warning", "danger", "neutral"]);
const BACKGROUND_PROPERTIES = new Set(["background", "backgroundColor"]);

/** `theme.color.accentSoft` → `accent`, and null for anything else. */
function washTone(path) {
  if (path == null) return null;
  const last = path.slice(path.lastIndexOf(".") + 1);
  if (!last.endsWith("Soft")) return null;
  const tone = last.slice(0, -"Soft".length);
  return TONES.has(tone) ? tone : null;
}

/**
 * Functions that return a translucent colour.
 *
 * `alpha(theme.color.accent, 0.08)` is the same defect as a `*Soft` token with
 * a different spelling, and the first version of this rule missed it — which
 * left two rule tables painting their selected row with a translucent purple
 * over a page the host owns. If a repo has its own name for this, add it here.
 */
const ALPHA_FUNCTIONS = new Set(["alpha", "withAlpha", "fade", "transparentize", "rgba", "hsla"]);

/** A literal `rgba(…)`/`hsla(…)` whose alpha is below 1. */
function isTranslucentLiteral(value) {
  if (typeof value !== "string") return false;
  const match = /^\s*(?:rgba|hsla)\(([^)]*)\)\s*$/i.exec(value);
  if (match == null) return false;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 4) return false;
  const alpha = Number.parseFloat(parts[3]);
  return Number.isFinite(alpha) && alpha < 1;
}

/** `background: x ? a : b` — look inside the arms too. */
function* colourExpressions(node) {
  if (node == null) return;
  if (node.type === "ConditionalExpression") {
    yield* colourExpressions(node.consequent);
    yield* colourExpressions(node.alternate);
    return;
  }
  if (node.type === "LogicalExpression") {
    yield* colourExpressions(node.left);
    yield* colourExpressions(node.right);
    return;
  }
  if (node.type === "TemplateLiteral") {
    for (const expression of node.expressions) yield* colourExpressions(expression);
    return;
  }
  yield node;
}

/** The text of a member expression, e.g. `theme.color.accentSoft`. */
function path(node, source) {
  return node.type === "MemberExpression" ? source.getText(node) : null;
}

export const noWashBackground = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow translucent *Soft tokens as a background; use an opaque tint",
      recommended: true,
    },
    messages: {
      translucent:
        "`{{ what }}` is translucent. As a background it shows whatever is behind it — " +
        "in a widget, the host's page, which is how cards and rows came out black. " +
        "Composite it first: over(colour, theme.color.surface), or use a `*Tint` token.",
      wash:
        "`{{ token }}` is a translucent wash. As a background it shows whatever is behind it — " +
        "in a widget, the host's page. Use the opaque tint token: theme.color.{{ tone }}Tint " +
        "(a custom property, so it follows the mode) — or tintsFor(theme).{{ tone }} for a value.",
    },
    schema: [],
  },

  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();

    function check(propertyName, valueNode) {
      if (!BACKGROUND_PROPERTIES.has(propertyName)) return;
      for (const expression of colourExpressions(valueNode)) {
        // 1. A *Soft token.
        const text = path(expression, source);
        const tone = washTone(text);
        if (tone != null) {
          context.report({
            node: expression,
            messageId: "wash",
            data: { token: text, tone },
          });
          continue;
        }

        // 2. A call that produces a translucent colour: alpha(x, 0.08) and
        //    friends. Same defect, different spelling.
        if (
          expression.type === "CallExpression" &&
          expression.callee.type === "Identifier" &&
          ALPHA_FUNCTIONS.has(expression.callee.name)
        ) {
          context.report({
            node: expression,
            messageId: "translucent",
            data: { what: `${expression.callee.name}(…)` },
          });
          continue;
        }

        // 3. A literal rgba()/hsla() with alpha below 1.
        if (
          expression.type === "Literal" &&
          isTranslucentLiteral(expression.value)
        ) {
          context.report({
            node: expression,
            messageId: "translucent",
            data: { what: String(expression.value) },
          });
        }
      }
    }

    return {
      // { background: theme.color.accentSoft }
      Property(node) {
        const name =
          node.key.type === "Identifier"
            ? node.key.name
            : node.key.type === "Literal"
              ? String(node.key.value)
              : null;
        if (name != null) check(name, node.value);
      },

      // element.style.background = theme.color.accentSoft
      AssignmentExpression(node) {
        if (
          node.left.type === "MemberExpression" &&
          node.left.property.type === "Identifier"
        ) {
          check(node.left.property.name, node.right);
        }
      },
    };
  },
};

export default noWashBackground;
