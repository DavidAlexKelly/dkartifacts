# @acc/decho-styling

The shared look, as values: design tokens in seven themes, so that a widget
written in one code repository and a widget written in another are recognisably
the same product.

**Tokens only.** The components that used to be here — card, tag, button,
panel, nav item, the application shell, the charts — are
[`@acc/decho-components`](../decho-components/README.md), and so are the style
recipes. That package does not depend on this one and this one does not depend
on it; see *How the two fit together* below.

This package depends on nothing at all: no React, no DOM, no Foundry. A
transform, a test or a node script generating a report can take it, which is
the point — a design system that can only be released after something else is a
design system nobody upgrades.

Seven themes:

| | |
|---|---|
| **`classic`** | The palette this project already draws with. Flat surfaces, military green. The default: nothing changes appearance because the package was upgraded. |
| **`modern`** | The indigo command-centre look. Translucent glass over a lit background, a gradient hairline catching the top edge of every surface, selection that glows. |
| **`daylight`** | The light theme. Depth from shadow rather than luminance, status colours darkened to stay legible on white. |
| **`command`** | Amber on near-black, 2px corners, opaque surfaces, no blur. The night watch. |
| **`accenture-light`** | The corporate palette: Blue 3 for actions, Violet 3 for AI, Black-at-20% card borders, the fixed RAG scale, the ten-colour brand series for charts. |
| **`accenture-dark`** | The same on Black and Dark Gray 1. Tones lightened where the reference has no dark-legible member; the RAG scale deliberately unchanged. |
| **`accenture-sap`** | Accenture purple on white — the look the SAP migration estate (Ignite, PRISM, FloX) already draws with. `purpleDark` for every action, the brand purple for decoration that holds no text, Zinc greys, 10px cards, 6px controls, a purple-cast shadow. Not `accenture-light`: that is the corporate palette as specified, in blue; this is what one programme built on top of it. |

```tsx
tokensFor("accenture-sap")                             // values
<div className="decho-root decho-accenture-sap">…      // CSS classes
<AppShell tokens={tokensFor("accenture-sap")}>…        // components, from @acc/decho-components
```

```sh
npm install @acc/decho-styling
```

## How the two fit together

The arrow points one way, on purpose: **components depend on tokens, never the
reverse.** Components need colours; colours do not need components, and the
other direction is a cycle whose only escape is a component library carrying
its own palette — the duplication both packages exist to end.

At runtime, though, neither actually imports the other. The components read

```
var(--decho-color-surface, #111318)
```

so a theme reaches them as *values* (`tokens={tokensFor("accenture-sap")}`,
written onto one element as custom properties) or as a *class*
(`tokens.css` plus `decho-accenture-sap`). With neither, their generated
fallbacks apply and they render in `classic`.

That works out exactly rather than approximately because `skinVariables(skin)`
emits only a theme's **deltas from the base set**: an overridden token resolves
to the theme's value, an un-overridden one to the base, which is `tokensFor()`
token for token. `@acc/decho-components` generates its fallbacks from this
package's `tokens.json` and fails its own test if they drift.

## Adopting it in an existing repository

Four steps, three of them one line:

```sh
# 1. Add the Artifacts repository under Libraries → Dependencies (see below),
#    then:
npm install @acc/decho-styling

# 2. Point existing hard-coded colours at tokens. Preview first.
npx decho migrate --dry-run --report
npx decho migrate
```

```ts
// 3. Import the variables, plus the compat layer if this repo grew up on the
//    military palette, plus the Blueprint adapter if it uses Blueprint.
import "@acc/decho-styling/tokens.css";
import "@acc/decho-styling/compat/military.css";
import "@acc/decho-styling/blueprint.css";
```

```html
<!-- 4. Choose a theme, once, on your root element. -->
<html class="decho-root decho-modern">
```

**`npx decho migrate` is the part worth understanding.** It rewrites CSS to
`var(--decho-…)`, but rewrites TypeScript *only* inside `style={{ }}` and
`CSSProperties` objects — because MapLibre paint properties, deck.gl accessors,
canvas fills and milsymbol options take colour values and render **nothing**
when handed a CSS variable, without throwing. Everything it declines to touch
is listed by `--report`, so the remainder is a work list rather than a mystery.

