/**
 * A single-choice dropdown that the theme actually reaches.
 *
 * The gap this fills: a native `<select>` is painted by the operating system.
 * `accent-color` does nothing to it, the option list ignores every token, and
 * on a dark theme it is a white rectangle in the middle of a dark panel. Every
 * filter in the estate is one, which is why the filters are the one part of
 * each widget that does not look like the widget.
 *
 * THE COMBOBOX PATTERN, AND WHY FOCUS STAYS PUT
 * ---------------------------------------------
 * Focus remains on the trigger while the list is open, and the highlighted
 * option is named by `aria-activedescendant`. That is what lets the arrow keys
 * and typeahead keep reaching the trigger's key handler — move focus into the
 * list (as a menu does) and typing goes to the option instead, so typeahead
 * silently stops working. It is also why this is not built on the package's
 * `useDismiss`, which moves focus into the overlay.
 *
 * The searchable variant is the exception: there, focus goes to the search
 * input, which is itself the combobox.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle, inputStyle } from "../core/recipes.js";
import { Field } from "./Field.js";
import { Icon } from "./Icon.js";
import { Popover } from "./Popover.js";
import {
  extendTypeahead,
  isTypeaheadKey,
  nextIndex,
  typeaheadIndex,
  type NavKey,
  type TypeaheadState,
} from "./listNavigation.js";
import { filterOptions, groupOptions, type SelectOption } from "./selectOptions.js";

const NAV_KEYS = ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"];

export interface SelectProps<V extends string = string> {
  options: SelectOption<V>[];
  value: V | null;
  onValueChange: (value: V | null) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  labelVariant?: "label" | "plain";
  inline?: boolean;
  optional?: boolean;
  /** Shown when nothing is chosen. Not an option — see the note below. */
  placeholder?: string;
  /** A filter box inside the list. Worth it past about fifteen options. */
  searchable?: boolean;
  /** Offer "Clear" — for a filter, where "no choice" is a valid state. */
  clearable?: boolean;
  size?: "sm" | "md";
  disabled?: boolean;
  id?: string;
  /** What the empty list says. Defaults to "No matches". */
  empty?: React.ReactNode;
  tokens?: DechoTokenSet;
}

