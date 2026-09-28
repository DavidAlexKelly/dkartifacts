/**
 * A labelled group of filter pills.
 *
 * The estate's `facetGroup` plus `pillButton`, which between them are how
 * every filter in the process review and the scope tracker works: a caption, a
 * row of toggles with counts, and a clear.
 *
 * Two things it fixes about the original, both invisible in a screenshot:
 *
 *   - The pills were `<div onClick>`. These are buttons with `aria-pressed`,
 *     so the selected ones are selected as far as a screen reader is
 *     concerned, not merely a different colour.
 *   - The group had no accessible name, so a reader announced eleven
 *     unrelated buttons. This is a `role="group"` with `aria-label` from the
 *     caption — "Severity: High, pressed".
 *
 * Controlled, like everything here: `selected` in, `onChange` out. `multiple`
 * decides whether clicking a second pill adds to the selection or replaces it,
 * which is the only behavioural difference between the estate's facets and its
 * segmented filters.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";

export interface Facet {
  value: string;
  label?: React.ReactNode;
  /** A count, shown after the label and dimmed. */
  count?: number;
  disabled?: boolean;
}

export interface FacetGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "children"> {
  /** The caption, and the group's accessible name. */
  label?: React.ReactNode;
  facets: Facet[];
  selected: string[];
  onChange: (selected: string[]) => void;
  multiple?: boolean;
  /** A "clear" button when anything is selected. */
  clearable?: boolean;
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

export function FacetGroup({
  label,
  facets,
  selected,
  onChange,
  multiple = true,
  clearable = true,
  size = "sm",
  tokens,
  style,
  ...rest
}: FacetGroupProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const small = size === "sm";

  const toggle = (value: string) => {
    if (!multiple) {
      // A single-select facet that cannot be un-set has no "all" state, and
      // every filter in the estate needs one.
      onChange(selected.includes(value) ? [] : [value]);
      return;
    }
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  return (
    <div
      {...rest}
      role="group"
      aria-label={typeof label === "string" ? label : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: t.space[2],
        fontFamily: t.fontFamily.sans,
        ...style,
      }}
    >
      {label != null && (
        <span
          style={{
            fontSize: t.fontSize.xs,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: t.color.textFaint,
            marginRight: 2,
          }}
        >
          {label}
        </span>
      )}

      {facets.map((facet) => {
        const active = selected.includes(facet.value);
        return (
          <button
            key={facet.value}
            type="button"
            aria-pressed={active}
            disabled={facet.disabled}
            onClick={() => toggle(facet.value)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: small ? "2px 9px" : "4px 11px",
              borderRadius: t.radius.pill,
              border: `1px solid ${active ? t.color.accent : t.color.borderSubtle}`,
              backgroundColor: active ? t.color.accentSoft : t.color.surface,
              color: active ? t.color.accent : t.color.textMuted,
              fontFamily: "inherit",
              fontSize: small ? t.fontSize.sm : t.fontSize.md,
              fontWeight: 600,
              lineHeight: 1.5,
              whiteSpace: "nowrap",
              cursor: facet.disabled === true ? "not-allowed" : "pointer",
              opacity: facet.disabled === true ? 0.5 : 1,
              transition: `background-color ${t.effect.transition}, border-color ${t.effect.transition}, color ${t.effect.transition}`,
            }}
          >
            {facet.label ?? facet.value}
            {facet.count != null && (
              <span
                style={{
                  color: active ? t.color.accent : t.color.textFaint,
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {facet.count}
              </span>
            )}
          </button>
        );
      })}

      {clearable && selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          style={{
            background: "none",
            border: "none",
            padding: "2px 4px",
            color: t.color.link,
            font: "inherit",
            fontSize: small ? t.fontSize.sm : t.fontSize.md,
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
