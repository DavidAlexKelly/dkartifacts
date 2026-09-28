// Regenerates src/css/tokens.css from src/core/tokens.ts.
//
// The stylesheet is the second of two deliveries of one set of values, and
// tokens.test.ts fails if the two disagree. Transcribing ~350 declarations by
// hand to satisfy that test is exactly the kind of work that should not be
// done by hand, so: build the package, then `node scripts/gen-tokens-css.mjs`.
//
// The prose below is the part a generator cannot write, and is preserved here
// rather than in the output so that regenerating never loses it.
import { writeFileSync } from "node:fs";
import {
  MODE_OVERRIDES,
  SKIN_OVERRIDES,
  modeDeltas,
  skinVariables,
  tokensFor,
  tokenVariables,
} from "../dist/index.js";

const GROUP_HEADINGS = {
  color: "Colour",
  space: "Spacing",
  radius: "Radii",
  font: "Type",
  gradient: `Decoration
     \`none\` here is load-bearing, not a placeholder: every surface is painted
     \`background-image: var(--hairline), var(--wash)\`, and \`none, none\` is valid
     CSS that paints nothing. One rule, two skins, no overrides.`,
  shadow: "Shadows",
  effect: "Effects",
  status: `RAG status — the heatmap scale
     Each cell is one fixed state, never a gradient between two. \`not-assessed\`
     is deliberately not red: "nobody has looked at this" and "this has
     breached" are different facts.`,
  chart: "Chart series, in order, plus the axis and grid",
};

const CLASSIC_DOC = `classic — the default
   Flat surfaces, military green, opaque. These are the same values :root
   carries above; the block exists so that classic selects like every other
   theme, and so a classic subtree can be nested inside a themed app.`;

const SKIN_DOC = {
  modern: `modern — the indigo command-centre skin
   Translucent surfaces over a lit background, a gradient hairline along the top
   edge of each one, and shadows that carry the accent's colour instead of only
   darkness.

   Put --decho-gradient-app on the element that fills the widget (or use
   .decho-root--filled): the surfaces are translucent, and without the light
   behind them the glass has nothing to be glass against.`,
  daylight: `daylight — the light theme
   Not modern with the luminance inverted. On dark, depth comes from a surface
   being lighter than the page; on white there is nowhere lighter to go, so it
   comes from shadow. Status colours are darkened well past their dark-theme
   values, because #35d07a on white is a pastel nobody can read.`,
  command: `command — amber on near-black
   The night-watch theme, and deliberately the least decorated: opaque surfaces,
   no backdrop blur, 2px corners. \`warning\` is deliberately not the accent —
   when amber is the interface, an amber warning is invisible.`,
  "accenture-light": `accenture-light — the corporate palette
   Blue 3 for primary actions and links, Blue 2 for hover, Blue 4 for focus
   rings, Blue 5 for tinted backgrounds, Violet 3 for AI, card borders Black at
   20%. Plain on purpose: no gradients, 2px corners, weightless shadows.`,
  "accenture-dark": `accenture-dark — the corporate palette after dark
   Black, Dark Gray 1 and Dark Gray 3 for the surfaces. Tone colours are
   lightened where the reference has no dark-legible member (Green Shade 2 on
   Black is unreadable); the RAG \`status\` scale is NOT adjusted, because a
   heatmap that reads differently in dark mode is one you cannot screenshot
   into a report.`,
  "accenture-sap": `accenture-sap — Accenture purple on white
   The look the SAP migration estate already draws with: purpleDark #7500c0 for
   every action and link, the brand purple #a100ff for decoration that holds no
   text, Zinc greys, 10px cards and 6px controls. Tones are the estate's chip
   foregrounds — dark enough to read as 10px uppercase on white — and the
   brighter solids sit in the RAG \`status\` scale, behind text rather than as it.

   Not the same as accenture-light. That is the corporate palette as specified,
   in Blue 3; this is what one programme built on top of it, and beside an
   un-migrated widget the difference is immediately visible.`,
};

/** `--decho-color-surface-raised` → `color`; `--decho-font-size-md` → `font`. */
function groupOf(name) {
  return name.replace("--decho-", "").split("-")[0];
}

