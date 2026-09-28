# Changelog

## Versioning policy

Consumers are other people's repositories, so the contract is stated rather
than assumed. While the version is `0.x`:

- **Patch** — values change within a theme, docs, internal refactors. A colour
  moving a shade is a patch: themes are meant to be tuned.
- **Minor** — new tokens, new themes, new components, new entry points.
  Additive. Upgrading should never change what an existing page looks like,
  with one exception: if a theme you use gains a token that a component starts
  reading, that component may change. Called out in this file when it happens.
- **Breaking** — removing or renaming a token, a CSS class, an entry point or a
  component prop; changing what a theme is *for*. Until `1.0` these land in a
  minor bump, listed under **Breaking** below, with the migration in the same
  entry.

Two rules that hold regardless of version:

1. **`classic` never changes appearance.** It is the palette two estates
   already shipped. Anything that would alter it is a new theme instead.
2. **Nothing changes theme implicitly.** No component, hook or stylesheet
   switches theme on its own; a theme is only ever chosen by the host.

---

## 1.3.1

### Fixed

- **The opaque tints are tokens now, so they follow the mode.** A tint
  (`accentSoft` flattened onto the surface, safe as a background) was computed
  in JavaScript at the moment it was read, against whichever token set the
  caller had. Read once at module scope — which is how `src/theme.ts` in every
  widget repo reads it — that was the *light* surface, so a widget in dark mode
  painted its selected rows, chips and progress tracks a chalky light purple on
  near-black. The 1.3.0 fix to `withAccent` was the same class of bug: values
  resolved against the wrong mode.

  There are now six colour tokens — `accentTint`, `infoTint`, `successTint`,
  `warningTint`, `dangerTint`, `neutralTint` — which means six CSS custom
  properties, which means the cascade answers the question instead:

  ```diff
  - background: selected ? tint.accent : theme.color.surface
  + background: selected ? theme.color.accentTint : theme.color.surface
  ```

  They are **derived, never declared**: the package composites each wash over
  that theme-and-mode's own `surface`. No theme, mode, `defineTheme()` theme or
  `withAccent()` re-tint can hold a wrong one, and there is nothing to keep in
  step by hand.

  Listed as a fix rather than an addition on purpose. The tokens are additive
  and nothing that reads `tintsFor()` has to change — its second argument still
  takes a backdrop, and now takes a mode as well — but the reason they exist is
  a rendering defect, and a patch is what gets picked up without anyone having
  to decide to.

- **`themeDeltas` and `modeDeltas` compare resolved token sets** instead of
  reading the declared overrides. Derived tokens are, by definition, not in
  `SKIN_OVERRIDES`, so the generated theme and dark blocks would have shipped
  without tints — leaving every theme to inherit `classic`'s, and `classic` is
  dark. Two side effects, both improvements: an override that happens to equal
  `classic`'s value no longer emits a redundant declaration, and the
  declarations in `tokens.css` are now grouped in token order.

---

## 1.3.0

### Fixed

- **A re-tint no longer drops the mode.** `withAccent(theme, accent)` resolved
  the theme's *default* mode, so calling it on a widget that was in dark mode
  snapped it back to light — in the harness it looked like the page flashing
  white the moment you picked an accent. Both `withAccent` and
  `accentVariables` now take an optional mode, and omitting it behaves exactly
  as before.

  An accent is a change *to* a theme, not a replacement *for* one; the old
  signature quietly made it the second thing.

### Added

- **`accenture-standard`** — the corporate palette as one theme with two modes,
  which is what `accenture-light` and `accenture-dark` always were.

  ```ts
  tokensFor("accenture-standard")           // was accenture-light
  tokensFor("accenture-standard", "dark")   // was accenture-dark
  ```

  The light palette is one object referenced under both names rather than
  copied, and a test asserts all three resolve to the same two token sets. The
  old names still work and are **deprecated**: they will go at 2.0, by which
  time `decho migrate` can rename them.

---

## 1.2.0

Modes, and the lint rule that should have caught the last defect.

