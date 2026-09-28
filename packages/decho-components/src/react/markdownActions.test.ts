/**
 * The markdown toolbar's selection arithmetic.
 *
 * Worth testing because it is the one part of a textarea-based editor that can
 * be subtly wrong: the text comes out right and the caret ends up somewhere
 * useless, which makes the toolbar unusable for a second press without anyone
 * being able to say why.
 */

import { describe, expect, it } from "vitest";
import { MARKDOWN_ACTIONS, applyMarkdownAction, type MarkdownAction } from "./markdownActions.js";

const action = (key: string): MarkdownAction => {
  const found = MARKDOWN_ACTIONS.find((candidate) => candidate.key === key);
  if (found == null) {
    throw new Error(`no action ${key}`);
  }
  return found;
};

describe("applyMarkdownAction", () => {
  it("wraps the selection and keeps it selected", () => {
    // Still selected, so pressing bold twice is visibly a toggle-ish thing
    // rather than leaving the caret stranded after the markers.
    const result = applyMarkdownAction("the cutover date", 4, 11, action("bold"));
    expect(result.value).toBe("the **cutover** date");
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe("cutover");
  });

  it("keeps a double-clicked word's trailing space outside the markers", () => {
    // Every browser includes the trailing space when you double-click a word,
    // and `**cutover **` is not emphasis in CommonMark — the closing marker
    // must be preceded by a non-space. Without trimming, the toolbar produces
    // literal asterisks on the commonest selection there is.
    const result = applyMarkdownAction("the cutover date", 4, 12, action("bold"));
    expect(result.value).toBe("the **cutover** date");
  });

  it("treats a whitespace-only selection as an empty one", () => {
    const result = applyMarkdownAction("a  b", 1, 3, action("bold"));
    expect(result.value).toBe("a  **bold text**b");
  });

  it("inserts a placeholder when nothing is selected, and selects it", () => {
    const result = applyMarkdownAction("", 0, 0, action("italic"));
    expect(result.value).toBe("_italic text_");
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe("italic text");
  });

  it("prefixes every line of a multi-line selection", () => {
    const result = applyMarkdownAction("one\ntwo\nthree", 0, 13, action("bullet"));
    expect(result.value).toBe("- one\n- two\n- three");
  });

  it("does not double a prefix that is already there", () => {
    const result = applyMarkdownAction("- one\ntwo", 0, 9, action("bullet"));
    expect(result.value).toBe("- one\n- two");
  });

  it("prefixes the current line when nothing is selected", () => {
    const result = applyMarkdownAction("one\ntwo", 5, 5, action("quote"));
    expect(result.value).toBe("one\n> two");
  });

  it("selects the url of a new link, which is what gets typed next", () => {
    const result = applyMarkdownAction("see the plan", 8, 12, action("link"));
    expect(result.value).toBe("see the [plan](url)");
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe("url");
  });

  it("leaves the rest of the document alone", () => {
    const before = "start\nmiddle\nend";
    const result = applyMarkdownAction(before, 6, 12, action("code"));
    expect(result.value).toBe("start\n`middle`\nend");
    expect(result.value.startsWith("start\n")).toBe(true);
    expect(result.value.endsWith("\nend")).toBe(true);
  });
});