**`compat/military.css`** maps the legacy names (`--bg-panel`,
`--accent-primary`, `--text-primary`, `--shadow-card`, …) onto tokens, so
existing `var()` call sites keep working *and* start following the theme. Two
estates hand-wrote that layer before it was shipped here; you should not write
a third.

## Tooling

```sh
npx decho check       # the four mistakes that render as "the widget is black"
npx decho doctor      # why isn't it working?
npx decho css         # generate the theme's CSS
npx decho migrate     # point existing hard-coded colours at tokens
```

**`decho css` is the one to wire into a build.** Pasting the output of
`accentVariables()` into a stylesheet — and separately calling `withAccent()`
in a theme module — is two halves of one decision kept in step by hand, which
is the drift this package exists to remove. Generate instead:

```jsonc
// package.json
"scripts": {
  "prebuild": "decho css --theme modern --accent \"#2fbf71\" --out src/styles/decho-theme.css"
}
```

**`decho doctor` is the one to run when install goes wrong.** The three
failures every adoption hits — `404`, `403`, and a stale packument that
installs an old version — all produce errors that name something other than the
cause. It checks the package is declared, installed, that the installed copy
matches what `package.json` asks for, and that a theme is selected somewhere,
then prints the command that fixes it.

## Keeping colour out of the code

```js
// eslint.config.mjs
import decho from "@acc/decho-styling/eslint";
export default [...decho.configs.recommended];
```

`no-raw-color` warns on hard-coded colours, with `allow`, `allowIn` and
per-line disables for paint values that genuinely cannot be tokens. It ships as
a warning because a repo adopting this has a thousand on day one; turn it up to
`decho.configs.strict` once the codemod has been through.

## Using it from another code repository

It publishes to the Foundry Artifacts npm repository
`ri.artifacts.main.repository.b39ad0fb-63f7-4297-9d23-d029564ce937`, so a
consuming repo needs that registry configured for the `@acc` scope:

```
@acc:registry=https://accenture.palantirfoundry.com/artifacts/api/repositories/ri.artifacts.main.repository.b39ad0fb-63f7-4297-9d23-d029564ce937/contents/release/npm/
```

> **Note:** this is a *different* repository from the other five packages here,
> which publish to `ri.artifacts.main.repository.df396b79-*`. A consumer that
> wants this package and, say, `@acc/decho-basemap` needs both registries — and
> since a scope can only point at one, the second has to be reached with a
> per-package `.npmrc` entry or by publishing one of them to both.

In a **custom widget set** repo, that is the whole integration: import the
components, or the recipes, and go. There is no stylesheet to add to a build,
no font to fetch — a widget's CSP would block it anyway — and nothing written
to `:root`, so the widget beside yours in the Workshop module is unaffected.

It depends on nothing. Not on the byte layer, not on the basemap, not on
Foundry, and not — unless you import `/react` — on React. That is deliberate:
a design system that can only be released after something else is a design
system nobody upgrades.

## Inside a Foundry custom widget — read this one

The CSS class is **not** how you select a theme in a widget, and getting this
wrong does not look like an error.

`@osdk/cli widgetset deploy` ships your built assets; the host provides the
document. A `class="decho-root decho-accenture-sap"` written into your
`index.html` never reaches the browser. And because `tokens.css` declares the
base set on `:root`, every `var(--decho-…)` then resolves against the **base
theme** — which is `classic`, which is **dark**. So the widget renders with
near-black scrollbars, navy cards and light text on white, and nothing in your
build says a word about it. Five widget sets shipped exactly that.

Apply the theme from JavaScript instead, before the first render:

```ts
// src/main.tsx — every entry point, once
import { applyTheme, assertThemeApplied } from "@acc/decho-styling";

applyTheme("accenture-sap");                        // or { mode: "auto" }
if (import.meta.env.DEV) assertThemeApplied("accenture-sap");

ReactDOM.createRoot(document.getElementById("root")!).render(<Widget />);
```

`applyTheme` writes **every** variable onto `document.documentElement` — not
just the theme's deltas, which is the difference that matters — adds the
classes for anything class-based, paints the page, and sets `color-scheme` so
the native scrollbars and form controls follow. It returns an undo, for a React
effect. `assertThemeApplied` warns in the console if what is live is not what
you asked for, which is the check nobody thought to run.

Three more widget rules, learned the same way:

