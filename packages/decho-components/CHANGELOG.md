# Changelog

## Versioning policy

The same contract as `@acc/decho-styling`, since consumers are other people's
repositories. While the version is `0.x`:

- **Patch** — a value or a spacing changes, docs, internal refactors.
- **Minor** — new components, new props, new exports. Additive.
- **Breaking** — removing or renaming a component, a prop or an export;
  changing what a component is *for*. Until `1.0` these land in a minor bump,
  listed under **Breaking**, with the migration in the same entry.

One rule that holds regardless of version: **nothing changes theme
implicitly.** A component takes its colours from the variables an ancestor
declared, or from the fallbacks. Neither this package nor any component in it
decides to be a different theme.

---

## 0.4.0

The heavyweight components: the ones with a data engine behind them. Eight
components, seven new pure modules, and one deliberate refusal.

### Added

- **`DataTable` virtualises** — `virtual` plus `maxHeight`, and only the rows
  on screen are in the DOM. The readiness table renders about five nodes per
  row and visibly stutters at 800; this is the fix that is not "fewer
  columns". `aria-rowcount` and `aria-rowindex` come with it, because
  assistive technology cannot count rows that are not there.

  No virtualisation dependency. `@tanstack/virtual` is excellent and is 12kB
  per widget instance for a fixed-row-height table that needs sixty lines of
  arithmetic — and `virtualRange` is those sixty lines, tested against the
  cases that actually happen: elastic overscroll giving a negative
  `scrollTop`, a scroll position past the end after rows are removed, a
  viewport taller than the content.

  Variable row heights are deliberately **not** supported. That is where a
  virtualiser stops being sixty lines, and the moment a workflow needs it is
  the moment to take the dependency rather than grow a worse copy of it.

- **`PivotTable`** — a crosstab with an aggregation and optional heat. Every
  total is computed from the raw values, never from the cells, because a row
  of averages averaged again is a number that is not the average of anything.
  A missing intersection renders as a dash rather than a zero: "no objects
  were signed off" and "zero per cent were" are different facts.

- **`TreeTable`** — a real `treegrid`. Right opens a closed node and steps
  into an open one, Left closes an open node and steps out of a closed one,
  which is the asymmetry that makes a tree navigable with two keys and the
  part that is always missing. Filtering keeps a match's ancestors, so a
  matching leaf does not float at the wrong indent.

- **`KanbanBoard`** — native HTML5 drag, and ctrl with the arrow keys for
  everyone who cannot drag. No drag-and-drop dependency; the two costs of
  that choice (no styled drag preview, no touch dragging) are written down in
  the file rather than discovered later.

- **`GanttChart`** — a plan to read rather than to edit. Inclusive dates, so a
  one-day task is one day wide rather than zero; clipping arrows, so a bar
  that runs past the window says so; a today line; and a text alternative per
  row, because a chart made of divs is otherwise silent.

- **`Calendar`** — a month grid with events, a locale-aware week start and
  weekday names from `Intl`. Always six rows, so the control does not change
  height as you page through it. Arrowing off the end of a week pages the
  month.

- **`FileDrop` and `ImageGallery`** — a drop zone that is also a real file
  input, which is what makes it usable without a mouse. It does not upload:
  uploading here means a media set and an OSDK client, and this package knows
  about neither. Rejections are reported with both numbers — "plan.xlsx is
  4.2 MB, the limit is 2.0 MB" — because "invalid file" tells nobody
  anything.

- **`MarkdownEditor`** — and **no `RichTextEditor`**, deliberately. A good one
  is TipTap or Lexical; a bad one is `contentEditable`, which looks like an
  afternoon and is actually selection restoration, paste sanitisation, undo
  across a controlled value and a document model that differs per browser.
  What the workflows need is a comment box with bold, a list and a link —
  which is markdown, which this package already renders.

- **Seven pure modules**: `virtualRange`, `pivot`, `tree`, `kanban`,
  `ganttScale`, `monthGrid`, `fileValidation`, plus `markdownActions`. All
  exported, all tested — 651 tests in the package now.

- **Three new showcase shelves** — `Grids`, `Planning`, `Media` — with
  `EVERYDAY_GROUPS` and `ADVANCED_GROUPS` exported so an application can put
  them on a separate page. The harness does exactly that: these specimens
  render 800 table rows, a pivot over 200 and six weeks of calendar buttons
  between them, and somebody checking what a `Tag` looks like should not wait
  for it.

