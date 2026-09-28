/**
 * A markdown editor — and a deliberate refusal to build a rich text editor.
 *
 * WHY THERE IS NO `RichTextEditor` IN THIS PACKAGE
 * ------------------------------------------------
 * Because a good one is TipTap or Lexical, and a bad one is `contentEditable`.
 * The second is a trap: it looks like an afternoon's work and then you are
 * maintaining selection restoration across re-renders, paste sanitisation,
 * undo that survives a controlled value, and a document model that differs
 * between browsers. Nothing in this estate needs WYSIWYG badly enough to buy
 * that, and if something ever does, the answer is a dependency in the
 * application rather than a home-made one here.
 *
 * What the workflows actually need is a comment box that can do bold, a list
 * and a link. That is markdown, this package already renders it
 * (`SimpleMarkdown`), and a `<textarea>` with a toolbar and a preview covers
 * it with no dependency, no selection bugs and no paste sanitisation problem —
 * because the value is always plain text.
 *
 * THE TOOLBAR EDITS THE TEXT, NOT A DOCUMENT
 * ------------------------------------------
 * Each button wraps or prefixes the current selection using the textarea's own
 * `selectionStart`/`selectionEnd`, then restores the selection. That is the
 * whole implementation, and it is why this cannot develop the class of bug
 * that `contentEditable` has.
 */

import React from "react";
import { focusRingStyle, inputStyle, monoStyle } from "../core/recipes.js";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { Icon } from "./Icon.js";
import { SimpleMarkdown } from "./SimpleMarkdown.js";
import {
  MARKDOWN_ACTIONS,
  applyMarkdownAction,
  type MarkdownAction,
} from "./markdownActions.js";

export interface MarkdownEditorProps {
  value: string;
  onValueChange: (value: string) => void;
  label?: React.ReactNode;
  placeholder?: string;
  rows?: number;
  /** Show the Write/Preview switch. */
  preview?: boolean;
  disabled?: boolean;
  maxLength?: number;
  tokens?: DechoTokenSet;
}

export function MarkdownEditor({
  value,
  onValueChange,
  label,
  placeholder = "Markdown is supported",
  rows = 6,
  preview = true,
  disabled = false,
  maxLength,
  tokens,
}: MarkdownEditorProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const area = React.useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = React.useState<"write" | "preview">("write");
  const [focused, setFocused] = React.useState(false);
  const id = React.useId();

  const run = (action: MarkdownAction): void => {
    const element = area.current;
    if (element == null || disabled) {
      return;
    }
    const result = applyMarkdownAction(value, element.selectionStart, element.selectionEnd, action);
    onValueChange(result.value);
    // Restoring the selection after React has re-rendered the value: without
    // this the caret jumps to the end after every toolbar press, which makes
    // the toolbar unusable for anything but the last word.
    window.setTimeout(() => {
      element.focus();
      element.setSelectionRange(result.selectionStart, result.selectionEnd);
    }, 0);
  };

  return (
    <div style={{ display: "grid", gap: t.space[3], fontFamily: t.fontFamily.sans }}>
      {label != null && (
        <label htmlFor={id} style={{ fontSize: t.fontSize.md, color: t.color.text }}>
          {label}
        </label>
      )}

      <div
        style={{
          border: `1px solid ${t.color.border}`,
          borderRadius: t.radius.md,
          background: t.color.bg,
          overflow: "hidden",
          ...(focused ? focusRingStyle({ tokens }) : {}),
        }}
      >
        <div
          role="toolbar"
          aria-label="Formatting"
          aria-controls={id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: t.space[2],
            borderBottom: `1px solid ${t.color.borderSubtle}`,
            background: t.color.surfaceRaised,
          }}
        >
          {MARKDOWN_ACTIONS.map((action) => (
            <button
              key={action.key}
              type="button"
              title={action.label}
              aria-label={action.label}
              disabled={disabled || tab === "preview"}
              onClick={() => run(action)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 24,
                height: 22,
                padding: "0 5px",
                border: "none",
                borderRadius: t.radius.sm,
                background: "transparent",
                color: t.color.textMuted,
                font: "inherit",
                fontSize: t.fontSize.sm,
                fontWeight: action.key === "bold" ? 700 : 400,
                fontStyle: action.key === "italic" ? "italic" : undefined,
                cursor: disabled || tab === "preview" ? "not-allowed" : "pointer",
              }}
            >
              {action.icon != null ? <Icon name={action.icon} size={12} /> : action.text}
            </button>
          ))}

          {preview && (
            <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
              {(["write", "preview"] as const).map((which) => (
                <button
                  key={which}
                  type="button"
                  aria-pressed={tab === which}
                  onClick={() => setTab(which)}
                  style={{
                    padding: `2px ${t.space[3]}`,
                    border: "none",
                    borderRadius: t.radius.sm,
                    background: tab === which ? t.color.accentTint : "transparent",
                    color: tab === which ? t.color.accent : t.color.textMuted,
                    font: "inherit",
                    fontSize: t.fontSize.sm,
                    textTransform: "capitalize",
                    cursor: "pointer",
                  }}
                >
                  {which}
                </button>
              ))}
            </span>
          )}
        </div>

        {tab === "write" ? (
          <textarea
            id={id}
            ref={area}
            value={value}
            rows={rows}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            onChange={(event) => onValueChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              ...inputStyle({ tokens }),
              ...monoStyle({ tokens }),
              display: "block",
              border: "none",
              borderRadius: 0,
              background: "transparent",
              resize: "vertical",
              outline: "none",
              fontSize: t.fontSize.md,
            }}
          />
        ) : (
          <div
            style={{
              padding: `${t.space[4]} ${t.space[4]}`,
              minHeight: rows * 20,
              fontSize: t.fontSize.md,
              color: t.color.text,
            }}
          >
            {value.trim() === "" ? (
              <span style={{ color: t.color.textFaint }}>Nothing to preview</span>
            ) : (
              <SimpleMarkdown tokens={tokens}>{value}</SimpleMarkdown>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
