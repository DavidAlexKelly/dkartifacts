# @acc/decho-components

The pieces every operational front-end in this estate was redrawing: cards,
tags, status chips, buttons, panels, nav items, progress bars, metric tiles, an
application shell and a set of dependency-free SVG charts.

```sh
npm install @acc/decho-components
```

```tsx
import { AppShell, MetricTile, ProgressBar, StatusChip } from "@acc/decho-components";

<AppShell>
  <MetricTile label="Objects in scope" value={412} />
  <ProgressBar value={68} label="Harmonised" emphasis="headline" caption="1,284 of 1,888 fields" />
  <StatusChip status="atRisk" />
</AppShell>;
```

That is the whole installation. No stylesheet, no provider, no configuration.

## See what is in it

The library carries its own gallery. Render it anywhere — a scratch route, a
widget, a Storybook you never set up — and you have every component, live, in
your theme:

```tsx
import { ComponentShowcase } from "@acc/decho-components";
import { tokensFor } from "@acc/decho-styling";

<ComponentShowcase tokens={tokensFor("accenture-sap")} />;

// Narrowed, when you half-know what you want:
<ComponentShowcase groups={["Charts"]} query="donut" />;
```

It is a component rather than a docs site on purpose: a gallery kept somewhere
else is a gallery that is one release behind, and the cost of that is somebody
rebuilding a component that already exists — which happened five times in this
estate with the progress bar alone. A test compares the specimen list against
this package's own exports, so it cannot fall behind.

## Why there is no dependency on the styling package

This package works with [`@acc/decho-styling`](../decho-styling/README.md) and
does not depend on it — not as a dependency, not as a peer, not as an optional
peer. There is no import of it anywhere in `src/`.

Every value comes out of a recipe looking like this:

```
var(--decho-color-surface, #111318)
```

- **Nothing installed but this package?** The fallback applies. Everything is
  correct, in the base theme, with no stylesheet to load and no wrapper to
  remember.
- **A theme in force?** The variable wins. Put a `<DechoSurface tokens={…}>`
  above — or load `@acc/decho-styling/tokens.css`, or write the custom
  properties yourself — and every component follows it, including ones that
  rendered before the theme was chosen.

```tsx
import { tokensFor } from "@acc/decho-styling";
import { AppShell } from "@acc/decho-components";

<AppShell tokens={tokensFor("accenture-sap")}>…</AppShell>;
```

**In a widget, do it once at the entry point instead** — `applyTheme` writes the
variables onto the document, and everything below inherits them, components and
classes alike. No `tokens` prop anywhere:

```ts
// src/main.tsx
import { applyTheme } from "@acc/decho-styling";
applyTheme("accenture-sap");
```

```tsx
<AppShell>…</AppShell>      {/* inherits it */}
```

That is the recommended integration, and it is also the only one that survives
deployment: a Foundry widget's document comes from the host, so a theme class in
your own HTML never reaches the browser. `tokens` remains for the case that
cannot inherit — a portal — and for rendering two themes on one page.

**Why the fallbacks are exactly right rather than approximately right.** A
theme's CSS variables are only its *deltas from the base set*. Given base-set
fallbacks, a token a theme overrides resolves to that theme's value and a token
it leaves alone resolves to the base — which is `tokensFor(theme)`, token for
token. The two mechanisms agree without either knowing the other exists.

Those fallbacks are **generated** from the styling package's `tokens.json`
(`npm run fallbacks`) and `src/core/fallbacks.test.ts` fails if they drift,
because a hand-kept copy of somebody else's palette is the thing both packages
exist to stop. A variable name that disagrees is the worst case — 
`var(--decho-colour-surface, …)` is valid CSS that silently uses the fallback
for ever — so the names are compared against that package's own
`tokenVariableName` too.

## Which package holds what

