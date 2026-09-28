/**
 * The same dropdown, for several answers.
 *
 * Separate from `Select` rather than a `multiple` prop, because almost
 * everything about the interaction differs: the list stays open on click,
 * Space toggles instead of choosing, the trigger has to summarise rather than
 * name, and there is a select-all. A `multiple` flag would make every branch
 * of `Select` conditional, which is how the estate's one dropdown that does
 * both ended up closing after the first pick in multi mode.
 *
 * `aria-multiselectable` on the listbox is what tells a screen reader that
 * picking one thing does not unpick another — without it, a user has no way
 * to know the list behaves differently from a single select.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle, inputStyle } from "../core/recipes.js";
import { Checkbox } from "./Checkbox.js";
import { Field } from "./Field.js";
import { Icon } from "./Icon.js";
import { Popover } from "./Popover.js";
import { nextIndex, type NavKey } from "./listNavigation.js";
import {
  filterOptions,
  groupOptions,
  summariseSelection,
  type SelectOption,
} from "./selectOptions.js";

const NAV_KEYS = ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"];

export interface MultiSelectProps<V extends string = string> {
  options: SelectOption<V>[];
  values: V[];
  onValuesChange: (values: V[]) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  labelVariant?: "label" | "plain";
  inline?: boolean;
  optional?: boolean;
  placeholder?: string;
  searchable?: boolean;
  /** "Select all" and "Clear" at the foot of the list. */
  bulk?: boolean;
  /** How many selections are named before the trigger switches to a count. */
  maxNamed?: number;
  /** The word after the count: "3 workstreams" rather than "3 selected". */
  noun?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  id?: string;
  empty?: React.ReactNode;
  tokens?: DechoTokenSet;
}

export function MultiSelect<V extends string = string>({
  options,
  values,
  onValuesChange,
  label,
  hint,
  error,
  labelVariant = "plain",
  inline = false,
  optional = false,
  placeholder = "Any",
  searchable = false,
  bulk = false,
  maxNamed = 2,
  noun,
  size = "md",
  disabled = false,
  id,
  empty,
  tokens,
}: MultiSelectProps<V>): React.ReactElement {
  const t = resolveTokens(tokens);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(-1);
  const [focused, setFocused] = React.useState(false);
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
  const chosen = new Set<V>(values);
  const summary = summariseSelection(options, values, { maxNamed, ...(noun != null ? { noun } : {}) });

  const optionId = (index: number): string => `${base}-option-${index}`;

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(-1);
      return;
    }
    if (searchable) {
      const handle = window.setTimeout(() => search.current?.focus(), 0);
      return () => window.clearTimeout(handle);
    }
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (index: number): void => {
    const option = visible[index];
    if (option == null || option.disabled === true) {
      return;
    }
    // A new array, and order preserved by option order rather than by click
    // order: a filter chip list that reshuffles as you tick things is
    // impossible to scan.
    const next = options
      .filter((candidate) =>
        candidate.value === option.value
          ? !chosen.has(option.value)
          : chosen.has(candidate.value),
      )
      .map((candidate) => candidate.value);
    onValuesChange(next);
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
    // Space toggles and Enter closes: the two things a multi-select needs that
    // a single select does not have to distinguish.
    if (event.key === " " && active >= 0) {
      event.preventDefault();
      toggle(active);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const selectableValues = visible
    .filter((option) => option.disabled !== true)
    .map((option) => option.value);

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
                color: values.length === 0 ? t.color.textFaint : t.color.text,
              }}
            >
              {values.length === 0 ? placeholder : summary}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: t.space[2] }}>
              {values.length > maxNamed && (
                <span
                  aria-hidden="true"
                  style={{
                    padding: "0 5px",
                    borderRadius: t.radius.pill,
                    background: t.color.accentTint,
                    color: t.color.accent,
                    fontSize: t.fontSize.xs,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {values.length}
                </span>
              )}
              <Icon name={open ? "chevronUp" : "chevronDown"} style={{ color: t.color.textMuted }} />
            </span>
          </button>

          <Popover
            open={open}
            onClose={() => setOpen(false)}
            anchor={trigger}
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
                  aria-label="Filter options"
                  aria-controls={listId}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(-1);
                  }}
                  onKeyDown={onKeyDown}
                  style={{ ...inputStyle({ tokens }), fontSize: t.fontSize.md }}
                />
              </div>
            )}

            <div
              id={listId}
              role="listbox"
              aria-multiselectable
              aria-label={typeof label === "string" ? label : undefined}
            >
              {visible.length === 0 && (
                <div
                  style={{
                    padding: t.space[4],
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
                    return (
                      /*
                        eslint-disable-next-line jsx-a11y/click-events-have-key-events,
                        jsx-a11y/interactive-supports-focus --
                        The combobox pattern: focus stays on the trigger and the
                        options are named by `aria-activedescendant`, so they
                        must not be focusable. Same reasoning as `Select`, where
                        it is written out in full.
                      */
                      <div
                        key={option.value}
                        id={optionId(index)}
                        role="option"
                        aria-selected={chosen.has(option.value)}
                        aria-disabled={option.disabled === true ? true : undefined}
                        onClick={() => toggle(index)}
                        onMouseEnter={() => setActive(index)}
                        style={{
                          padding: `${t.space[2]} ${t.space[4]}`,
                          borderRadius: t.radius.sm,
                          background: active === index ? t.color.accentTint : "transparent",
                          cursor: option.disabled === true ? "not-allowed" : "pointer",
                        }}
                      >
                        {/*
                          The checkbox is decoration here: the row is the
                          option and carries `aria-selected`, so the checkbox
                          must not be a second focusable, announcing control.
                        */}
                        <span aria-hidden="true" style={{ pointerEvents: "none" }}>
                          <Checkbox
                            label={option.label}
                            description={option.description}
                            checked={chosen.has(option.value)}
                            disabled={option.disabled}
                            size={size}
                            tabIndex={-1}
                            tokens={tokens}
                          />
                        </span>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}

              {bulk && visible.length > 0 && (
                <>
                  <div
                    role="separator"
                    style={{ height: 1, margin: `${t.space[2]} 0`, background: t.color.borderSubtle }}
                  />
                  <div style={{ display: "flex", gap: t.space[2] }}>
                    <BulkButton
                      onClick={() => onValuesChange(selectableValues)}
                      disabled={selectableValues.every((value) => chosen.has(value))}
                      tokens={tokens}
                    >
                      {searchable && query !== "" ? "Select matches" : "Select all"}
                    </BulkButton>
                    <BulkButton
                      onClick={() => onValuesChange([])}
                      disabled={values.length === 0}
                      tokens={tokens}
                    >
                      Clear
                    </BulkButton>
                  </div>
                </>
              )}
            </div>
          </Popover>
        </>
      )}
    </Field>
  );
}

function BulkButton({
  onClick,
  disabled,
  tokens,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  tokens?: DechoTokenSet;
  children: React.ReactNode;
}): React.ReactElement {
  const t = resolveTokens(tokens);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: `${t.space[3]} ${t.space[4]}`,
        border: "none",
        borderRadius: t.radius.sm,
        background: "transparent",
        color: disabled ? t.color.textFaint : t.color.accent,
        font: "inherit",
        fontSize: t.fontSize.sm,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