function renderBlock(selectors, variables, doc, banner) {
  const lines = [];
  if (banner != null) {
    lines.push("/* " + "=".repeat(74));
    lines.push(`   ${doc}`);
    lines.push("   " + "=".repeat(74) + " */");
    lines.push("");
  }
  lines.push(selectors.join(",\n") + " {");

  let group = null;
  for (const [name, value] of Object.entries(variables)) {
    const next = groupOf(name);
    if (next !== group) {
      group = next;
      const heading = GROUP_HEADINGS[group];
      if (heading != null && banner == null) {
        lines.push(`  /* -- ${heading} -- */`);
      } else if (lines[lines.length - 1] !== "") {
        lines.push("");
      }
    }
    lines.push(`  ${name}: ${value};`);
  }
  lines.push("}");
  return lines.join("\n");
}

const header = `/* ${"=".repeat(74)}
   @acc/decho-styling — tokens
   ${"-".repeat(74)}
   GENERATED from src/core/tokens.ts by scripts/gen-tokens-css.mjs.
   Edit the TypeScript, run the script, commit both.

   src/core/tokens.test.ts fails if the two ever disagree — for every theme —
   so this file cannot quietly drift from the values the inline recipes use.

   Declared on :root AND on .decho-root. An application wants the defaults on
   the document; a Foundry custom widget must not write to :root at all, since
   it shares a page with widgets it does not own. Hosts in that position scope
   the class to their own subtree and get the same variables.

   Each theme below declares only what it changes. Add the class (or the data
   attribute) to any element and everything inside it is that theme — nothing
   else in the stylesheet mentions a theme, because the components read these
   variables and nothing else.

       <div class="decho-root decho-modern"> … </div>
       <div class="decho-root" data-decho-skin="accenture-dark"> … </div>
   ${"=".repeat(74)} */
`;

const blocks = [
  header,
  renderBlock([":root", ".decho-root"], tokenVariables("classic")),
  // classic gets a block of its own even though :root already carries those
  // values. Two reasons: every theme then selects the same way, so tooling and
  // documentation have no special case to explain; and a classic subtree can
  // sit inside a modern app, which is impossible if classic is only ever the
  // absence of a class.
  renderBlock(
    [".decho-classic", '[data-decho-theme="classic"]'],
    tokenVariables("classic"),
    CLASSIC_DOC,
    true,
  ),
];

for (const skin of Object.keys(SKIN_OVERRIDES)) {
  blocks.push(
    renderBlock(
      [`.decho-${skin}`, `[data-decho-theme="${skin}"]`],
      skinVariables(skin),
      SKIN_DOC[skin],
      true,
    ),
  );
}

/*
  The dark modes, each a delta on its theme's own block.

  Two classes rather than one (`.decho-accenture-sap.decho-dark`) so the
  cascade does the work: specificity 0,2,0 beats the theme block's 0,1,0, which
  beats the base's. Nothing here needs `!important` and nothing depends on
  source order.

  `mode: "auto"` is deliberately NOT a media query in this file. It is resolved
  in JavaScript by `applyTheme`, which also subscribes to changes — and in a
  Foundry widget the JS path is the only one guaranteed to arrive, because the
  host provides the document.
*/
for (const theme of Object.keys(MODE_OVERRIDES)) {
  blocks.push(
    renderBlock(
      [
        `.decho-${theme}.decho-dark`,
        `[data-decho-theme="${theme}"][data-decho-mode="dark"]`,
      ],
      modeDeltas(theme, "dark"),
      `${theme} — dark mode\n   The same brand, geometry, RAG scale and chart series; a different end of\n   the palette. Applied by applyTheme(theme, { mode: "dark" }) or by adding\n   the decho-dark class.`,
      true,
    ),
  );
}

writeFileSync(new URL("../src/css/tokens.css", import.meta.url), blocks.join("\n\n") + "\n");

// tokens.json — the same values again, for the tools that are not a browser:
// Figma, Style Dictionary, a docs site, a designer diffing two themes. Shipped
// generated rather than hand-kept for the same reason as the CSS.
const themes = { classic: tokensFor("classic") };
for (const skin of Object.keys(SKIN_OVERRIDES)) {
  themes[skin] = tokensFor(skin);
}
// The dark modes under `<theme>:dark`, so a designer diffing the two ends of a
// palette has both, and so Figma can carry them as separate collections.
for (const theme of Object.keys(MODE_OVERRIDES)) {
  themes[`${theme}:dark`] = tokensFor(theme, "dark");
}
writeFileSync(
  new URL("../src/tokens.json", import.meta.url),
  JSON.stringify(
    {
      $comment:
        "GENERATED from src/core/tokens.ts by scripts/gen-tokens-css.mjs. Do not edit.",
      variableNamePattern: "--decho-<group>-<kebab-key>",
      themes,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `tokens.css: base + classic + ${Object.keys(SKIN_OVERRIDES).length} themes; tokens.json written`,
);