### Changed

- `showcase.test.tsx` checks that a component appears once **per shelf**
  rather than once overall: `DataTable` has earned a second card under Grids
  for the virtualised variant, which is a different capability shown with 800
  rows instead of four.

- `applyMarkdownAction` keeps whitespace outside the markers. Every browser
  includes the trailing space when you double-click a word, and
  `**cutover **` is not emphasis in CommonMark — so without trimming, the
  toolbar produced literal asterisks on the commonest selection there is.
  Found by a test whose *indices* were wrong, which turned out to be the more
  interesting bug.

## 0.3.0

Thirty-three components, closing the gap between this library and what a
Workshop builder can reach for. Nothing existing changed; every addition is
new surface.

### Added

- **Fields** — `Field`, `TextInput`, `TextArea`, `NumberInput`, `DateInput`,
  `DateRangeInput`. The package has shipped an `inputStyle` recipe and no
  input since the split, so every form in the estate is a bare `<input>` with
  a `<div>` above it pretending to be a label — and half of those are not
  labels at all, so clicking the text does nothing and a screen reader says
  "edit text, blank". `Field` owns the part that is always missing, because it
  is the only part you cannot see: `aria-describedby`.

  `NumberInput` is deliberately **not** `<input type="number">`. The scroll
  wheel silently edits a focused numeric field, which is the most common
  data-corruption bug in web forms; the browsers will not fix it, and a
  quantity that changes because somebody scrolled past it is not a bug you
  find in review.

  Dates are ISO `"YYYY-MM-DD"` strings, never `Date`. `new Date("2026-03-01")`
  is midnight UTC — the 28th of February in São Paulo — and the readiness
  dashboard has shown a cutover a day early for exactly this reason.

- **Choice** — `Checkbox`, `RadioGroup`, `Toggle`, `Select`, `MultiSelect`,
  `Slider`, `RangeSlider`. `accent-color` styles a native checkbox's fill and
  nothing else, and a native `<select>` is painted by the operating system —
  which is why the filters are the one part of each widget that does not look
  like the widget. Real inputs behind painted boxes, so the keyboard and the
  announcements are unchanged.

  `Checkbox` has the third state as `aria-checked="mixed"`: the estate's
  select-all headers show "none" when some rows are selected, so the next
  click selects everything instead of clearing.

  `Select` and `MultiSelect` use the combobox pattern with
  `aria-activedescendant`, so focus stays on the trigger and typeahead keeps
  reaching it.

- **Overlays** — `Popover`, `Menu`, `ContextMenu`, `ToastHost` (+ `useToast`,
  `ToastCard`). `Popover` is the one the others are built on; it is
  fixed-position rather than portalled, matching `Dialog`, which keeps React
  this package's only peer dependency.

  Toasts are a queue rather than a `useState`: the version every widget has
  shows the fifth result of five writes and silently drops four, including
  the failure. Failures never auto-dismiss — an error that vanishes before it
  is read is the same as no feedback — repeats collapse with a count, and the
  stack caps at four.

- **Structure** — `Accordion`, `SplitPane`, `Stepper`, `Pagination` (+
  `LoadMore`), `Timeline`. `Accordion` unmounts a closed section rather than
  hiding it, so five heavy sections cost one section's work. `SplitPane`'s
  divider is keyboard-operable and its minimums are in pixels, because a
  percentage minimum means something different at every window size.

- **Small actions** — `CopyButton`, `DownloadButton`, `RefreshButton`,
  `FilterSummary`. Each exists because the hand-rolled version is missing the
  part that makes it work: a confirmation you can see *and hear*, a busy state
  that blocks a second press, and — the last one — an answer to "why am I
  seeing twelve rows", which is the most common question about every table in
  the estate.

- **`ErrorBoundary`** — a render error becomes a banner naming the view, with
  the stack behind a disclosure, instead of an empty rectangle. The only class
  component in the package; `componentDidCatch` has no hook.

- **`Banner`** — the page-level failure surface, distinct from the editorial
  `Callout`. Its `diagnostic` prop is first-class and copyable, because a
  request id in the browser console is why bug reports are "it's broken" plus
  a screenshot.