### Added

- **A theme can have two modes.** `tokensFor(theme, "dark")`,
  `applyTheme(theme, { mode })`, `modesFor(theme)`, `defaultModeFor(theme)`,
  `modeDeltas(theme, mode)`, `THEME_MODES`, `MODE_OVERRIDES`, and a
  `.decho-<theme>.decho-dark` block in `tokens.css`.

  `accenture-sap` gains a dark mode. `accenture-light` gains one too — and it
  **is** `accenture-dark`, token for token, asserted by a test — so the pair
  that was two themes is now one theme with two ends, without removing either
  name.

  The point is not the dark palette; it is that everything which is not about
  light and dark stops being written twice. The RAG scale, the ten chart series,
  the radii, the spacing and the type ramp carry over untouched.

- **`mode: "auto"`**, which resolves `prefers-color-scheme` *and subscribes* —
  a laptop that switches at sunset moves the widget with it, and the undo
  returned by `applyTheme` unsubscribes. Plus `prefersDarkMode()` and
  `onColorSchemeChange(cb)` for anyone who wants the signal on its own. All
  vanilla: the root entry point still has no React dependency.

  This is what makes the widget template's generated `useDarkTheme()` hook the
  supported path rather than something to delete. Three repos had invented a
  dark palette in colours from no brand guide; two had the hook deleted by this
  author. Neither is necessary now.

- **`tokens.json` carries the dark modes** under `<theme>:dark`, for Figma and
  for anyone diffing the two ends of a palette.

### Changed

- **`no-wash-background` also catches `alpha(colour, 0.08)`**, any other
  alpha-producing call (`withAlpha`, `fade`, `transparentize`, `rgba`, `hsla`)
  and a literal `rgba()`/`hsla()` below full opacity — in a background position.

  The first version of the rule only knew about `*Soft` tokens, and that gap
  shipped: two rule tables painted their selected row with
  `alpha(theme.color.accent, 0.08)` over a page the host owns, which is the same
  defect in a different spelling. `decho check` gained the same rule.

- **The contrast suite runs over every theme × mode**, not every theme. That is
  what proves a dark mode is legible rather than merely dark, and it caught a
  real omission while this was being written: `accenture-sap`'s dark mode had
  not flipped the chart axis and grid, so they would have been drawn in a
  near-invisible dark hairline on a dark page.

### A note on what a mode is not

An inversion. `tokensFor("command", "light")` throws: `command` is night-watch
amber and `modern` is lit glass, and a light version of either is a different
design. The error says so, and points at `defineTheme()`.

---

## 1.1.0

Everything here comes from one migration: five widget sets moved onto
`accenture-sap`, and shipped broken three times in three different ways. Each
failure was invisible to `tsc`, to eslint and to the build, and each looked
like "the widget is black" rather than like an error. This release is the
package taking responsibility for all three.

### Added

- **`applyTheme(theme, options?)`** — write a theme onto a document from
  JavaScript, and get back an undo.

  The CSS class is not a reliable way to select a theme in a Foundry widget:
  `@osdk/cli widgetset deploy` ships the built assets and the host provides the
  document, so a class in your `index.html` never reaches the browser. The
  result is not "no theme": `tokens.css` declares the base set on `:root`, the
  base set is `classic`, and `classic` is dark — so the widget renders dark.
  `applyTheme` writes **every** variable (not the deltas), adds the classes,
  paints the page and sets `color-scheme`, so it cannot depend on the host's
  markup.

- **`assertThemeApplied(theme)`** — a development check that the theme you
  asked for is the theme in force. Reads `--decho-color-surface` back and warns,
  with the diagnosis, when it finds the base theme instead. This is the check
  that would have turned an afternoon into a console line.