| | |
|---|---|
| `@acc/decho-styling` | Tokens. Seven themes, `tokensFor`, `withAccent`, `defineTheme`, `tokens.css`, `tokens.json`, the `decho` CLI, the `no-raw-color` lint rule, the Blueprint adapter |
| `@acc/decho-components` | Everything you render, and the recipes they are styled from |

The arrow points one way on purpose. Components need colours; colours do not
need components. The other direction is a cycle, and the only way out of a
cycle is for this package to carry its own palette.

## Theming

```tsx
// Values — needs no stylesheet, so this is the one to use inside a widget.
<DechoSurface tokens={tokensFor("accenture-sap")}>…</DechoSurface>

// A re-tint is just a different set of values.
<DechoSurface tokens={withAccent("modern", "#2fbf71")}>…</DechoSurface>

// A name — cheaper in the DOM, and needs @acc/decho-styling/tokens.css loaded.
<DechoSurface theme="accenture-sap">…</DechoSurface>

// Or neither, and everything renders in the base theme.
<Card title="1 PARA" />
```

`DechoSurface` is the only thing resembling a provider and it is optional.
There are **no React contexts** in this package: custom properties inherit
through the DOM on their own. That is not a detail — the predecessor of this
code had three contexts (a skin, a resolved token set, and the accent a re-tint
asked for) and a bug class to go with them, where a nested surface published
its own theme over an ancestor's and the failure read as "some components
ignore the accent". A surface now writes only what it was given, so there is no
inheritance logic to get wrong.

Individual components take `tokens` too, for the case that cannot inherit: a
portal.

## What is in it

**Content.** `Card` · `Tag` · `StatusChip` · `StatusDot` · `Button` · `Panel` ·
`NavItem` · `SectionHeader` · `Callout` · `Banner` · `EmptyState` · `Skeleton` ·
`Tooltip`

**Fields.** `Field` · `TextInput` · `TextArea` · `NumberInput` · `DateInput` ·
`DateRangeInput` · `Checkbox` · `RadioGroup` · `Toggle` · `Select` ·
`MultiSelect` · `Slider` · `RangeSlider`

**Data display.** `MetricTile` · `KpiTile` · `ProgressBar` · `StackedBar` ·
`Legend` · `DataTable` · `Pagination` (+ `LoadMore`) · `Timeline`

**Overlays.** `Dialog` · `Drawer` · `Popover` · `Menu` · `ContextMenu` ·
`ToastHost` (+ `useToast`, `ToastCard`)

**Structure.** `Tabs` · `Toolbar` (+ `ToolbarSpacer`, `ToolbarStatus`) ·
`FacetGroup` · `Accordion` · `SplitPane` · `Stepper`

**Content that arrives from somewhere else.** `SimpleMarkdown` · `ChatPanel` ·
`CodeBlock` · `EditableField` · `UserName` · `Avatar` (+ `AvatarGroup`) ·
`DemoDataBadge`

**Small actions.** `CopyButton` · `DownloadButton` · `RefreshButton` ·
`FilterSummary`

**Safety net.** `ErrorBoundary` — a render error becomes a banner naming the
view, rather than an empty rectangle where the widget was.

**Grids.** `DataTable` (virtualised past a few hundred rows) · `PivotTable` ·
`TreeTable`

**Planning.** `KanbanBoard` · `GanttChart` · `Calendar`

**Media.** `FileDrop` · `ImageGallery` · `MarkdownEditor` — and deliberately no
rich text editor; see the note in `MarkdownEditor.tsx`.

**Charts**, SVG, no charting dependency. `Sparkline` · `BarChart` ·
`DonutChart` · `ChartLegend` · `StatusHeatmap`

**The shell.** `AppShell` · `AppHeader` · `AppBody` · `AppSidebar` ·
`AppSidebarNav` · `AppContent` · `AppFooter` · `AppBreadcrumb` — composed, not
configured: there is no `sidebar={}` prop, because the first app needing two
sidebars would have to fork a component that owned the grid.