- **`Icon`** — a deliberately small, closed glyph set. Not an icon library:
  `icon={<YourIcon />}` is still accepted everywhere. But a chevron is not a
  brand decision, and six of the components above cannot render without one.

- **Eight pure modules, exported** — `pageMath`, `dateValue`, `placement`,
  `listNavigation`, `selectOptions`, `sliderMath`, `numberInput`,
  `toastQueue`. A consumer often needs the arithmetic without the component,
  and these are where the behaviour worth testing lives. Roughly half of the
  593 tests in this package are on them.

- **Showcase specimens for all of it**, so `ComponentShowcase` covers the new
  components on arrival. The parity test added in 0.2.0 did its job during
  this change: it failed listing all thirty-three by name before the specimens
  were written.

### Changed

- `showcase.test.tsx`'s "shows nothing that is not exported" now checks every
  export rather than only the components, so a specimen's `also` list can
  legitimately name a hook (`useToast`).

---

## 0.2.0

### Added

- **`ComponentShowcase`** — every component in the library, live, in one grid,
  as a component you can render:

  ```tsx
  import { ComponentShowcase } from "@acc/decho-components";
  import { tokensFor } from "@acc/decho-styling";

  <ComponentShowcase tokens={tokensFor("accenture-sap", "dark")} />;
  ```

  It takes a theme (as values or as a name), can be narrowed to a group or a
  search term, and is built from the library's own components — so a broken
  `Card` breaks the gallery rather than hiding in it.

  A gallery is normally kept in a docs app, which is how a gallery ends up one
  release behind the library it documents. This one ships inside the package
  and `showcase.test.tsx` reads the package's own entry point: every export
  React would call a component must appear in `SHOWCASE_SPECIMENS`, or the test
  fails naming it. That matters here more than most places — five widget sets
  in this estate each rebuilt the same progress bar, and the reason was always
  that nobody could see in ten seconds what already existed.

- **`SHOWCASE_SPECIMENS` and `SHOWCASE_GROUPS`** — the specimen list, exported,
  for anyone who wants the inventory in a different layout than the grid.

---

## 0.1.0

The first release, and mostly a move rather than new code: the components that
were `@acc/decho-styling/react` now live here, and that package is tokens only.

### Added

- **The components, moved from `@acc/decho-styling`** — `Card`, `Tag`,
  `Button`, `Panel`, `NavItem`, `DechoSurface`, the `App*` shell and the SVG
  charts, along with `core/recipes.ts` and the class stylesheet. Same code,
  same behaviour, one import away.

- **A theming mechanism with no dependency.** Every recipe value is
  `var(--decho-…, <base value>)` and the fallbacks are generated from the
  styling package's `tokens.json`, so the components are themed when a theme is
  present and correct when none is. See the README for why the fallbacks being
  the base set makes the two mechanisms agree exactly rather than approximately.

- **Twelve components lifted out of the migration widget sets**, replacing
  between two and six hand-written copies each:

  `ProgressBar` (6 copies) · `StatusChip` (5) · `MetricTile` (5) · `KpiTile` ·
  `EmptyState` (5) · `StackedBar` (3) · `Legend` (3) · `StatusDot` (3) ·
  `Callout` (2) · `SectionHeader` · `Skeleton` · `Tooltip`

  Where the copies differed for a reason, the reason survives — `ProgressBar`
  keeps `inline` and `headline`, `KpiTile` stays separate from `MetricTile`
  because the four-line tile pushed a strip of them below the fold on a 900px
  Workshop pane. Where they differed by accident, they do not.

- **The workflow layer.** `DataTable`, `Dialog`, `Drawer`, `Tabs`, `Toolbar`
  (with `ToolbarSpacer` and `ToolbarStatus`) and `FacetGroup`, replacing eight
  hand-written tables, three dialogs, three drawers and every `<div onClick>`
  that was serving as a tab or a filter pill.

  The accessibility is the substance of it, because these are the components
  the originals got most wrong: `<th scope="col">` with `aria-sort` and a real
  button for the sort control; a select-all with a true indeterminate state and
  a label on every row checkbox ("Select AV-27 Recovery", not "checkbox"); a
  `<caption>` so the table has a name; `role="tablist"` with arrow-key
  movement and only the selected tab in the tab order; `aria-pressed` on the
  facets; `aria-live` on the toolbar's count, so applying a filter announces
  the new row count instead of silently changing it.

  `useDismiss` handles Escape and focus for both overlays. It is deliberately
  not a focus trap — see the README for where that line is drawn and why.

  Both overlays render in place rather than through a portal: a portal to
  `document.body` leaves the subtree whose custom properties are the theme, so
  a portalled dialog comes out in the base theme over an `accenture-sap` page.