- **`tintsFor(theme)` and `over(wash, backdrop)`** — the opaque composite of
  each soft wash.

  `color.accentSoft` is `rgba(161, 0, 255, 0.1)`: correct over a surface you
  painted, wrong as a background, because then what shows through is the page —
  and in a widget the page belongs to the host. Every opaque tint in the
  migrated widgets (`#faf8ff` selected rows, `#fff3e0` chips, `#F0E0FF` progress
  tracks) had been replaced by the matching wash, and all of them rendered
  near-black. Derived rather than declared, so they are not CSS variables: in a
  stylesheet, paint the surface and let the browser composite.

- **`DECHO_THEMES` and `isTheme()`** — the theme names as data, and a guard for
  a string that came from configuration.

- **`decho check`** — the CLI command for the mistakes nothing else catches:
  token paths that do not resolve, tokens imported as `t` (which every
  `.map((t) => …)` shadows), washes used as backgrounds, and — in a widget-set
  repo — an entry point that mounts React without applying a theme. Exits 1, so
  it can sit in front of a build. Four repos had hand-written a worse version of
  this; now they can delete it.

- **`no-wash-background`** in the ESLint plugin, an error in both configs
  (unlike `no-raw-color`, which warns): a hex literal is debt, a translucent
  background is a defect.

- **Documentation that matches how this is actually used**: a widget chapter
  that says plainly not to rely on the class, a table mapping *things on screen*
  to tokens (row stripe, selected row, control border, RAG state…), and an
  honest section on light/dark — why they are two themes today, what that costs,
  and what `1.2.0` will do about it.

### Changed

- **`tokensFor()` throws on an unknown theme** instead of returning the base
  set. `tokensFor("accenture-SAP")` used to silently hand back `classic`, which
  is dark, so a typo looked like a design decision.

- **`skinVariables` → `themeDeltas`, `tokenVariables` → `allThemeVariables`.**
  The old names were one word apart and the difference is load-bearing: deltas
  are right for the stylesheet, where the base block is already in the cascade,
  and wrong for writing onto an element in a host you do not control. Both old
  names still work and are deprecated, not removed.

- **`allThemeVariables` accepts a resolved token set**, so a custom theme from
  `defineTheme()` or a re-tint from `withAccent()` can be written to an element
  as easily as a built-in one.

Nothing changes appearance: no token moves, no theme is added or altered, and
every existing export still resolves.

---

## 1.0.0

This package is now **design tokens only**. The components moved to
`@acc/decho-components`.

### Breaking

- **`@acc/decho-styling/react` is gone.** Every component — `Card`, `Tag`,
  `Button`, `Panel`, `NavItem`, `DechoSurface`, the `App*` shell, the charts —
  is now `@acc/decho-components`.

- **The recipes are gone**, with the components they style: `cardStyle`,
  `tagStyle`, `buttonStyle`, `panelStyle`, `navItemStyle`, `rootStyle`,
  `surfaceStyle`, `inputStyle`, `monoStyle`, `focusRingStyle`, `dividerStyle`
  and the rest. Also `@acc/decho-components`.

- **`@acc/decho-styling/styles.css` and `/components.css` are gone.** The
  components' classes ship with the components:

  ```diff
  - import "@acc/decho-styling/styles.css";
  + import "@acc/decho-styling/tokens.css";
  + import "@acc/decho-components/styles.css";
  ```

  `tokens.css`, `blueprint.css` and `compat/military.css` are unchanged and
  stay here — they are token-level.

  The full migration is in that package's changelog. Nothing about the tokens
  themselves has changed: no theme moves a value, `classic` is untouched, and
  `tokensFor`, `withAccent`, `defineTheme`, `themeVariables`, `tokens.json`,
  the `decho` CLI and the `no-raw-color` rule are all exactly as they were.

### Why

Two packages both exporting a `Card` was the confusion that produced the
estate's duplication in the first place, so the components are consolidated
into one home. The direction is the part worth stating: **components depend on
tokens, never the reverse.** Components need colours; colours do not need
components, and the other way round is a cycle whose only escape is a component
library carrying its own palette.

That would have been a poor trade for this package in particular, whose pitch
is that it depends on nothing — a node script, a test, a transform or a
non-React widget can take it, and none of them wants React.

