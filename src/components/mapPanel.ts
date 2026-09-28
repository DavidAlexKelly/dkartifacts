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
 */

import type { CSSProperties } from "react";
import { DEFAULT_SURFACE_THEME } from "@acc/decho-basemap/react";

export const surface = DEFAULT_SURFACE_THEME;

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
  borderRadius: 8,
  boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
  color: surface.text,
  font: "12px/1.6 sans-serif",
};

export const panelHeading: CSSProperties = {
  font: "600 12px/1.6 sans-serif",
  letterSpacing: 0.2,
  color: surface.text,
};

export const panelMuted: CSSProperties = {
  font: "11px/1.5 sans-serif",
  color: surface.muted,
};

/** For counts and RIDs, where a monospace column is easier to scan. */
export const panelFigures: CSSProperties = {
  font: "11px/1.5 ui-monospace, monospace",
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
  color: "#ff9a92",
  font: "12px/1.5 ui-monospace, monospace",
  maxWidth: 420,
};
