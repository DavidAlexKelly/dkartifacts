/**
 * A value you can edit in place.
 *
 * The estate's `EditableField`, and the pattern the requirements editor
 * rebuilds per field: show the value, click it, type, commit or cancel.
 *
 * Idle, it is a `<button>`. That is the whole accessibility of this component
 * in one decision: a `<div>` that becomes an input when clicked is invisible
 * to a keyboard and unannounced to a reader, whereas a button says "edit
 * Owner, button" and responds to Enter. The original was a div.
 *
 * Keys while editing: Enter commits (Ctrl/Cmd+Enter when `multiline`), Escape
 * cancels and restores the previous value, and blur commits — because losing
 * an edit to a stray click is the complaint that gets filed about every one of
 * these, and re-typing is worse than an unintended save you can see and undo.
 */

import React, { useEffect, useRef, useState } from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";

export interface EditableFieldProps
  extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "onChange" | "children" | "onBlur"
  > {
  value: string;
  /** Called with the new value when an edit is committed and changed. */
  onCommit: (next: string) => void;
  /** What this field is. Required: it is the button's accessible name. */
  label: string;
  /** Shown, muted, when the value is empty. */
  placeholder?: string;
  multiline?: boolean;
  /** Blocks editing and drops the affordance. */
  readOnly?: boolean;
  /** Reject or transform before committing. Return null to refuse. */
  validate?: (next: string) => string | null;
  tokens?: DechoTokenSet;
}

export function EditableField({
  value,
  onCommit,
  label,
  placeholder = "Empty",
  multiline = false,
  readOnly = false,
  validate,
  tokens,
  style,
  ...rest
}: EditableFieldProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // A value that changes underneath — another user's edit arriving — must not
  // clobber what is being typed, so this only re-syncs while idle.
  useEffect(() => {
    if (!editing) {setDraft(value);}
  }, [value, editing]);

  useEffect(() => {
    if (editing) {inputRef.current?.focus();}
  }, [editing]);

  const commit = () => {
    const next = validate != null ? validate(draft) : draft;
    if (next == null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setEditing(false);
    if (next !== value) {onCommit(next);}
  };

  const cancel = () => {
    setDraft(value);
    setInvalid(false);
    setEditing(false);
  };

  const shared: React.CSSProperties = {
    width: "100%",
    padding: `${t.space[2]} ${t.space[2]}`,
    backgroundColor: t.color.surface,
    border: `1px solid ${invalid ? t.color.danger : t.color.accent}`,
    borderRadius: t.radius.sm,
    color: t.color.text,
    fontFamily: t.fontFamily.sans,
    fontSize: t.fontSize.md,
    lineHeight: 1.45,
  };

  if (editing && !readOnly) {
    const onKeyDown = (
      e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
      if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commit();
      }
    };

    return (
      <div {...rest} style={style}>
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            aria-label={label}
            aria-invalid={invalid}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            style={{ ...shared, resize: "vertical" }}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={draft}
            aria-label={label}
            aria-invalid={invalid}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            style={shared}
          />
        )}
        <div
          style={{
            marginTop: 3,
            fontSize: t.fontSize.xs,
            color: invalid ? t.color.danger : t.color.textFaint,
          }}
        >
          {invalid
            ? "That value is not allowed"
            : multiline
              ? "⌘/Ctrl+Enter saves · Escape cancels"
              : "Enter saves · Escape cancels"}
        </div>
      </div>
    );
  }

  const empty = value.trim() === "";

  if (readOnly) {
    return (
      <div
        {...rest}
        style={{
          fontFamily: t.fontFamily.sans,
          fontSize: t.fontSize.md,
          color: empty ? t.color.textFaint : t.color.text,
          ...style,
        }}
      >
        {empty ? placeholder : value}
      </div>
    );
  }

  return (
    <div {...rest} style={style}>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${label}`}
        style={{
          width: "100%",
          textAlign: "left",
          padding: `${t.space[2]} ${t.space[2]}`,
          background: "none",
          // A dashed underline rather than a full border: it has to read as
          // editable without making a page of these look like a form.
          border: "1px solid transparent",
          borderBottom: `1px dashed ${t.color.border}`,
          borderRadius: t.radius.sm,
          color: empty ? t.color.textFaint : t.color.text,
          fontFamily: t.fontFamily.sans,
          fontSize: t.fontSize.md,
          lineHeight: 1.45,
          cursor: "text",
          whiteSpace: multiline ? "pre-wrap" : undefined,
        }}
      >
        {empty ? placeholder : value}
      </button>
    </div>
  );
}