`@acc/decho-components` does not depend on this package either, at runtime: it
reads `var(--decho-…, <base value>)`, with the fallbacks generated from
`tokens.json` here and a test that fails if they drift. So the pair composes
without either being able to break the other's install.

### Changed

- `react` stays an optional peer dependency and `@types/react` a devDependency:
  `themeVariables` and `tokenVariables` return `CSSProperties`, which is a
  type-only import. `react-dom` is no longer a devDependency — it was there for
  the component render tests, which moved.

---

## 0.7.0

### Added

- **`accenture-sap` — a seventh theme: Accenture purple on white.** The look
  the SAP migration estate already draws with, in the one place where it does
  not have to be copied by hand.

  There are at least five widget-set repositories in that estate — Ignite's
  process review, PRISM's overview and process tracker, and the FloX
  harmonisation, transformation, validation-hub and MyMigration sets — and each
  one holds its own `theme.ts`, copied from the last, with a comment explaining
  that copying is the only mechanism available because there is no shared
  package between widget sets. There is now.

  The values are taken from the estate's own source of truth (the Overview Page
  and Process Tracker widget set's `theme.ts`) and from `semanticPills.ts`'s
  `PILL_TONE`, which is what every migrated table already resolves its chips
  through:

  - `accent` is `purpleDark` `#7500c0`, not the brand `#a100ff`. It is the fill
    a primary button gets and it carries white text — 8.3:1 on the first,
    3.3:1 on the second. The brand purple is where it is in the estate:
    `borderStrong`, `accentOverMap`, and the head of the chart ramp, all
    decoration that holds no text.
  - Tones are the chip foregrounds (`#0f6e3d` / `#8a5300` / `#9b1c1c`), dark
    enough to be read as a 10px uppercase tag; the brighter solids
    (`#12864b` / `#d08700` / `#dc4b4b`) sit in `status`, behind text instead of
    being it.
  - Zinc greys, 10px cards, 6px controls, `150ms ease`, and a hover shadow with
    Ignite's purple cast.
  - Gradients stay `none`. The estate paints flat, and its one real gradient is
    a page hero band rather than something every surface wears.

  **Not a replacement for `accenture-light`.** That is the corporate palette as
  specified — Blue 3 for actions, Blueprint greys, 2px corners. This is what
  one programme built on top of it. Beside an un-migrated widget the difference
  between them is immediately visible, which is the whole reason both exist.

  Two judgement calls worth knowing about, both marked in the source:

  - `ai` is `levelPalette[5]`'s teal `#155e63`. The estate has no AI colour,
    and violet is not available as a distinction here the way it is in
    `accenture-light`, because violet *is* the accent. Worth confirming with
    whoever owns the palette before an AI affordance ships against it.
  - `accentHover` is `heroBorder` `#5c1a94` rather than the `purpleDeep`
    `#460073` the estate's buttons actually use. `withAccent` classes anything
    that dark as shadow rather than as brand and leaves it behind, so the
    literal value would give a re-tinted deployment a green button that turns
    purple under the pointer.

  Where the repositories disagreed with each other, the source-of-truth value
  wins and the near-misses are recorded in the source rather than averaged:
  `#7c3aed` in the dependency-flow and data-readiness widgets, `#A200FF` in the
  FloX donuts, `#f8f7fc` for the page in two of them. That is drift, not design.

- **`fontFamily` is themed for the first time.** `accenture-sap` names Graphik
  ahead of the system stack. Still no webfont and still no `@import` — naming a
  family is not a network request, so a widget's CSP has nothing to block: on a
  machine that has the corporate font the estate's own typography appears, and
  on one that does not it falls through to Segoe UI exactly as these widgets
  already do.

Nothing else moves. `classic` is untouched, no existing theme changes a value,
and no component reads a new token — so upgrading changes the appearance of
nothing that does not ask for the new theme by name.

---

## 0.6.1

### Fixed

