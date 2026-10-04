/**
 * @acc/decho-styling — the design tokens.
 *
 * Eight themes, as values and as CSS custom properties, plus the helpers for
 * re-tinting one and defining your own. No React, no components, no DOM: this
 * is safe in a widget, a test, a transform or a node script generating a
 * report.
 *
 * The components that used to live here are `@acc/decho-components`. They are
 * not a dependency of this package and this is not a dependency of theirs:
 * they read `var(--decho-…, <base value>)`, so handing them a token set — or
 * loading `@acc/decho-styling/tokens.css` — is the whole integration.
 *
 *     import { tokensFor } from "@acc/decho-styling";
 *     import { AppShell } from "@acc/decho-components";
 *
 *     <AppShell tokens={tokensFor("accenture-sap")}>…</AppShell>
 *
 * Which way round that dependency goes is the one design decision in these two
 * packages worth stating outright: tokens are the bottom layer. Components need
 * colours; colours do not need components. The other direction is a cycle, and
 * the only way out of a cycle is for the component library to carry its own
 * palette — which is the duplication both packages exist to end.
 */

export {
  ACCENT_TOKENS,
  DECHO_THEMES,
  DECHO_TOKENS,
  SKIN_OVERRIDES,
  MODE_OVERRIDES,
  THEME_MODES,
  allThemeVariables,
  defaultModeFor,
  isTheme,
  modeDeltas,
  modesFor,
  themeDeltas,
  accentVariables,
  chartSeries,
  defineTheme,
  withAccent,
  skinVariables,
  statusColor,
  toneColors,
  tokenVariableName,
  tokenVariables,
  tokensFor,
  type DechoColor,
  type DechoCustomTheme,
  type DechoMode,
  type DechoSkin,
  type DechoThemeDefinition,
  type DechoStatus,
  type DechoTokenGroup,
  type DechoTokenOverrides,
  type DechoTokenSet,
  type DechoTokens,
  type DechoTone,
} from "./core/tokens.js";

export {
  themeVariables,
  withTheme,
  type DechoColorOverrides,
} from "./core/theme.js";

/**
 * Putting a theme on a document. The one to reach for inside a widget, where
 * the host owns the markup and a CSS class never arrives.
 */
export {
  applyTheme,
  assertThemeApplied,
  onColorSchemeChange,
  prefersDarkMode,
  type ApplyThemeOptions,
  type AssertThemeOptions,
  type StyleTarget,
} from "./core/apply.js";

/**
 * Opaque versions of the soft washes, for anything that paints a background
 * without knowing what is behind it.
 */
export {
  isTranslucent,
  over,
  tintsFor,
  type DechoTintName,
} from "./core/tints.js";

export {
  contrastRatio,
  hue,
  luminance,
  parseColor,
  readableOn,
  shade,
  toHex,
  type Rgba,
} from "./core/color.js";