- **Never use a `*Soft` token as a background.** They are translucent washes;
  over an unpainted page they take the host's colour. Use the opaque tint
  token: `theme.color.accentTint` / `var(--decho-color-accent-tint)`.
- **Do not import the token set as `t`.** Every `items.map((t) => …)` in the
  file shadows it, `t.color.surface` becomes `undefined`, React drops the
  declaration and the element paints nothing. Call it `theme`.
- **Run `npx decho check`** in the build. It catches all three, plus an entry
  point that forgot `applyTheme`.

## Opaque tints, and when a token is a wash

Each tone has two forms, and mixing them up is the commonest way to end up with
a black card:

| | |
|---|---|
| `theme.color.accentSoft` | A **wash** — `rgba(161, 0, 255, 0.1)`. Correct *over a surface you painted*: a tag tint inside a card, a stripe, a border. |
| `theme.color.accentTint` | The **opaque composite** of that wash over the theme's surface. Correct as a background, anywhere, including when you do not know what is behind. |

```ts
// Since 1.3.1: a token, so a CSS custom property, so it follows the mode.
<tr style={{ background: selected ? theme.color.accentTint : theme.color.surface }}>

/* …and in a stylesheet */
.row--selected { background: var(--decho-color-accent-tint); }
```

Six of them — `accentTint`, `infoTint`, `successTint`, `warningTint`,
`dangerTint`, `neutralTint` — one per tone that has a wash.

They are **derived, never declared**: the package composites each wash over
that theme-*and-mode*'s `surface`, so no theme can get one wrong and none has
to be kept in step by hand. Reading the token rather than a value is what makes
a selection follow the mode; a tint read into a variable at import time does
not, which is why 1.3.0's dark modes painted chalky light-purple rows.

`tintsFor()` is still there, for the cases where a value is genuinely what you
need — an SVG presentation attribute, a canvas, a tint over something other
than the surface:

```ts
import { tintsFor, over } from "@acc/decho-styling";

tintsFor("accenture-sap", "dark").accent;                              // the dark tint
tintsFor("accenture-sap", { over: theme.color.surfaceRaised }).accent;  // on a raised card

over("rgba(161, 0, 255, 0.1)", "#ffffff");   // rgb(246, 230, 255)  — intended
over("rgba(161, 0, 255, 0.1)", "#0a0c0f");   // rgb(25, 11, 39)     — what shipped
```

## Which token for which thing

The token names describe colours; this table describes *jobs*. It is the set of
decisions made while migrating five widget sets, written down so the next
person does not re-derive them.

| On screen | Token |
|---|---|
| Page behind everything | `color.bg` |
| Card, panel, table body | `color.surface` |
| Table header, row stripe, ghost-button hover | `color.surfaceRaised` |
| Panel floating over a map | `color.surfaceOverlay` + `effect.blur` |
| Rule between rows, card border | `color.borderSubtle` |
| Control border (button, input) | `color.border` |
| Hovered or active edge | `color.borderStrong` |
| Primary button fill, link, focus ring | `color.accent` |
| Its hover | `color.accentHover` |
| Selected row or card | `color.accentTint` |
| Tag or chip background, status track | `color.infoTint` / `successTint` / `warningTint` / `dangerTint` / `neutralTint` |
| Tag tint inside a painted card | `color.accentSoft` |
| Body text · secondary · disabled | `color.text` · `textMuted` · `textFaint` |
| Text on the accent | `color.onAccent` |
| Tag or chip foreground | `color.success` / `warning` / `danger` / `info` |
| RAG state in a heatmap, bar or badge | `status.*` — never the tones |
| Chart series | `chart.series1…10`, via `chartSeries(i)` |
| AI-invoking affordance | `color.ai` |

Two rules behind the table: a **tone** answers "how should this look", a
**status** answers "what state is this in" — and `status` is deliberately
identical across the light and dark Accenture themes so a heatmap screenshots
the same in both.

## Skins

A skin is not a palette. `modern` also changes the gradients, the blur, the
radii and what a shadow is *for* — selection there is a coloured glow, not a
darker drop — which is why skins live in `tokens.ts` beside the values rather
than in the theming helpers.

The interesting part is that adding one added **no rules**. There is no
`.decho-modern .decho-card` anywhere in the stylesheet and no
`if (skin === "modern")` anywhere in the recipes. Both skins go through one
declaration:

```css
background-color: var(--decho-color-surface);
background-image: var(--decho-gradient-hairline), var(--decho-gradient-surface);
background-size: 100% 1px, auto;
background-position: top left, center;
```

`classic` sets both gradients to `none` — `background-image: none, none` is
valid and paints nothing — so it gets the flat surface it always had, while
`modern` gets its lit wash and the 1px gradient hairline along its top edge from
the very same rule. The hairline is a background layer rather than a border or
a `::before` for two reasons: a border cannot fade out at both ends, and inline
styles have no pseudo-elements, so this is the only way the two deliveries can
paint it identically.

The same trick carries the rest: the status-dot halo is `0 0 8px currentColor`
in modern and `none` in classic; the app background is a pair of radial
gradients in modern and `none` in classic.

**Modern surfaces are translucent**, which is the one thing to remember when
using it: they need something behind them. `<DechoSurface filled>` or
`.decho-root--filled` paints it. Without that, the glass has nothing to be
glass against and the cards look grey.

Adding a theme means adding an entry to `SKIN_OVERRIDES` and regenerating the
stylesheet:

```sh
npm run build && node scripts/gen-tokens-css.mjs
```

`src/css/tokens.css` is generated from `src/core/tokens.ts` — seven themes is
well over 400 declarations, and transcribing those by hand to satisfy the drift
test is precisely the work that should not be done by hand. Edit the
TypeScript, run the script, commit both; the test fails if you forget.

## Tokens

`src/core/tokens.ts` is the source of truth; `src/css/tokens.css` is the same
values as custom properties, named mechanically:

```
color.surfaceRaised   →  --decho-color-surface-raised
fontSize.md           →  --decho-font-size-md
space[4]              →  --decho-space-4
```

The palette is not new. It is the greys, the military green and the translucent
over-map surface this project was already drawing with in three separate
places — `src/mil/theme.ts`, the basemap's `SurfaceTheme` and the app shell —
each with its own copy. This package is where the copying stops.

Font stacks are **system fonts only**. A custom widget runs under a restrictive,
non-configurable CSP: a webfont `@import` is blocked and the browser silently
falls back. Typography that depends on a request the runtime forbids is not
typography you have.

### Six tones, no colour prop

`neutral · accent · info · success · warning · danger`, on tags, card stripes
and dots. A closed set, because "danger is the same red in every widget" is the
entire proposition, and an open colour prop is how that quietly stops being
true.

### Changing the primary colour

The common request: "modern, but our green". One prop.

```tsx
<AppShell skin="modern" accent="#2fbf71">…</AppShell>
<DechoSurface skin="modern" accent="#2fbf71">…</DechoSurface>

// or as values
withAccent("modern", "#2fbf71")           // a full token set
accentVariables("modern", "#2fbf71")      // just the CSS variables that move
defineTheme({ name: "acme", extends: "modern", accent: "#2fbf71" })
```

**What follows the accent:** hovers, focus rings, the selection glow, the
primary button's gradient, the strong border, links, and `modern`'s hairline.

**What does not:** surfaces, text, geometry, the RAG scale, the chart series,
and `ai` — AI features keep their own colour on purpose. The other hues a theme
deliberately mixes in survive too, so modern's hairline still fades indigo →
teal rather than flattening into one colour.

This is deliberately more than `themeVariables({ accent })`, which sets one
token. An accent is never one value — in `modern` it appears as three hex
shades in a gradient and as `rgba(108, 92, 231, …)` in three shadows — so
setting `color.accent` alone turns the buttons green and leaves the glow purple.
`ACCENT_TOKENS` is exported if you want to see exactly which tokens a re-tint
moves.

Button text is recomputed rather than re-tinted: `accent="#c3e352"` gets dark
text, `accent="#1e3a8a"` gets white. Keeping white on a light accent is the
commonest mistake in a brand swap, so the package makes it rather than you.

### Your own theme

A project defines its own without a change to this package — which matters when
there are dozens of client brands and one maintainer:

```tsx
import { defineTheme } from "@acc/decho-styling";

export const acme = defineTheme({
  name: "acme",
  extends: "daylight",
  tokens: { color: { accent: "#c8102e" } },
});

// CSS delivery: inject once, then select it like any built-in theme.
<style>{acme.css}</style>
<div className="decho-root decho-acme">…</div>

// Or with no stylesheet at all:
<DechoSurface style={acme.style} tokens={acme.tokens}>…</DechoSurface>
```