- **The long tail**: `SimpleMarkdown`, `ChatPanel`, `CodeBlock`,
  `EditableField`, `UserName` and `DemoDataBadge`.

  `SimpleMarkdown` is the one to review. It renders a subset of Markdown by
  building React elements, with no `innerHTML` anywhere and an `http(s)`
  allowlist for links, because the string it renders arrived from a model that
  was reading customer data — and every renderer in the estate reached for
  `dangerouslySetInnerHTML`. A refused link renders as its own source text
  rather than disappearing, so what the model said stays inspectable.

  `ChatPanel` is the two 17kB insight chats with the part they disagree about
  removed: it holds no conversation and calls no model. `EditableField` is a
  `<button>` when idle rather than a div that becomes an input. `UserName`
  gives a person a deterministic colour from the chart series and says
  "Unknown user" rather than drawing a blank chip. `DemoDataBadge` carries its
  reason into its accessible name, because a screenshot of a demo is
  indistinguishable from production once it is in a deck.

  `CodeBlock` moves in from the example app, whose own note argued it should
  stay out because it touches `navigator.clipboard`. That note is answered in
  the file: the call is optional-chained and the failure mode is a button that
  does nothing, which is a smaller risk than the two repos that had already
  started growing their own `<pre>`.

- **`core/labels.ts`** — the seven RAG states' wording, once. The heatmap and
  the chips had already drifted apart: one said "On Track" and the other "On
  track", and the heatmap labelled `high` as "High / At Risk", which is two
  states in one label.

### Changed from the `@acc/decho-styling/react` originals

- **`skin` is gone; `tokens` and `theme` replace it.** A theme is values
  (`tokens={tokensFor("accenture-sap")}`) or a class name (`theme="modern"`).
  It cannot be a theme *name* resolved by this package, because resolving one
  would mean importing the package that owns the names.

- **`accent` is gone from `DechoSurface` and `AppShell`.** A re-tint is a token
  set: `tokens={withAccent("modern", "#2fbf71")}`. One decision made one level
  up, rather than a prop threaded through the components that needed it.

- **The three React contexts are gone** — skin, tokens, accent. Custom
  properties inherit through the DOM, so a surface now writes only what it was
  given. The nesting bug that `@acc/decho-styling@0.6.1` fixed cannot occur
  here; `components.test.tsx` guards the absence.

- **`KpiTile`'s icon wash is the `accentSoft` token** rather than the accent
  with two hex digits appended (`${accent}18`). String-appending alpha cannot
  survive a value that might be a `var()` reference, and the token already
  means "the accent, quietly".

- **`chartSeries(index, tokens?)`** replaces `seriesColor(tokens, index)`. The
  common call is "the i-th series, in whatever theme is in force", and that
  now needs no second argument.

### Migration from `@acc/decho-styling/react`

```diff
- import { AppShell, Card } from "@acc/decho-styling/react";
- import { cardStyle } from "@acc/decho-styling";
+ import { AppShell, Card, cardStyle } from "@acc/decho-components";
+ import { tokensFor } from "@acc/decho-styling";       // only if you name a theme

- import "@acc/decho-styling/styles.css";
+ import "@acc/decho-styling/tokens.css";
+ import "@acc/decho-components/styles.css";

- <AppShell skin="modern" accent="#2fbf71">
+ <AppShell tokens={withAccent("modern", "#2fbf71")}>

- <Card skin="modern" title="Unit" />
+ <Card title="Unit" />        {/* inherits the surface's theme */}

- cardStyle({ skin: "modern" })
+ cardStyle()                  {/* emits var(), so it follows the ancestor */}
```

Tokens, themes, `withAccent`, `defineTheme`, `tokens.css`, `tokens.json`, the
`decho` CLI and the `no-raw-color` rule all stay in `@acc/decho-styling`.
