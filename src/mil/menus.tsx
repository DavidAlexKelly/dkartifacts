/**
 * The three menus, built from plain buttons and inline styles.
 *
 * No icon set, no CSS file, no component library: this package is dropped into
 * applications with their own design systems, and a menu that inherits the
 * host's fonts and can be replaced wholesale is worth more than a pretty one
 * that fights it. Every menu here is also reachable through the actions on
 * useMilMap, so replacing them means rendering your own and calling those.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import type {
  MilOrderDef,
  PlacedMilUnit,
  UnitTemplate,
} from "@acc/app6d/orders";
import { DEFAULT_MENU_THEME, type MenuTheme } from "./theme";

/** Keeps a menu inside the map even when opened near the right/bottom edge. */
function anchoredStyle(
  x: number,
  y: number,
  theme: MenuTheme,
  width: number,
): React.CSSProperties {
  return {
    position: "absolute",
    left: x,
    top: y,
    // translate rather than measuring: a menu opened 20px from the right edge
    // would otherwise render off-map, and measuring costs a layout pass on
    // every open.
    transform: `translate(${x > 0 ? "0" : "0"}, 0)`,
    maxWidth: width,
    minWidth: width,
    maxHeight: 320,
    overflowY: "auto",
    background: theme.background,
    border: `1px solid ${theme.border}`,
    borderRadius: 4,
    boxShadow: "0 6px 24px rgba(0,0,0,0.55)",
    color: theme.text,
    font: "12px/1.5 system-ui, sans-serif",
    padding: 4,
    zIndex: 20,
  };
}

function itemStyle(theme: MenuTheme): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "none",
    border: "none",
    color: theme.text,
    font: "inherit",
    padding: "5px 8px",
    borderRadius: 3,
    cursor: "pointer",
  };
}

function headingStyle(theme: MenuTheme): React.CSSProperties {
  return {
    padding: "6px 8px 2px",
    color: theme.muted,
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

function FilterBox({
  value,
  onChange,
  placeholder,
  theme,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  theme: MenuTheme;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  // Focus on open. A context menu is summoned deliberately and typing is the
  // next thing the user does, which is exactly the case the accessibility
  // guidance carves out — but do it imperatively so it is scoped to mount
  // rather than reasserted on every render.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      style={{
        width: "100%",
        boxSizing: "border-box",
        background: "#0a0c0f",
        border: `1px solid ${theme.border}`,
        borderRadius: 3,
        color: theme.text,
        font: "12px/1.4 monospace",
        padding: "4px 6px",
        marginBottom: 4,
      }}
    />
  );
}

/** Group by `category`, preserving first-seen order. */
function groupBy<T extends { category?: string }>(
  items: T[],
  fallback: string,
): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category ?? fallback;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return [...groups.entries()];
}

// ── Unit palette: right-click on empty map ──────────────────────────────────

