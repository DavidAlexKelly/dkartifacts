/**
 * Styles for the floating settings panels the map examples put over the map.
 *
 * They import DEFAULT_SURFACE_THEME from @acc/decho-basemap/react rather than
 * defining their own colours, so a page's own panel and the library's drawing
 * toolbar are the same dark translucent surface instead of two near-misses. If
 * the library's palette changes, these follow.
 *
 * A shared module rather than copies in each page: two pages had the same
 * eleven lines of inline style, and the first restyle would have made them
 * disagree.
 *
 * THEMEABLE, AND THE SAME UNTIL THEMED
 * ------------------------------------
 * Every colour and font below is a CSS custom property whose fallback is the
 * value it always had: `var(--map-panel-text, #e8ecf4)`. A page that sets
 * nothing looks exactly as before. A page that wants another look spreads
 * `mapPanelVariables(tokensFor("crt"))` onto an element, and every panel
 * inside it follows — no prop drilled through, no second set of styles.
 */

import type { CSSProperties } from "react";
import { DEFAULT_SURFACE_THEME } from "@acc/decho-basemap/react";
import type { DechoTokenSet } from "@acc/decho-styling";

const literal = DEFAULT_SURFACE_THEME;

/** The custom properties, by name, with the values they fall back to. */
const FALLBACKS = {
  background: literal.background,
  border: literal.border,
  text: literal.text,
  muted: literal.muted,
  accent: literal.accent,
  accentBackground: literal.accentBackground,
  blur: literal.blur,
  onAccent: "#ffffff",
  /** Behind a hovered or selected row, a pressed segment. */
  highlight: "rgba(255, 255, 255, 0.12)",
  /** Behind a tile or a row that sits in the panel rather than on it. */
  well: "rgba(255, 255, 255, 0.06)",
  /** Behind a text field. */
  field: "rgba(0, 0, 0, 0.25)",
  shadow: "0 2px 10px rgba(0,0,0,0.35)",
  /** Scales every corner: 1 as designed, 0 square. See panelRadius. */
  round: "1",
  font: "sans-serif",
  mono: "ui-monospace, monospace",
  /** text-shadow on everything a panel writes. */
  glow: "none",
  danger: "#ff9a92",
  warning: "#e0b64a",
  success: "#5fd08a",
} as const;

export type MapPanelToken = keyof typeof FALLBACKS;

const name = (token: MapPanelToken) =>
  `--map-panel-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** `var(--map-panel-…, fallback)` for each token. */
export const panelVar = Object.fromEntries(
  Object.entries(FALLBACKS).map(([token, fallback]) => [
    token,
    `var(${name(token as MapPanelToken)}, ${fallback})`,
  ]),
) as Record<MapPanelToken, string>;

/**
 * The panel colours. Same keys as DEFAULT_SURFACE_THEME, but each one follows
 * the page's theme when it has one.
 */
export const surface = {
  background: panelVar.background,
  border: panelVar.border,
  text: panelVar.text,
  muted: panelVar.muted,
  accent: panelVar.accent,
  accentBackground: panelVar.accentBackground,
  blur: panelVar.blur,
};

/** A corner of `px` pixels as designed, scaled by the theme's `round`. */
export function panelRadius(px: number): string {
  return `calc(${px}px * ${panelVar.round})`;
}

/**
 * A decho-styling theme as the panel properties, to spread onto the element
 * whose panels should wear it. `extra` sets what no token covers (`glow`).
 */
export function mapPanelVariables(
  tokens: DechoTokenSet,
  extra: Partial<Record<MapPanelToken, string>> = {},
): CSSProperties {
  const { color, effect, fontFamily, radius, shadow } = tokens;
  const values: Partial<Record<MapPanelToken, string>> = {
    background: color.surfaceOverlay,
    border: color.borderOverlay,
    text: color.text,
    muted: color.textMuted,
    accent: color.accentOverMap,
    accentBackground: color.accentSoft,
    onAccent: color.onAccent,
    blur: effect.blur,
    highlight: color.accentSoft,
    well: color.neutralSoft,
    field: color.bg,
    shadow: shadow.panel,
    // The panels are drawn at 8px, the base theme's large radius.
    round: String(Math.max(0, parseFloat(radius.lg) || 0) / 8),
    font: fontFamily.sans,
    mono: fontFamily.mono,
    danger: color.danger,
    warning: color.warning,
    success: color.success,
    ...extra,
  };
  const style: Record<string, string> = {};
  for (const [token, value] of Object.entries(values)) {
    if (value != null) {style[name(token as MapPanelToken)] = value;}
  }
  // React passes `--*` keys straight to the DOM; CSSProperties just lacks them.
  return style as CSSProperties;
}

/** A floating panel. Position it with a second style object. */
export const mapPanel: CSSProperties = {
  position: "absolute",
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 12px",
  background: surface.background,
  // Frosted rather than merely see-through: without the blur, a translucent
  // panel over a vector map has road labels running through its text.
  backdropFilter: surface.blur,
  WebkitBackdropFilter: surface.blur,
  border: `1px solid ${surface.border}`,
  borderRadius: panelRadius(8),
  boxShadow: panelVar.shadow,
  color: surface.text,
  font: `12px/1.6 ${panelVar.font}`,
  textShadow: panelVar.glow,
};

export const panelHeading: CSSProperties = {
  font: `600 12px/1.6 ${panelVar.font}`,
  letterSpacing: 0.2,
  color: surface.text,
};

export const panelMuted: CSSProperties = {
  font: `11px/1.5 ${panelVar.font}`,
  color: surface.muted,
};

/** For counts and RIDs, where a monospace column is easier to scan. */
export const panelFigures: CSSProperties = {
  font: `11px/1.5 ${panelVar.mono}`,
  color: surface.muted,
};

export const panelSeparator: CSSProperties = {
  height: 1,
  background: surface.border,
  margin: "8px -12px",
};

export const panelToggle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  color: surface.text,
};

/**
 * Native checkboxes render as light chrome on a dark panel. `accent-color` is
 * one property, is widely supported, and keeps the native control — which
 * keeps its keyboard behaviour and its accessibility tree. A hand-built div
 * would lose both.
 */
export const panelCheckbox: CSSProperties = {
  accentColor: surface.accent,
  width: 14,
  height: 14,
  margin: 0,
};

/** Error panels stay red, but on the same surface as everything else. */
export const errorPanel: CSSProperties = {
  ...mapPanel,
  color: panelVar.danger,
  font: `12px/1.5 ${panelVar.mono}`,
  maxWidth: 420,
};