- **A nested surface no longer undoes an ancestor's accent.** A re-tinted app
  whose frame came from `AppShell` rendered the frame, and everything inside
  it, in the theme's own accent — green page, indigo shell.

  `AppShell` *is* a `DechoSurface`, so such an app has two surfaces nested. The
  inner one, given no `accent` of its own, was resetting the tint in both
  deliveries at once: it redeclares the theme's custom properties on its own
  element, which shadows an inherited `--decho-color-accent` for the whole
  subtree, and it provided a null token set to the components below, which sent
  them back to `tokensFor(skin)`. Worth dwelling on how this failed, because it
  is not how it looked: the chrome *outside* the shell stayed tinted, so the
  symptom read as "some components ignore the accent" — a component bug, in a
  component that was behaving correctly — rather than "the accent stopped at a
  boundary". Every component had been given the tokens context; the context had
  been taken away from them.

  A surface now inherits the accent an ancestor was re-tinted to unless it is
  given its own, so the accent is stated once at the root and holds. Nothing to
  change at the consumer: passing `accent` to the shell as well was, and still
  is, correct — it simply is no longer required.

  Inherited as the caller's colour rather than as the ancestor's resolved
  tokens, which matters when a nested surface also changes theme: the accent is
  re-mixed into the new theme instead of dragging the old theme's surfaces down
  with it. `tokens` still opts out entirely — a theme from `defineTheme()` has
  an accent of its own, and layering an inherited one over it would re-tint a
  palette somebody chose deliberately.

- `AppShell` passes an explicit `tokens` set to its own layout recipe. Nothing
  visible today — the recipe emits only layout and `color` — but it was the one
  place in the shell that resolved from the theme name alone.

---

## 0.6.0

### Added

- **`npx decho css --theme modern --accent "#2fbf71" --out theme.css`** — the
  stylesheet, generated from the same functions the TypeScript calls.

  This closes a gap the package itself created. Both adopting repos ended up
  with a pasted block of variables in CSS *and* a `withAccent()` call in a
  theme module, kept in step by hand — the exact drift this package exists to
  remove, reintroduced at the consumer. Put the command in a prebuild script
  and the two cannot diverge. An unparseable colour is an error rather than an
  empty file, because `withAccent` deliberately returns the theme untouched and
  a silent no-op would ship a stylesheet that does nothing.

- **`npx decho doctor`** — checks the four things that are ever actually wrong:
  declared, installed, installed-matches-declared, and a theme selected
  somewhere. Prints the fix.

  Three adoptions produced three distribution failures and not one error
  message named the cause: `404` (project has not imported the Artifacts
  repository), `403` (imported, cannot read it), and a stale packument that
  installed an old version whose exports map lacked an entry — which surfaced
  as a PostCSS "missing specifier" error that read like a bug in this package.

- **Component and accessibility tests.** Every careful choice in the components
  was protected by nothing: the heatmap being a real `<table>` with row and
  column headers and the state in each cell's accessible name; `NavItem` being
  a `<button>` with `aria-current="page"`; breadcrumb separators being
  `aria-hidden`; `type="button"` so a toolbar control cannot submit a form;
  `Card` staying a `<div>` even when interactive. They are exactly what a
  later refactor removes without anything looking different.

  Rendered with `renderToStaticMarkup` rather than Testing Library, to keep the
  dependency count at zero. The trade is explicit: hover, focus and click are
  not covered here — they are state transitions the recipes own — while what
  reaches a screen reader is frozen.

- **A test for the version check in `doctor`**, because the rule that catches
  the real incident is the unintuitive one: on `0.x` a caret pins the *minor*,
  so `^0.4.1` accepts neither `0.3.0` nor `0.5.0`.

---

## 0.5.1

### Fixed

- **A re-tint turned drop shadows into coloured glows.** Modern's app gradient
  fades to `rgba(8, 11, 22, 0)` and its shadows are built on
  `rgba(4, 6, 16, …)` — the page colour, which is deliberately blue-tinted and
  therefore within 30° of the indigo accent. Re-tinting to green produced
  `0 16px 40px rgba(35, 141, 83, 0.6)`: a green shadow under every card.

  Colours below 3% luminance are now left alone. A near-black is never what
  anyone means by "the primary colour", whatever its hue. Caught by generating
  the variables for a real consumer and reading them before shipping, which is
  worth doing for anything that computes CSS.