export function Select<V extends string = string>({
  options,
  value,
  onValueChange,
  label,
  hint,
  error,
  labelVariant = "plain",
  inline = false,
  optional = false,
  placeholder = "Choose…",
  searchable = false,
  clearable = false,
  size = "md",
  disabled = false,
  id,
  empty,
  tokens,
}: SelectProps<V>): React.ReactElement {
  const t = resolveTokens(tokens);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(-1);
  const [focused, setFocused] = React.useState(false);
  const typeahead = React.useRef<TypeaheadState | null>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const search = React.useRef<HTMLInputElement>(null);
  const generated = React.useId();
  const base = id ?? generated;
  const listId = `${base}-listbox`;

  const visible = React.useMemo(
    () => (searchable ? filterOptions(options, query) : options),
    [options, query, searchable],
  );
  const groups = React.useMemo(() => groupOptions(visible), [visible]);
  const selected = options.find((option) => option.value === value) ?? null;

  const optionId = (index: number): string => `${base}-option-${index}`;

  // Opening highlights the current selection, not the first item: a keyboard
  // user opening a chosen select and pressing Down expects to move off what
  // is selected, not off the top of the list.
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      typeahead.current = null;
      return;
    }
    const current = visible.findIndex((option) => option.value === value);
    setActive(current);
    if (searchable) {
      // A frame late on purpose: the input does not exist until the popover
      // has rendered.
      const handle = window.setTimeout(() => search.current?.focus(), 0);
      return () => window.clearTimeout(handle);
    }
    return;
    // Only on open/close: recomputing on every keystroke would fight the
    // arrow keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (index: number): void => {
    const option = visible[index];
    if (option == null || option.disabled === true) {
      return;
    }
    onValueChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (!open) {
      if (NAV_KEYS.includes(event.key) || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      const next = nextIndex(visible, active, event.key as NavKey);
      if (next != null) {
        setActive(next);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0) {
        choose(active);
      }
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    // Typeahead on the trigger only. In the searchable variant the keystrokes
    // belong to the search box, and doing both means every letter both filters
    // and jumps.
    if (!searchable && isTypeaheadKey(event.key)) {
      typeahead.current = extendTypeahead(typeahead.current, event.key, Date.now());
      const found = typeaheadIndex(visible, active, typeahead.current.query);
      if (found != null) {
        setActive(found);
      }
    }
  };

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      labelVariant={labelVariant}
      inline={inline}
      id={base}
      tokens={tokens}
    >
      {(aria) => (
        <>
          <button
            {...aria}
            ref={trigger}
            type="button"
            // `combobox` rather than `listbox`: the trigger is the thing with
            // a value, the popover is the list.
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
            disabled={disabled}
            onClick={() => setOpen((was) => !was)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              ...inputStyle({ tokens, invalid: error != null }),
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: t.space[3],
              padding: size === "sm" ? `3px ${t.space[3]}` : `5px ${t.space[4]}`,
              textAlign: "left",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.55 : 1,
              ...(focused ? focusRingStyle({ tokens }) : {}),
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                // The placeholder is faint text, not a disabled option in the
                // list. A `<option value="">` placeholder is selectable, which
                // means "Choose…" can be chosen — and then submitted.
                color: selected == null ? t.color.textFaint : t.color.text,
              }}
            >
              {selected?.label ?? placeholder}
            </span>
            <Icon name={open ? "chevronUp" : "chevronDown"} style={{ color: t.color.textMuted }} />
          </button>

          <Popover
            open={open}
            onClose={() => setOpen(false)}
            anchor={trigger}
            align="start"
            matchAnchorWidth
            role="none"
            bare
            dismissRefs={[trigger]}
            tokens={tokens}
            style={{
              padding: t.space[2],
              background: t.color.surfaceRaised,
              border: `1px solid ${t.color.border}`,
              borderRadius: t.radius.md,
              boxShadow: t.shadow.panel,
            }}
          >
            {searchable && (
              <div style={{ padding: t.space[2] }}>
                <input
                  ref={search}
                  type="search"
                  value={query}
                  placeholder="Filter…"
                  role="combobox"
                  aria-expanded
                  aria-controls={listId}
                  aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                  aria-label="Filter options"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(-1);
                  }}
                  onKeyDown={onKeyDown}
                  style={{ ...inputStyle({ tokens }), fontSize: t.fontSize.md }}
                />
              </div>
            )}

            <div id={listId} role="listbox" aria-label={typeof label === "string" ? label : undefined}>
              {visible.length === 0 && (
                <div
                  style={{
                    padding: `${t.space[4]} ${t.space[4]}`,
                    fontSize: t.fontSize.md,
                    color: t.color.textFaint,
                  }}
                >
                  {empty ?? "No matches"}
                </div>
              )}

              {groups.map((group) => (
                <React.Fragment key={group.name ?? "__ungrouped"}>
                  {group.name != null && (
                    <div
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
                      {group.name}
                    </div>
                  )}
                  {group.options.map((option) => {
                    const index = visible.indexOf(option);
                    const isSelected = option.value === value;
                    return (
                      /*
                        eslint-disable-next-line jsx-a11y/click-events-have-key-events,
                        jsx-a11y/interactive-supports-focus --

                        Both rules are wrong for this pattern, and turning them
                        off here is the correct answer rather than a shortcut.

                        In an `aria-activedescendant` combobox the options are
                        deliberately NOT focusable: focus stays on the trigger,
                        which owns the key handling (see `onKeyDown` above) and
                        names the highlighted option by id. Making each option
                        focusable — which is what the lint asks for — breaks
                        typeahead, because the keystrokes would go to the option
                        rather than to the combobox.

                        The keyboard path is fully implemented; it is simply not
                        on this element. ARIA APG, "Select-Only Combobox".
                      */
                      <div
                        key={option.value}
                        id={optionId(index)}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled === true ? true : undefined}
                        onClick={() => choose(index)}
                        onMouseEnter={() => setActive(index)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: t.space[3],
                          padding: `${t.space[3]} ${t.space[4]}`,
                          borderRadius: t.radius.sm,
                          background: active === index ? t.color.accentTint : "transparent",
                          color:
                            option.disabled === true ? t.color.textFaint : t.color.text,
                          cursor: option.disabled === true ? "not-allowed" : "pointer",
                        }}
                      >
                        <span style={{ display: "grid", gap: 1, flex: 1, minWidth: 0 }}>
                          <span>{option.label}</span>
                          {option.description != null && (
                            <span style={{ fontSize: t.fontSize.sm, color: t.color.textMuted }}>
                              {option.description}
                            </span>
                          )}
                        </span>
                        {isSelected && (
                          <Icon name="check" style={{ color: t.color.accent }} />
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}

              {clearable && value != null && (
                <>
                  <div
                    role="separator"
                    style={{ height: 1, margin: `${t.space[2]} 0`, background: t.color.borderSubtle }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onValueChange(null);
                      setOpen(false);
                      trigger.current?.focus();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: t.space[3],
                      width: "100%",
                      padding: `${t.space[3]} ${t.space[4]}`,
                      border: "none",
                      borderRadius: t.radius.sm,
                      background: "transparent",
                      color: t.color.textMuted,
                      font: "inherit",
                      fontSize: t.fontSize.md,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <Icon name="close" size={12} />
                    Clear selection
                  </button>
                </>
              )}
            </div>
          </Popover>
        </>
      )}
    </Field>
  );
}
