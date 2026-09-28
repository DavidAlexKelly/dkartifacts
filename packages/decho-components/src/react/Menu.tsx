/**
 * The "⋯" menu, and the right-click menu, over a `Popover`.
 *
 * Items are data, like `Tabs` and `FacetGroup`: a menu is a closed list of
 * actions, and passing children would mean every consumer re-implements the
 * keyboard handling — which is precisely what the mil map does today, with
 * arrow keys that do nothing.
 *
 * Roving focus rather than `aria-activedescendant`: in a menu, focus really
 * does move to the item, which is what lets Enter, Space and a screen
 * reader's item-by-item reading all work without being simulated. (A combobox
 * is the opposite case — see `Select`.)
 */

import React from "react";
import { resolveTokens, toneColors, type DechoTokenSet, type DechoTone } from "../core/vars.js";
import { Icon, type DechoIconName } from "./Icon.js";
import { Popover } from "./Popover.js";
import {
  extendTypeahead,
  isTypeaheadKey,
  nextIndex,
  typeaheadIndex,
  type NavKey,
  type TypeaheadState,
} from "./listNavigation.js";
import type { Align, Rect, Side } from "./placement.js";

export interface MenuAction {
  type?: "action";
  key: string;
  label: string;
  icon?: DechoIconName;
  /** A second line: what the action will do, or why it is unavailable. */
  description?: string;
  /** `danger` for destructive actions. Tone, not colour — the usual six. */
  tone?: DechoTone;
  disabled?: boolean;
  /** Displayed, not bound. Binding a shortcut is the application's business. */
  shortcut?: string;
  /** Stay open after this one — for a toggle inside a menu. */
  keepOpen?: boolean;
  onSelect?: () => void;
}

export interface MenuSeparator {
  type: "separator";
  key: string;
}

export interface MenuLabel {
  type: "label";
  key: string;
  label: string;
}

export type MenuEntry = MenuAction | MenuSeparator | MenuLabel;

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLElement | null> | Rect;
  items: MenuEntry[];
  side?: Side;
  align?: Align;
  /** Gap from the anchor. Zero for a context menu, which opens at the pointer. */
  offset?: number;
  /** The trigger, so clicking it closes rather than closing-then-reopening. */
  triggerRef?: React.RefObject<HTMLElement | null>;
  "aria-label"?: string;
  tokens?: DechoTokenSet;
}

/** Only the entries a keyboard can land on. */
const isAction = (entry: MenuEntry): entry is MenuAction =>
  entry.type === undefined || entry.type === "action";

export function Menu({
  open,
  onClose,
  anchor,
  items,
  side = "bottom",
  align = "start",
  offset,
  triggerRef,
  tokens,
  ...rest
}: MenuProps): React.ReactElement | null {
  const t = resolveTokens(tokens);
  const actions = React.useMemo(() => items.filter(isAction), [items]);
  const [active, setActive] = React.useState(-1);
  const typeahead = React.useRef<TypeaheadState | null>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Opening resets the highlight, because a menu that reopens on the item you
  // used last time is a menu that eventually triggers the wrong thing.
  React.useEffect(() => {
    if (open) {
      setActive(-1);
      typeahead.current = null;
    }
  }, [open]);

  React.useEffect(() => {
    if (active >= 0) {
      itemRefs.current[active]?.focus();
    }
  }, [active]);

  if (!open) {
    return null;
  }

  const move = (key: NavKey): void => {
    const next = nextIndex(actions, active, key);
    if (next != null) {
      setActive(next);
    }
  };

  const choose = (action: MenuAction): void => {
    if (action.disabled === true) {
      return;
    }
    action.onSelect?.();
    if (action.keepOpen !== true) {
      onClose();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(event.key)) {
      event.preventDefault();
      move(event.key as NavKey);
      return;
    }
    if (event.key === "Tab") {
      // A menu is one stop: Tab leaves it rather than walking its items.
      onClose();
      return;
    }
    if (isTypeaheadKey(event.key)) {
      typeahead.current = extendTypeahead(typeahead.current, event.key, Date.now());
      const found = typeaheadIndex(actions, active, typeahead.current.query);
      if (found != null) {
        setActive(found);
      }
    }
  };

  let actionIndex = -1;

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchor={anchor}
      side={side}
      align={align}
      offset={offset}
      role="menu"
      bare
      dismissRefs={triggerRef != null ? [triggerRef] : []}
      tokens={tokens}
      onKeyDown={onKeyDown}
      {...rest}
      style={{
        padding: t.space[2],
        minWidth: 180,
        background: t.color.surfaceRaised,
        border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.md,
        boxShadow: t.shadow.panel,
      }}
    >
      {items.map((entry) => {
        if (entry.type === "separator") {
          return (
            <div
              key={entry.key}
              role="separator"
              style={{
                height: 1,
                margin: `${t.space[2]} 0`,
                background: t.color.borderSubtle,
              }}
            />
          );
        }
        if (entry.type === "label") {
          return (
            <div
              key={entry.key}
              // A group heading, not an item: `presentation` keeps it out of
              // the item count a screen reader announces ("3 of 5").
              role="presentation"
              style={{
                padding: `${t.space[3]} ${t.space[4]} ${t.space[2]}`,
                fontSize: t.fontSize.xs,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: t.color.textFaint,
              }}
            >
              {entry.label}
            </div>
          );
        }

        actionIndex += 1;
        const index = actionIndex;
        const tone = entry.tone != null ? toneColors(entry.tone, t.color) : null;
        const highlighted = active === index;

        return (
          <button
            key={entry.key}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            // -1 so the menu keeps one tab stop; focus is moved with the
            // arrow keys instead.
            tabIndex={-1}
            onClick={() => choose(entry)}
            onMouseEnter={() => setActive(index)}
            style={{
              display: "flex",
              alignItems: entry.description != null ? "flex-start" : "center",
              gap: t.space[4],
              width: "100%",
              padding: `${t.space[3]} ${t.space[4]}`,
              border: "none",
              borderRadius: t.radius.sm,
              background: highlighted ? t.color.accentTint : "transparent",
              color:
                entry.disabled === true
                  ? t.color.textFaint
                  : tone != null
                    ? tone.fg
                    : t.color.text,
              font: "inherit",
              fontSize: t.fontSize.md,
              textAlign: "left",
              cursor: entry.disabled === true ? "not-allowed" : "pointer",
              outline: "none",
            }}
          >
            {entry.icon != null && <Icon name={entry.icon} style={{ marginTop: 2 }} />}
            <span style={{ display: "grid", gap: 1, flex: 1, minWidth: 0 }}>
              <span>{entry.label}</span>
              {entry.description != null && (
                <span style={{ fontSize: t.fontSize.sm, color: t.color.textMuted }}>
                  {entry.description}
                </span>
              )}
            </span>
            {entry.shortcut != null && (
              <span
                aria-hidden="true"
                style={{
                  fontSize: t.fontSize.sm,
                  color: t.color.textFaint,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {entry.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </Popover>
  );
}