---

## 0.5.0

### Added

- **`withAccent(theme, colour)`** and an **`accent` prop** on `DechoSurface`
  and `AppShell`: keep a theme exactly as it is and change only its primary
  colour. `defineTheme({ accent })` takes it too.

  This is not `themeVariables({ accent })`, which existed and was not enough.
  An accent is never one value: in `modern` the indigo appears as three hex
  shades in the accent gradient, as `rgba(108, 92, 231, …)` in the app glow,
  the hover glow and the selection ring, and again in the strong border.
  Setting `color.accent` alone turned the buttons green and left all of that
  purple, which reads as a bug rather than as a re-tint.

  What follows the accent: hovers, focus rings, the selection glow, the primary
  button's gradient, the strong border, links, and `modern`'s hairline. What
  does not: surfaces, text, geometry, the RAG scale, the chart series, and
  `ai` — which has its own colour on purpose. The *other* hues a theme mixes in
  survive too, so modern's hairline still fades into teal rather than flattening
  to one colour.

  `onAccent` is recomputed, not substituted: re-tint to lime and white button
  text stops being readable, which is the commonest mistake in a brand swap.

- **`accentVariables(theme, colour)`** — only the custom properties a re-tint
  moves, for the CSS delivery.
- **`useDechoTokens()`** and a `tokens` prop on every component, so a re-tint
  or a custom theme reaches the inline-styled components. Without it a
  re-tinted surface would turn its CSS-styled children green and leave its
  components purple — worse than doing nothing.
- **`src/core/color.ts`** — parse, shade, luminance, hue, contrast, and
  `readableOn`. No dependency; sRGB, deliberately, because these values sit
  beside ones picked by eye in sRGB.
- **`seriesColor(tokens, i)`** — the chart series from a resolved token set, so
  custom themes get their own palette.

### Notes from building it

Two wrong turns, both caught by tests and worth recording:

1. A hardcoded list of each theme's accent shades drifted immediately — it had
   a hex that no theme actually used. Replaced with hue detection against the
   theme's own accent.