**Recipes**, for elements you already have: `cardStyle` `tagStyle`
`buttonStyle` `panelStyle` `navItemStyle` `inputStyle` `monoStyle`
`focusRingStyle` and the rest.

**The pure modules**, exported because the arithmetic is often wanted without
the component — a server-paged table needs `pageInfo` and not `Pagination`, an
Ontology date property needs `isIsoDate` and not `DateInput`:

| Module | What it holds |
|---|---|
| `pageMath` | `pageInfo` `pageWindow` `pageSummary` — the off-by-ones |
| `dateValue` | `isIsoDate` `addDays` `daysBetween` `formatDate` `normaliseRange` — dates as `"YYYY-MM-DD"`, never as `Date` |
| `placement` | `placeFloating` — flip, clamp, max height |
| `listNavigation` | `nextIndex` `typeaheadIndex` — arrow keys, Home/End, typeahead |
| `selectOptions` | `filterOptions` `groupOptions` `summariseSelection` `fold` |
| `sliderMath` | `fraction` `snap` `keyStep` `moveRangeEnd` |
| `numberInput` | `parseNumber` `roundToStep` `stepValue` `clamp` |
| `toastQueue` | `toastReducer` `defaultDuration` |
| `virtualRange` | `virtualRange` `scrollToRow` — which rows are on screen |
| `pivot` | `pivot` — crosstabs whose totals come from the raw values |
| `tree` | `flattenTree` `filterTree` `expandTo` `treeKey` |
| `kanban` | `moveCard` `reorderColumn` `moveColumn` |
| `ganttScale` | `ganttScale` `ticksFor` — dates to pixels |
| `monthGrid` | `monthGrid` `shiftMonth` `weekdayLabels` |
| `fileValidation` | `validateFiles` `describeFile` |
| `markdownActions` | `applyMarkdownAction` — toolbar selection maths |

Roughly half this package's tests are on those eight modules, because that is
where the behaviour people complain about lives: a last page that is one row
short, a slider that emits `0.30000000000000004`, a cutover date a day early,
a vendor called Müller that a search for "Muller" cannot find.

### Where these came from

Most of them are not new. They are the components the migration widget sets
(Ignite, PRISM, the FloX sets, the validation hub, MyMigration) each hold their
own copy of, with the duplication counted:

| Component | Copies it replaces |
|---|---|
| `ProgressBar` | 6 — mapping progress, target mapping, load, reconciliation, summary health, the readiness bar rows |
| `MetricTile` / `KpiTile` | 5 |
| `StatusChip` | 5 — `Pill`, `badge()`, `dr-badge`, the semantic pill map, and a `<span>` with three inline styles |
| `EmptyState` | 5 — every widget's own "Connect an object set…" |
| `DonutChart` | 3 |
| `StackedBar`, `Legend`, `StatusDot`, `Callout` | 2–3 each |
| `DataTable` | 8 — the RICEFW table, the requirements section, the KDD grid, the rule tables, the linked-metrics grid, the scope inventory, the readiness table |
| `Dialog`, `Drawer` | 3 each |
| `Tabs`, `Toolbar`, `FacetGroup` | 2–3 each |
| `ChatPanel` | 2 — the insight chat and the process-mining chat, ~17kB each and differing only in what they ask |
| `SimpleMarkdown`, `EditableField`, `UserName`, `DemoDataBadge`, `CodeBlock` | 1–2 each |

`ProgressBar` keeps the two variants of it that were a real difference —
`inline` for a row, `headline` for a widget whose whole job is one number — and
drops the four that were only an accident of who wrote them.

## Rules the components hold to

- **No data layer.** Nothing here fetches, and nothing here imports the OSDK.
  Widgets pass data in. That is what keeps the kit testable without a client
  and usable outside Foundry.
