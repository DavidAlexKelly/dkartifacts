/**
 * The wiring that makes a labelled control announce itself correctly.
 *
 * This is the whole reason `Field` exists as a component rather than as a
 * convention. A label, a hint and an error message are four lines of markup
 * and one line of `aria-describedby` — and it is always the `aria-describedby`
 * that is missing, because it is the only part you cannot see. Every form in
 * the estate has visible hints that no screen reader ever reads out.
 *
 * Kept separate from `Field.tsx` for the reason the package keeps `useDismiss`
 * separate: a module exporting both a component and a hook breaks fast
 * refresh.
 */

import React from "react";

/** The attributes a control needs in order to be described by its own field. */
export interface FieldAria {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": boolean | undefined;
  "aria-required": boolean | undefined;
  required: boolean | undefined;
}

/**
 * Join the ids a control is described by, dropping the ones that are not there.
 *
 * Pure, and exported, because the empty case is the one that matters:
 * `aria-describedby=""` is not "no description" — it is a broken reference,
 * and some screen readers announce nothing at all for the control.
 */
export function describedBy(ids: (string | false | null | undefined)[]): string | undefined {
  const present = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
  return present.length > 0 ? present.join(" ") : undefined;
}

export interface FieldAriaOptions {
  /** A caller-supplied id. Generated when absent, which is the common case. */
  id?: string;
  /** Whether a hint is being rendered — not the hint itself. */
  hasHint?: boolean;
  /** Whether an error is being rendered. */
  hasError?: boolean;
  required?: boolean;
  /** Extra ids to describe the control with, e.g. a character counter. */
  extraDescribedBy?: (string | false | null | undefined)[];
}

export interface FieldAriaResult {
  /** Spread onto the control. */
  control: FieldAria;
  /** For the `<label htmlFor>`. */
  controlId: string;
  hintId: string;
  errorId: string;
}

/**
 * The ids and ARIA attributes for one field.
 *
 * `aria-invalid` and `aria-required` are `undefined` rather than `false` when
 * they do not apply: React drops an undefined attribute but renders
 * `aria-invalid="false"`, and a control that says out loud that it is *not*
 * invalid on every focus is worse than one that says nothing.
 */
export function useFieldAria(options: FieldAriaOptions = {}): FieldAriaResult {
  const generated = React.useId();
  const base = options.id ?? generated;
  const hintId = `${base}-hint`;
  const errorId = `${base}-error`;

  return {
    controlId: base,
    hintId,
    errorId,
    control: {
      id: base,
      "aria-describedby": describedBy([
        options.hasHint === true && hintId,
        options.hasError === true && errorId,
        ...(options.extraDescribedBy ?? []),
      ]),
      "aria-invalid": options.hasError === true ? true : undefined,
      "aria-required": options.required === true ? true : undefined,
      required: options.required === true ? true : undefined,
    },
  };
}

/**
 * Visually hidden, still announced.
 *
 * `display: none` and `visibility: hidden` both remove text from the
 * accessibility tree, which is the mistake that makes "screen-reader-only"
 * text do nothing at all.
 */
export const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};