2. Hue detection alone re-tinted the *background*: `modern`'s page (#080b16)
   and text (#e9ecfb) are deliberately blue-tinted, which puts them within 30°
   of its indigo. Hue now decides which stops inside a value are family;
   `ACCENT_TOKENS` (exported) decides which tokens are eligible at all, because
   "what the accent owns" is a design decision rather than something to infer.

---

## 0.4.1

### Fixed

- **`compat/military.css` was missing the easing curves** (`--ease-out`,
  `--ease-in`, `--ease-snap`). Repos on that palette write
  `transition: transform 0.2s var(--ease-snap)` throughout, and an undefined
  custom property makes the whole declaration invalid — the transition simply
  stops happening, which is the sort of regression nobody files a bug about.

  Found by diffing "variables the CSS references" against "variables anything
  defines" while moving the first repo onto the shipped layer. Worth doing in
  yours:

  ```sh
  grep -rho "var(--[a-z0-9-]*" src --include=*.css | sed 's/var(//' | sort -u > used
  grep -ho -- "--[a-z0-9-]*:" dist/assets/*.css | sed 's/:$//' | sort -u > defined
  comm -23 used defined
  ```

---

## 0.4.0

Aimed squarely at adoption across many repositories rather than at the three
that use it today. Everything here came out of doing the adoption by hand three
times and writing down what was repeated.

### Added

- **`@acc/decho-styling/compat/military.css`** — the alias layer that maps the
  legacy military palette (`--bg-panel`, `--accent-primary`, `--text-primary`,
  `--shadow-card`, …) onto the tokens. Both estates hand-wrote this before
  adopting the package; now it is one import, and existing `var(--bg-panel)`
  call sites start following the theme without a rename.
- **`@acc/decho-styling/blueprint.css`** — Blueprint 5 wearing the design
  system's palette: buttons, inputs, cards, dialogs, menus, tags, tabs. Also
  hand-written twice before this. Import it after Blueprint's own stylesheet.
- **`npx decho migrate`** — the adoption codemod, shipped. Points hard-coded
  colours at tokens: `var(--decho-…)` in CSS, and in TypeScript only inside
  `style={{ }}` or `CSSProperties` objects, because MapLibre, deck.gl, canvas
  and milsymbol take colour values and render *nothing* when handed a CSS
  variable. `--dry-run` to preview, `--report` to list every literal left
  behind with file and line, `--map` for your own palette.
- **`defineTheme()`** — a project can define its own theme without a change to
  this package. Extend a built-in, override the tokens that differ, and apply
  the result as CSS (`.css`), as inline variables (`.style`), or to components
  (`tokens=`). Dozens of brands should not mean dozens of pull requests here.
- **`tokens` option on every recipe and component** — how a custom theme reaches
  the inline styles, which cannot inherit a CSS variable.
- **`@acc/decho-styling/eslint`** — a `no-raw-color` rule, `recommended`
  (warn) and `strict` (error) configs, with `allow`, `allowIn` and per-line
  disables for the paint values that genuinely cannot be tokens.
- **`@acc/decho-styling/tokens.json`** — every theme's resolved tokens as data,
  for Figma, Style Dictionary, docs sites and diffing two themes. Generated
  from the same source as the CSS.
- **`.decho-classic`** — classic now selects like every other theme, and a
  classic subtree can sit inside a themed app.
- **Contrast tests** — every theme is checked for readable text and legible
  status colours, per theme, rather than only for luminance ordering.

### Breaking

- **`[data-decho-skin="…"]` is now `[data-decho-theme="…"]`.** The class form
  (`decho-modern`) is unchanged and is what both estates use, so in practice
  this affects nobody; if you used the attribute, rename it.

### Known wart

The code says `skin` (`DechoSkin`, `skinVariables`, `useDechoSkin`, the `skin`
prop) and the documentation says *theme*. They are the same thing. The rename
is deferred to `1.0` rather than churning every consumer's props twice.

---

## 0.3.0

### Added

- **Themes `accenture-light` and `accenture-dark`**, from the corporate colour
  reference: Blue 3 for actions, Blue 2 hover, Blue 1 pressed, Blue 4 focus
  rings, Blue 5 tints, Violet 3 for AI, card borders Black at 20%.
  The dark variant lightens tone colours where the reference has no
  dark-legible member — Green Shade 2 on Black is unreadable — using the set's
  own lighter members where they exist. Its RAG scale is deliberately identical
  to the light one.
- **`status` tokens** — the seven RAG states from the heatmap specification,
  separate from the six tones because a tone is "how should this look" and a
  status is "what state is this item in". `notAssessed` is not red.
- **`chart` tokens** — ten brand series colours plus axis and grid, with
  `chartSeries(i)` wrapping past ten.
- **`color.ai`** — AI controls get their own colour in every theme.
- **Charts**: `Sparkline`, `BarChart`, `DonutChart`, `ChartLegend`,
  `StatusHeatmap`. SVG, no charting dependency. `StatusHeatmap` is a real
  `<table>` with headers and the state in each cell's accessible name.
- **Application shell**: `AppShell`, `AppHeader`, `AppBody`, `AppSidebar`,
  `AppSidebarNav`, `AppContent`, `AppFooter`, `AppBreadcrumb`.
- **Themes `daylight` and `command`**, and `effect.colorScheme` so a light
  theme gets light native scrollbars and form controls.

### Changed

- `src/css/tokens.css` is generated from `src/core/tokens.ts`. Edit the
  TypeScript, run `node scripts/gen-tokens-css.mjs`, commit both.

---

## 0.1.0

First release. Tokens, style recipes, `Card` / `Tag` / `Button` / `Panel` /
`NavItem`, the `classic` and `modern` themes, and three ways to consume them:
components, recipes, or CSS classes.