`tokens` is how a custom theme reaches the inline recipes: the CSS layer
inherits a custom property, a literal cannot.

### Selecting a theme

Class or data attribute, interchangeably:

```html
<div class="decho-root decho-command">
<div class="decho-root" data-decho-theme="command">
```

`classic` has a block of its own (`decho-classic`), so every theme selects the
same way and a classic subtree can sit inside a themed app.

### Overriding

Scoped to a subtree, never to `:root` — a widget shares its page with widgets
it does not own, and a package that writes to `:root` restyles its neighbours.

```tsx
import { themeVariables } from "@acc/decho-styling";
import { Card } from "@acc/decho-components";

// Everything below picks the override up: the CSS classes because a custom
// property inherits, and the components because every value they emit is a
// var() reference to the same name.
<div className="decho-root" style={themeVariables({ accent: "#b8862f" })}>
  <Card title="Amber deployment" />
</div>;
```

`withTheme()` is still here for the case that cannot inherit — a portal, or a
component handed a `palette` directly.

Colours only. Spacing, radii and type are what make two widgets look like one
product; the accent is what makes a deployment look like a customer's.

## Light and dark: one theme, two modes

A theme is a palette; a **mode** is which end of it.

```ts
tokensFor("accenture-sap")                      // its default mode (light)
tokensFor("accenture-sap", "dark")
applyTheme("accenture-sap", { mode: "dark" })
applyTheme("accenture-sap", { mode: "auto" })   // follows prefers-color-scheme,
                                                // and keeps following it
```

**Your template's hook is the supported signal**, not something to delete:

```ts
const dark = useDarkTheme();                    // generated by the widget template
useEffect(
  () => applyTheme("accenture-sap", { mode: dark ? "dark" : "light" }),
  [dark],
);
```

or let the package do it, with no React at all — `applyTheme(theme, { mode: "auto" })`
subscribes to the media query and the returned undo unsubscribes. There is also
`prefersDarkMode()` and `onColorSchemeChange(cb)` if you want the signal without
the theming.

### What a mode is not

An inversion. Three things are deliberate, and each is a test:

- **The RAG scale does not move.** `status.*` is identical in both modes, so a
  heatmap screenshots the same either way.
- **Tones are lightened, not reused.** `#0f6e3d` passes on white and fails on
  near-black, so the dark mode declares its own — and the contrast suite runs
  over every theme × mode, which is what stops a dark mode shipping unreadable.
- **The chart *series* do not move, but the axis and grid do.** Ten brand
  colours are a brand decision; an axis is a hairline drawn on the page, so it
  follows the page.

### Which themes have two modes

| Theme | Modes |
|---|---|
| `accenture-sap` | light *(default)*, dark |
| `accenture-standard` | light *(default)*, dark — **the name to use** for the corporate palette |
| `accenture-light` | light *(default)*, dark — deprecated alias of `accenture-standard` |
| `accenture-dark` | dark — deprecated; it is `accenture-standard` in dark mode |
| `classic`, `modern`, `command` | dark |
| `daylight` | light |

`modesFor(theme)` and `defaultModeFor(theme)` answer this at runtime, and
`tokensFor("command", "light")` **throws** rather than inventing one: a light
`command` is a different design, not a mode. Use `defineTheme()` if you want it.