export function UnitPaletteMenu({
  x,
  y,
  templates,
  onPick,
  theme = DEFAULT_MENU_THEME,
}: {
  x: number;
  y: number;
  templates: UnitTemplate[];
  onPick: (template: UnitTemplate) => void;
  theme?: MenuTheme;
}) {
  const [filter, setFilter] = useState("");
  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matching = needle
      ? templates.filter(
          (t) =>
            t.label.toLowerCase().includes(needle) ||
            t.sidc.toLowerCase().includes(needle) ||
            (t.echelon ?? "").toLowerCase().includes(needle),
        )
      : templates;
    return groupBy(matching, "Units");
  }, [templates, filter]);

  return (
    <div style={anchoredStyle(x, y, theme, 230)} role="menu">
      <FilterBox
        value={filter}
        onChange={setFilter}
        placeholder="place a unit…"
        theme={theme}
      />
      {groups.length === 0 && (
        <div style={{ padding: "6px 8px", color: theme.muted }}>
          No unit matches.
        </div>
      )}
      {groups.map(([category, items]) => (
        <div key={category}>
          <div style={headingStyle(theme)}>{category}</div>
          {items.map((template) => (
            <button
              key={template.id}
              type="button"
              role="menuitem"
              style={itemStyle(theme)}
              onClick={() => onPick(template)}
            >
              {template.label}
              {template.echelon ? (
                <span style={{ color: theme.muted }}> · {template.echelon}</span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Map menu: right-click on empty map ──────────────────────────────────────

/**
 * The first level on empty map: what is being added, before what it is.
 *
 * Two items rather than the unit palette straight away, because there are now
 * two things a right-click can mean. An order added from here belongs to the
 * ground — no unit, nothing for it to follow — which is how a phase line or a
 * no-fire area gets onto the map during planning.
 */
export function MapMenu({
  x,
  y,
  onAddUnit,
  onAddOrder,
  theme = DEFAULT_MENU_THEME,
}: {
  x: number;
  y: number;
  onAddUnit: () => void;
  onAddOrder: () => void;
  theme?: MenuTheme;
}) {
  return (
    <div style={anchoredStyle(x, y, theme, 170)} role="menu">
      <button
        type="button"
        role="menuitem"
        style={itemStyle(theme)}
        onClick={onAddUnit}
      >
        Add unit…
      </button>
      <button
        type="button"
        role="menuitem"
        style={itemStyle(theme)}
        onClick={onAddOrder}
      >
        Add order…
      </button>
    </div>
  );
}

// ── Unit menu: right-click on a unit ────────────────────────────────────────

export function UnitMenu({
  x,
  y,
  unit,
  orderCount,
  onAssignOrder,
  onRemoveUnit,
  onClearOrders,
  theme = DEFAULT_MENU_THEME,
}: {
  x: number;
  y: number;
  unit: PlacedMilUnit;
  orderCount: number;
  onAssignOrder: () => void;
  onRemoveUnit: () => void;
  onClearOrders: () => void;
  theme?: MenuTheme;
}) {
  return (
    <div style={anchoredStyle(x, y, theme, 190)} role="menu">
      <div style={headingStyle(theme)}>{unit.label}</div>
      <button
        type="button"
        role="menuitem"
        style={itemStyle(theme)}
        onClick={onAssignOrder}
      >
        Assign order…
      </button>
      <button
        type="button"
        role="menuitem"
        style={{
          ...itemStyle(theme),
          color: orderCount > 0 ? theme.text : theme.muted,
          cursor: orderCount > 0 ? "pointer" : "default",
        }}
        disabled={orderCount === 0}
        onClick={onClearOrders}
      >
        Clear orders{orderCount > 0 ? ` (${orderCount})` : ""}
      </button>
      <button
        type="button"
        role="menuitem"
        style={{ ...itemStyle(theme), color: "#e07a6c" }}
        onClick={onRemoveUnit}
      >
        Remove unit
      </button>
    </div>
  );
}

// ── Order picker: after "Assign order…" ─────────────────────────────────────

export function OrderPickerMenu({
  x,
  y,
  unit,
  orders,
  onPick,
  theme = DEFAULT_MENU_THEME,
}: {
  x: number;
  y: number;
  /** The unit being ordered, or null when the order is going on the ground. */
  unit: PlacedMilUnit | null;
  orders: MilOrderDef[];
  onPick: (order: MilOrderDef) => void;
  theme?: MenuTheme;
}) {
  const [filter, setFilter] = useState("");
  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matching = needle
      ? orders.filter(
          (o) =>
            o.label.toLowerCase().includes(needle) ||
            (o.description ?? "").toLowerCase().includes(needle),
        )
      : orders;
    return groupBy(matching, "Orders");
  }, [orders, filter]);

  return (
    <div style={anchoredStyle(x, y, theme, 250)} role="menu">
      <div style={headingStyle(theme)}>
        {unit ? `Order for ${unit.label}` : "Order on the map"}
      </div>
      <FilterBox
        value={filter}
        onChange={setFilter}
        placeholder="filter orders…"
        theme={theme}
      />
      {groups.length === 0 && (
        <div style={{ padding: "6px 8px", color: theme.muted }}>
          No order matches.
        </div>
      )}
      {groups.map(([category, items]) => (
        <div key={category}>
          <div style={headingStyle(theme)}>{category}</div>
          {items.map((order) => (
            <button
              key={order.id}
              type="button"
              role="menuitem"
              style={itemStyle(theme)}
              title={order.description}
              onClick={() => onPick(order)}
            >
              {order.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The "now click an objective" banner. */
export function PendingBanner({
  text,
  theme = DEFAULT_MENU_THEME,
}: {
  text: string;
  theme?: MenuTheme;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        background: theme.accent,
        color: "#fff",
        padding: "6px 16px",
        borderRadius: 2,
        font: "600 13px/1.4 system-ui, sans-serif",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 15,
      }}
    >
      {text}
      <span style={{ marginLeft: 10, opacity: 0.75, fontSize: 11 }}>
        (Esc to cancel)
      </span>
    </div>
  );
}
