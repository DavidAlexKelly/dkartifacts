/**
 * A tab strip.
 *
 * The estate's section navigation, its drawer navigation and its segmented
 * controls are all this component with different padding, and all three were
 * built from `<div onClick>`, which means none of them can be operated from a
 * keyboard and none of them tells a screen reader that the thing below changed.
 *
 * This is the WAI-ARIA tab pattern, which is short enough to simply do:
 * `role="tablist"`, `role="tab"` with `aria-selected`, arrow keys moving
 * between tabs, Home and End jumping to the ends, and `tabIndex` on the
 * selected tab only — so Tab moves *past* the strip rather than through six
 * tabs on the way to the content.
 *
 * The panels are yours. A component that owned them would have to own their
 * mounting, their scroll position and their data loading, and the estate's
 * sections each do something different with all three. Wire them with
 * `aria-labelledby={tabId(key)}` if you want the association; `Tabs` puts that
 * id on each tab for exactly that purpose.
 */

import React, { useRef } from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";

export interface TabItem {
  key: string;
  label: React.ReactNode;
  /** A count, shown after the label — "Requirements 24". */
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect" | "children"> {
  items: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  /**
   * `underline` is the page-level look; `segmented` is the pill group the
   * estate uses inside panels and toolbars.
   */
  variant?: "underline" | "segmented";
  size?: "sm" | "md";
  /** Prefix for the generated tab ids, if you are wiring up panels. */
  idPrefix?: string;
  tokens?: DechoTokenSet;
}

export function Tabs({
  items,
  activeKey,
  onSelect,
  variant = "underline",
  size = "md",
  idPrefix,
  tokens,
  style,
  ...rest
}: TabsProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const generated = React.useId();
  const prefix = idPrefix ?? generated;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const small = size === "sm";
  const segmented = variant === "segmented";

  const enabled = items.filter((i) => i.disabled !== true);

  const move = (delta: number) => {
    const index = enabled.findIndex((i) => i.key === activeKey);
    if (index < 0) {return;}
    const next = enabled[(index + delta + enabled.length) % enabled.length];
    onSelect(next.key);
    refs.current[next.key]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        if (enabled[0] != null) {
          onSelect(enabled[0].key);
          refs.current[enabled[0].key]?.focus();
        }
        break;
      case "End": {
        e.preventDefault();
        const last = enabled[enabled.length - 1];
        if (last != null) {
          onSelect(last.key);
          refs.current[last.key]?.focus();
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <div
      {...rest}
      role="tablist"
      style={{
        display: "flex",
        alignItems: "center",
        gap: segmented ? 2 : t.space[1],
        padding: segmented ? 2 : 0,
        backgroundColor: segmented ? t.color.surfaceRaised : undefined,
        border: segmented ? `1px solid ${t.color.borderSubtle}` : undefined,
        borderBottom: segmented ? undefined : `1px solid ${t.color.borderSubtle}`,
        borderRadius: segmented ? t.radius.md : undefined,
        fontFamily: t.fontFamily.sans,
        ...style,
      }}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            id={`${prefix}-tab-${item.key}`}
            ref={(el) => {
              refs.current[item.key] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            // Only the selected tab is in the tab order: the pattern is "Tab
            // to the strip, arrows within it, Tab onward to the content".
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(item.key)}
            // On the tab rather than on the strip: focus lives on the selected
            // tab, so that is where the arrow keys are heard. A handler on the
            // container would also make the container itself something the
            // a11y lint rule expects to be focusable, which it should not be.
            onKeyDown={onKeyDown}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: small ? "4px 9px" : "7px 12px",
              background: segmented
                ? active
                  ? t.color.surface
                  : "transparent"
                : "transparent",
              border: "none",
              borderRadius: segmented ? t.radius.sm : 0,
              boxShadow: segmented && active ? t.shadow.sm : undefined,
              // The underline is a box-shadow rather than a border so that it
              // sits on top of the strip's own bottom border instead of
              // shifting the tab by a pixel when it becomes active.
              ...(segmented
                ? {}
                : {
                    boxShadow: active
                      ? `inset 0 -2px 0 0 ${t.color.accent}`
                      : undefined,
                  }),
              color: active ? t.color.text : t.color.textMuted,
              fontFamily: "inherit",
              fontSize: small ? t.fontSize.sm : t.fontSize.md,
              fontWeight: active ? 600 : 500,
              cursor: item.disabled === true ? "not-allowed" : "pointer",
              opacity: item.disabled === true ? 0.5 : 1,
              transition: `color ${t.effect.transition}, background-color ${t.effect.transition}`,
            }}
          >
            {item.label}
            {item.badge != null && (
              <span
                style={{
                  fontSize: t.fontSize.xs,
                  fontWeight: 600,
                  color: active ? t.color.accent : t.color.textFaint,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
