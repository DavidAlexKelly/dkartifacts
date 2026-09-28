/**
 * Collapsible sections, and one on its own.
 *
 * `Panel` is a box with a fixed header; `Tabs` shows one of several. Neither
 * covers "a long form in five sections, three of which are usually irrelevant",
 * which is what every configuration panel in the estate is — and what each one
 * has hand-rolled with a `useState` and a rotated character.
 *
 * NOT `<details>`
 * --------------
 * Tempting: it is collapsible with no JavaScript. But its open state cannot be
 * controlled (only defaulted), it cannot animate, `<summary>` refuses most
 * layout, and a group of them cannot be made exclusive. The ARIA disclosure
 * pattern — a button with `aria-expanded` controlling a region — is a few more
 * lines and does all four.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle } from "../core/recipes.js";
import { Icon } from "./Icon.js";

export interface AccordionSection {
  key: string;
  title: React.ReactNode;
  /** Right of the title: a count, a status chip, a warning. */
  meta?: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface AccordionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  sections: AccordionSection[];
  /** Controlled: the keys that are open. */
  open?: string[];
  onOpenChange?: (open: string[]) => void;
  /** Uncontrolled starting state. */
  defaultOpen?: string[];
  /** One at a time. */
  exclusive?: boolean;
  /** Each section in its own bordered box rather than separated by rules. */
  boxed?: boolean;
  tokens?: DechoTokenSet;
}

export function Accordion({
  sections,
  open,
  onOpenChange,
  defaultOpen = [],
  exclusive = false,
  boxed = false,
  tokens,
  style,
  ...rest
}: AccordionProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [internal, setInternal] = React.useState<string[]>(defaultOpen);
  const controlled = open != null;
  const openKeys = controlled ? open : internal;
  const base = React.useId();

  const toggle = (key: string): void => {
    const isOpen = openKeys.includes(key);
    const next = exclusive
      ? isOpen
        ? []
        : [key]
      : isOpen
        ? openKeys.filter((candidate) => candidate !== key)
        : [...openKeys, key];
    if (!controlled) {
      setInternal(next);
    }
    onOpenChange?.(next);
  };

  return (
    <div
      {...rest}
      style={{
        display: "grid",
        gap: boxed ? t.space[4] : 0,
        fontFamily: t.fontFamily.sans,
        ...style,
      }}
    >
      {sections.map((section, index) => {
        const isOpen = openKeys.includes(section.key);
        const headerId = `${base}-${section.key}-header`;
        const regionId = `${base}-${section.key}-region`;
        return (
          <div
            key={section.key}
            style={{
              border: boxed ? `1px solid ${t.color.borderSubtle}` : undefined,
              borderRadius: boxed ? t.radius.md : undefined,
              borderTop: boxed ? undefined : index === 0 ? undefined : `1px solid ${t.color.borderSubtle}`,
              background: boxed ? t.color.surface : undefined,
              overflow: "hidden",
            }}
          >
            <SectionHeaderButton
              id={headerId}
              controls={regionId}
              open={isOpen}
              disabled={section.disabled === true}
              title={section.title}
              meta={section.meta}
              onClick={() => toggle(section.key)}
              tokens={tokens}
            />
            {/*
              Unmounted when closed rather than hidden. A closed section that
              is still mounted keeps its subscriptions, its timers and its
              scroll listeners — and a panel of five heavy sections then costs
              five sections' worth of work to show one.
            */}
            {isOpen && (
              <div
                id={regionId}
                role="region"
                aria-labelledby={headerId}
                style={{
                  padding: `${t.space[2]} ${boxed ? t.space[5] : 0} ${t.space[5]}`,
                  fontSize: t.fontSize.md,
                  color: t.color.text,
                }}
              >
                {section.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectionHeaderButton({
  id,
  controls,
  open,
  disabled,
  title,
  meta,
  onClick,
  tokens,
}: {
  id: string;
  controls: string;
  open: boolean;
  disabled: boolean;
  title: React.ReactNode;
  meta?: React.ReactNode;
  onClick: () => void;
  tokens?: DechoTokenSet;
}): React.ReactElement {
  const t = resolveTokens(tokens);
  const [focused, setFocused] = React.useState(false);
  return (
    <button
      id={id}
      type="button"
      aria-expanded={open}
      // Only points at the region when the region exists: a reference to a
      // removed element is a broken relationship, not an absent one.
      aria-controls={open ? controls : undefined}
      disabled={disabled}
      onClick={onClick}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: t.space[4],
        width: "100%",
        padding: `${t.space[4]} ${t.space[5]}`,
        border: "none",
        background: "transparent",
        color: disabled ? t.color.textFaint : t.color.text,
        font: "inherit",
        fontSize: t.fontSize.md,
        fontWeight: 500,
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        outline: "none",
        ...(focused ? focusRingStyle({ tokens }) : {}),
      }}
    >
      <Icon
        name="chevronRight"
        size={13}
        style={{
          color: t.color.textMuted,
          transform: open ? "rotate(90deg)" : "none",
          transition: t.effect.transition,
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>{title}</span>
      {meta != null && (
        <span style={{ display: "flex", alignItems: "center", gap: t.space[3] }}>{meta}</span>
      )}
    </button>
  );
}