- **A closed set of tones** (`neutral · accent · info · success · warning ·
  danger`) and a separate `status` for the seven RAG states. No colour prop
  anywhere: "danger is the same red in every widget" is the proposition, and an
  open colour prop is how that stops being true.
- **A state is never carried by colour alone.** `StatusChip` writes the words,
  `StatusDot` puts them in its accessible name, `StackedBar` labels each band
  "Complete: 30 (75%)", `StatusHeatmap` puts the state in each cell's name.
- **Anything clickable is a real `<button>`.** A `MetricTile` with an `onClick`
  is a button with `aria-pressed`; without one it is a `div`. A clickable
  `<div>` is the commonest way a dashboard ends up unusable from the keyboard.
- **Tabular figures on every number** that a poll can change, so it does not
  reflow as it updates.
- **Inline styles, with hover and focus in React state**, because inline styles
  have no `:hover` and a stylesheet is the thing that silently fails to load
  inside somebody else's bundle.

### The one global thing it writes

`Skeleton`, when animated, injects a single `@keyframes decho-skeleton-shimmer`
rule once per document — there is no way to express keyframes in a `style`
attribute. It declares no selector and cannot affect an element that does not
name it. `animated={false}` opts out, and `prefers-reduced-motion` opts itself
out.

## CSS classes, if you would rather

```tsx
import "@acc/decho-styling/tokens.css";   // the variables
import "@acc/decho-components/styles.css"; // the components as classes

<div className="decho-root decho-modern">
  <article className="decho-card decho-card--warning">…</article>
</div>;
```

The class delivery is the one place this package does need the styling package:
a stylesheet cannot carry a fallback per declaration, so the variables have to
come from somewhere. The component delivery does not.

Every selector is a class. No reset, no element selectors, no `html` or `body`
rules — this is imported into apps that already have a reset and into widgets
embedded in someone else's.

## Tests

```sh
npm test
```

The interesting ones are not "does it render":

- `core/fallbacks.test.ts` — the generated fallbacks against the real styling
  package: every group, every token, every value, every variable name, and the
  delta-composition identity the whole mechanism rests on.
- `react/estate.test.tsx` — for each component lifted out of the estate, the
  things the originals got wrong and a screenshot would not show: ARIA values
  on the progress bar, the share in each band's name, buttons where there are
  click handlers, `role="alert"` on danger and not on warning, and that every
  component emits `var(--decho-…)` rather than a literal.
- `react/components.test.tsx` — the theming contract, including the nesting bug
  this design cannot have.

## Package notes

Why the manifest and build are the way they are.

- **`src/` is shipped** in the tarball, for the source maps (they point at `../src/*`) and because the CSS entry point *is* a `src` file: tsc copies no assets, and adding a bundler to a package whose selling point is not needing one would be a poor trade.
- **Build:** `npm run build` is `tsc -b tsconfig.build.json`. It references nothing in this repo: see below. The build info file is written into `dist/` (so deleting `dist` always forces a rebuild) and excluded from the tarball.
- **React is a required peer** (`^18.0.0 || ^19.0.0`) — a component library with an optional view layer would be a pretence. `@acc/decho-styling` is deliberately not a dependency, a peer or an optional peer; see *Why there is no dependency on the styling package*.
- **Dev-only use of the styling package:** the fallback generator (`scripts/gen-fallbacks.mjs`) and the parity test read `@acc/decho-styling`'s source directly out of this repository (aliased in `vitest.config.ts`), which keeps `npm install` from needing a version of it that may not be published yet. `react-dom` is a dev dependency for the render tests, which use `renderToStaticMarkup` rather than Testing Library.

## Publishing

To the same Artifacts repository as `@acc/decho-styling`
(`ri.artifacts.main.repository.b39ad0fb-…`), deliberately: a scope can only
point at one registry, and tokens plus components is the pair nearly every
consumer installs together. One registry line in a widget repo's `.npmrc`, not
two.

From a Code Workspace the public host does not resolve — use the `--registry`
override documented in the root README.