In CSS the dark mode is two classes — `.decho-accenture-sap.decho-dark` — so
the cascade does the work (0,2,0 beats the theme block's 0,1,0) and nothing
depends on source order. `mode: "auto"` is JavaScript only, deliberately: in a
widget the JS path is the one guaranteed to arrive, because the host provides
the document.

## Status and charts

Two token groups that are not the six tones, because they answer different
questions:

- **`status`** — the seven RAG states (`critical`, `high`, `atRisk`, `onTrack`,
  `complete`, `notAssessed`, `noData`). A tone answers "how should this tag
  look"; a status answers "what state is this item in", and that has to be
  stable across every heatmap in the estate. `notAssessed` is deliberately not
  red: "nobody has looked at this" and "this has breached" are different facts.
- **`chart`** — ten series colours in order, plus an axis and a grid colour.
  `chartSeries(i)` wraps, so an eleventh series repeats rather than rendering
  invisibly.

Both groups are read by the charts in `@acc/decho-components` — `Sparkline`,
`BarChart`, `DonutChart`, `ChartLegend`, `StatusHeatmap` — and by anything that
cannot read a CSS variable at all, which is the case worth remembering: a
MapLibre paint property, a deck.gl accessor, a canvas fill or a milsymbol
option needs a literal. `tokensFor(theme).chart.series1` is that literal;
`var(--decho-chart-series1, …)` handed to any of them renders nothing, and
does so silently.

## Entry points

| Entry point | Contents |
|---|---|
| `@acc/decho-styling` | `DECHO_TOKENS`, `SKIN_OVERRIDES`, `tokensFor`, `skinVariables`, `tokenVariables`, `tokenVariableName`, `themeVariables`, `withTheme`, `withAccent`, `accentVariables`, `ACCENT_TOKENS`, `defineTheme`, `statusColor`, `chartSeries`, `toneColors`, and the colour maths: `parseColor` `hue` `luminance` `shade` `toHex` `readableOn` `contrastRatio` |
| `@acc/decho-styling/tokens.css` | The custom properties, all seven themes |
| `@acc/decho-styling/blueprint.css` | Blueprint 5 wearing the tokens. Import after Blueprint's own CSS |
| `@acc/decho-styling/compat/military.css` | Legacy variable names aliased onto the tokens |
| `@acc/decho-styling/tokens.json` | Every theme's resolved tokens, as data, for Figma / Style Dictionary |
| `@acc/decho-styling/eslint` | `no-raw-color` and `no-wash-background`, with their configs |
| `npx decho` | `css`, `doctor`, `migrate` |

The components, the recipes and their class stylesheet are
`@acc/decho-components`.

## Package notes

Why the manifest and build are the way they are.

- **`src/` is shipped** in the tarball, for the source maps (they point at `../src/*`) and because the CSS and JSON entry points *are* `src` files: tsc copies no assets, and adding a bundler to a package whose whole job is not to need one would be a poor trade.
- **Build:** `npm run build` is `tsc -b tsconfig.build.json`. It references nothing in this repo, on purpose: a design system that has to be released after the byte layer is a design system nobody upgrades. The build info file is written into `dist/` (so deleting `dist` always forces a rebuild) and excluded from the tarball.
- **React is an optional peer** (`^18.0.0 || ^19.0.0`, the same range as every package here). The entry point is tokens and style objects with no runtime dependency at all; a non-React widget, a test or a node script can use it.
- **Registry:** this package and `@acc/decho-components` publish to a different Artifacts repository (`ri.artifacts.main.repository.b39ad0fb-…`) from the map packages (`…df396b79-…`), because they are meant for widget repositories across the estate, not only map consumers. A consumer that also wants a map package needs both repositories configured as backing repositories of its Libraries panel.

## Tests

`npm test` from this directory, or from the repo root with everything else.

The test that matters is `src/core/tokens.test.ts`, and it is not checking that
the colours are nice. Saying the same thing twice is the design; drifting is the
failure mode, so the drift is what is tested:

- every base token is declared on `:root` with an identical value, and nothing
  else is;
- the `.decho-modern` block matches `SKIN_OVERRIDES.modern` **exactly** — a
  missing override means the skin silently inherits a flat classic surface, an
  extra one means the stylesheet is modern in a way the recipes are not;
- a skin only overrides tokens that exist in the base set, so `tokensFor()`
  cannot produce a key the CSS has no default for;
- classic's decoration tokens are all still `none`, which is what lets one rule
  serve both skins;
- the selectors are still only the four expected ones, so the stylesheet stays
  safe to import into a page you do not own.

## Harness

`/styling` in this repo's example app renders the whole surface — every tone,
variant and state, the class-based versions beside the component versions, and
a switch between the two skins at the top. Two things become visible there that
no test can see: a difference between the deliveries, and anything that fails to
change when the skin does, which is always a hard-coded value somewhere.

It opens on `modern`, and leads with a mission-control layout — navigation rail,
status card, agent tiles, trace lines — assembled only from `NavItem`, `Card`,
`Tag`, `Panel` and `Button`, because a design system that needs bespoke markup
to reproduce its own reference design has not finished.
