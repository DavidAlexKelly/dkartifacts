/**
 * Styles for the event monitor's panels, on the same dark translucent surface
 * as every other map page (see src/components/mapPanel.ts).
 */

import type React from "react";
import { errorPanel, mapPanel, panelMuted, surface } from "@/components/mapPanel";

/**
 * The scrolling container. Block, not flex: a flex column of fixed height
 * shrinks its children to fit rather than scrolling, which squashed the feed
 * until its rows were clipped out of reach. The column lives in
 * `sidePanelContent` inside it.
 */
export const sidePanel: React.CSSProperties = {
  ...mapPanel,
  display: "block",
  top: 12,
  left: 12,
  bottom: 12,
  width: 280,
  overflowY: "auto",
};

export const sidePanelContent: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

export const disclosure: React.CSSProperties = {
  ...panelMuted,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  fontSize: 10,
  marginTop: 6,
  cursor: "pointer",
  listStylePosition: "inside",
};

export const sectionLabel: React.CSSProperties = {
  ...panelMuted,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  fontSize: 10,
  marginTop: 6,
};

export const mockBadge: React.CSSProperties = {
  font: "600 9px/1 sans-serif",
  letterSpacing: 0.6,
  padding: "3px 5px",
  borderRadius: 4,
  border: `1px solid ${surface.border}`,
  color: surface.muted,
};

export const segmented: React.CSSProperties = {
  display: "flex",
  gap: 4,
};

export function segment(active: boolean, colour?: string): React.CSSProperties {
  return {
    flex: 1,
    padding: "4px 0",
    borderRadius: 5,
    border: `1px solid ${active ? colour ?? surface.accent : surface.border}`,
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    color: active ? surface.text : surface.muted,
    font: "11px/1.4 sans-serif",
    cursor: "pointer",
  };
}

export function dot(colour: string, size = 8): React.CSSProperties {
  return {
    display: "inline-block",
    flex: "none",
    width: size,
    height: size,
    borderRadius: "50%",
    background: colour,
    boxShadow: "0 0 0 1px rgba(255,255,255,0.5)",
  };
}

export const feed: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  maxHeight: 260,
  overflowY: "auto",
  margin: "0 -6px",
};

export function feedRow(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    textAlign: "left",
    padding: "5px 6px",
    borderRadius: 5,
    border: "none",
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    color: surface.text,
    cursor: "pointer",
    font: "12px/1.4 sans-serif",
  };
}

export const feedTitle: React.CSSProperties = {
  display: "block",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const actionButton: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: `1px solid ${surface.border}`,
  background: "rgba(255,255,255,0.08)",
  color: surface.text,
  font: "12px/1.4 sans-serif",
  cursor: "pointer",
};

export const hoverCard: React.CSSProperties = {
  ...mapPanel,
  pointerEvents: "none",
  minWidth: 200,
  zIndex: 3,
};

export const detailsPanel: React.CSSProperties = {
  ...mapPanel,
  top: 12,
  right: 12,
  width: 330,
  maxHeight: "calc(100% - 24px)",
  overflowY: "auto",
  paddingTop: 14,
};

export const detailsStripe: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: 4,
  borderRadius: "8px 8px 0 0",
};

export function chip(colour: string): React.CSSProperties {
  return {
    padding: "2px 7px",
    borderRadius: 10,
    border: `1px solid ${colour}`,
    color: colour,
    font: "600 10px/1.5 sans-serif",
    letterSpacing: 0.3,
  };
}

export const closeButton: React.CSSProperties = {
  marginLeft: "auto",
  border: "none",
  background: "transparent",
  color: surface.muted,
  font: "18px/1 sans-serif",
  cursor: "pointer",
  padding: 2,
};

export const metricsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 6,
};

export const metricTile: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  background: "rgba(255,255,255,0.06)",
};

export const facts: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  columnGap: 12,
  rowGap: 3,
  margin: 0,
};

export const factValue: React.CSSProperties = { margin: 0 };

export const legend: React.CSSProperties = {
  ...mapPanel,
  bottom: 12,
  left: 304,
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
  padding: "6px 10px",
};

export const legendItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
};

export const errorStyle: React.CSSProperties = {
  ...errorPanel,
  top: 12,
  left: 304,
  zIndex: 3,
};


// ── Sources ─────────────────────────────────────────────────────────────────

export const sourceRow: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "6px 8px",
  borderRadius: 6,
  background: "rgba(255,255,255,0.05)",
};

export const sourceHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
};

export const sourceName: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  fontWeight: 600,
};

export const kindBadge: React.CSSProperties = {
  font: "600 9px/1 sans-serif",
  letterSpacing: 0.5,
  textTransform: "uppercase",
  padding: "3px 4px",
  borderRadius: 3,
  background: "rgba(255,255,255,0.1)",
  color: surface.muted,
  flex: "none",
};

export const liveBadge: React.CSSProperties = {
  font: "700 9px/1 sans-serif",
  letterSpacing: 0.6,
  padding: "2px 4px",
  borderRadius: 3,
  background: "#e5484d",
  color: "#ffffff",
  flex: "none",
};

export const iconButton: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: surface.muted,
  cursor: "pointer",
  font: "13px/1 sans-serif",
  padding: "2px 3px",
  flex: "none",
};

export const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "5px 7px",
  borderRadius: 5,
  border: `1px solid ${surface.border}`,
  background: "rgba(0,0,0,0.25)",
  color: surface.text,
  font: "11px/1.4 ui-monospace, monospace",
};

export const select: React.CSSProperties = {
  ...input,
  font: "11px/1.4 sans-serif",
};

export const problemText: React.CSSProperties = {
  font: "11px/1.45 sans-serif",
  color: "#ff9a92",
};

export const warningText: React.CSSProperties = {
  font: "11px/1.45 sans-serif",
  color: "#e0b64a",
};

export const fieldsTable: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  font: "11px/1.45 sans-serif",
};

export const fieldKey: React.CSSProperties = {
  ...panelMuted,
  padding: "2px 8px 2px 0",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

export const fieldValue: React.CSSProperties = {
  padding: "2px 0",
  color: surface.text,
  wordBreak: "break-word",
};
