/**
 * @acc/decho-components — the Decho component library.
 *
 * One entry point, because everything here is React and splitting it would
 * only give consumers a second thing to get wrong.
 *
 *   Content    Card · Tag · StatusChip · StatusDot · Button · Panel · NavItem
 *              SectionHeader · Callout · EmptyState · Skeleton · Tooltip ·
 *              Banner
 *   Fields     Field · TextInput · TextArea · NumberInput · DateInput ·
 *              DateRangeInput · Checkbox · RadioGroup · Toggle · Select ·
 *              MultiSelect · Slider · RangeSlider
 *   Data       MetricTile · KpiTile · ProgressBar · StackedBar · Legend ·
 *              DataTable · Pagination · LoadMore · Timeline
 *   Overlays   Dialog · Drawer · Popover · Menu · ContextMenu ·
 *              ToastHost/useToast/ToastCard
 *   Structure  Tabs · Toolbar · FacetGroup · Accordion · SplitPane · Stepper
 *   Content-in  SimpleMarkdown · ChatPanel · CodeBlock · EditableField ·
 *              UserName · DemoDataBadge · Avatar · AvatarGroup
 *   Actions    CopyButton · DownloadButton · RefreshButton · FilterSummary
 *   Charts     Sparkline · BarChart · DonutChart · ChartLegend · StatusHeatmap
 *   Shell      AppShell · AppHeader · AppBody · AppSidebar · AppSidebarNav ·
 *              AppContent · AppFooter · AppBreadcrumb
 *   Theming    DechoSurface · ErrorBoundary · Icon, and the recipes for
 *              elements you already have
 *   Showcase   ComponentShowcase — all of the above, live, in one grid
 *
 * The pure modules are exported too — `pageInfo`, `isIsoDate`, `placeFloating`,
 * `nextIndex`, `filterOptions`, `snap`, `toastReducer`, `parseNumber` — because
 * a consumer often needs the arithmetic without the component: a server-paged
 * table wants `pageInfo` and not `Pagination`.
 *
 * THEMING, IN ONE PARAGRAPH
 * -------------------------
 * Everything is styled from `var(--decho-…, <base value>)`. Drop a component
 * anywhere and it is correct. Put it under a `<DechoSurface tokens={…}>` — or
 * anything else that declares those variables, such as
 * `@acc/decho-styling/tokens.css` — and it follows that theme instead. There
 * is no provider to remember, no stylesheet to import, and no dependency on
 * the styling package: a theme arrives as values or as a class name, and
 * neither is an import.
 */

export {
  BASE_TOKENS,
  VAR_TOKENS,
  chartSeries,
  resolveTokens,
  statusColor,
  tokenVariableName,
  tokenVariables,
  toneColors,
  type DechoColor,
  type DechoPalette,
  type DechoStatus,
  type DechoTokenGroup,
  type DechoTokenSet,
  type DechoTokens,
  type DechoTone,
} from "./core/vars.js";

export {
  buttonStyle,
  cardFooterStyle,
  cardHeaderStyle,
  cardMetaStyle,
  cardStyle,
  cardTitleStyle,
  dividerStyle,
  dotStyle,
  focusRingStyle,
  inputStyle,
  labelStyle,
  monoStyle,
  navDescriptionStyle,
  navIconStyle,
  navItemStyle,
  navLabelStyle,
  panelBodyStyle,
  panelHeaderStyle,
  panelStyle,
  rootStyle,
  sectionLabelStyle,
  surfaceStyle,
  tagStyle,
  type ButtonOptions,
  type CardOptions,
  type DechoButtonVariant,
  type NavItemOptions,
  type PanelOptions,
  type Styled,
  type TagOptions,
} from "./core/recipes.js";

export * from "./react/index.js";
