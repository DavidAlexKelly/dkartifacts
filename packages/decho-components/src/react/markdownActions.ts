/**
 * What the markdown toolbar does to a selection.
 *
 * Pure, and in its own module: the selection arithmetic is the only part of
 * `MarkdownEditor` that can be wrong in a way a render test would not catch,
 * and a file exporting both a component and a function breaks fast refresh.
 *
 * See `MarkdownEditor.tsx` for why this package has a markdown editor rather
 * than a rich text editor.
 */

import type { DechoIconName } from "./Icon.js";

/** What a toolbar button does to the selection. */
export interface MarkdownAction {
  key: string;
  label: string;
  icon?: DechoIconName;
  /** Shown when there is no icon. */
  text?: string;
  /** Wraps the selection: `**` for bold. */
  wrap?: string;
  /** Prefixes each selected line: `- ` for a list. */
  prefix?: string;
  /** What to insert when nothing is selected. */
  placeholder?: string;
}

export const MARKDOWN_ACTIONS: MarkdownAction[] = [
  { key: "bold", label: "Bold", text: "B", wrap: "**", placeholder: "bold text" },
  { key: "italic", label: "Italic", text: "I", wrap: "_", placeholder: "italic text" },
  { key: "code", label: "Code", text: "‹›", wrap: "`", placeholder: "code" },
  { key: "bullet", label: "Bulleted list", text: "•", prefix: "- " },
  { key: "number", label: "Numbered list", text: "1.", prefix: "1. " },
  { key: "quote", label: "Quote", text: "❝", prefix: "> " },
  { key: "link", label: "Link", icon: "externalLink", wrap: "[](url)", placeholder: "text" },
];

/** Apply an action to a value and a selection; pure, so it is testable. */
export function applyMarkdownAction(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: MarkdownAction,
): { value: string; selectionStart: number; selectionEnd: number } {
  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);

  if (action.prefix != null) {
    // Line-based: every line in the selection, or the current line.
    const lineStart = before.lastIndexOf("\n") + 1;
    const head = value.slice(0, lineStart);
    const body = value.slice(lineStart, selectionEnd === selectionStart ? value.length : selectionEnd);
    const rest = value.slice(lineStart + body.length);
    const lines = body.split("\n");
    const prefixed = lines.map((line) => (line.startsWith(action.prefix ?? "") ? line : `${action.prefix}${line}`));
    const next = `${head}${prefixed.join("\n")}${rest}`;
    const added = next.length - value.length;
    return { value: next, selectionStart: selectionStart + added, selectionEnd: selectionEnd + added };
  }

  const wrap = action.wrap ?? "";
  if (wrap === "[](url)") {
    const text = selected === "" ? (action.placeholder ?? "") : selected;
    const next = `${before}[${text}](url)${after}`;
    // Select "url", which is the bit that has to be replaced next.
    const urlStart = before.length + text.length + 3;
    return { value: next, selectionStart: urlStart, selectionEnd: urlStart + 3 };
  }

  if (selected === "") {
    const text = action.placeholder ?? "";
    return {
      value: `${before}${wrap}${text}${wrap}${after}`,
      selectionStart: before.length + wrap.length,
      selectionEnd: before.length + wrap.length + text.length,
    };
  }

  /*
    Whitespace stays OUTSIDE the markers.

    Double-clicking a word selects the trailing space in every browser, and
    `**cutover **` is not emphasis in CommonMark — the closing marker has to
    be preceded by a non-space — so the user gets literal asterisks and no
    bold. Trimming the selection into the wrap is the difference between a
    toolbar that works on a double-clicked word and one that does not.
  */
  const leading = selected.length - selected.trimStart().length;
  const trailing = selected.length - selected.trimEnd().length;
  const core = selected.slice(leading, selected.length - trailing);

  if (core === "") {
    // A selection of nothing but whitespace: treat it as an empty selection
    // rather than wrapping the spaces.
    const text = action.placeholder ?? "";
    return {
      value: `${before}${selected}${wrap}${text}${wrap}${after}`,
      selectionStart: before.length + selected.length + wrap.length,
      selectionEnd: before.length + selected.length + wrap.length + text.length,
    };
  }

  const head = `${before}${selected.slice(0, leading)}`;
  const tail = `${selected.slice(selected.length - trailing)}${after}`;
  return {
    value: `${head}${wrap}${core}${wrap}${tail}`,
    selectionStart: head.length + wrap.length,
    selectionEnd: head.length + wrap.length + core.length,
  };
}

