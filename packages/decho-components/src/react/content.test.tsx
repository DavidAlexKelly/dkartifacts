/**
 * The long tail: Markdown, the chat, the editable field, the person, the demo
 * badge, the code block.
 *
 * `SimpleMarkdown` gets the most attention here and deserves it: it renders a
 * string that arrived from a language model, so the tests that matter are the
 * ones about what it refuses to do. The estate's renderers used
 * `dangerouslySetInnerHTML`; these assertions are what replaces the review
 * that should have caught that.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import React from "react";
import {
  ChatPanel,
  CodeBlock,
  DemoDataBadge,
  EditableField,
  SimpleMarkdown,
  UserName,
} from "./index.js";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("SimpleMarkdown, on what it refuses", () => {
  it("renders HTML in the source as text, not as HTML", () => {
    const markup = html(
      <SimpleMarkdown>{`<img src=x onerror="alert(1)">`}</SimpleMarkdown>,
    );
    // The point is that it is escaped, not that the characters are absent:
    // "onerror=" DOES appear — as text, inside an escaped `&lt;img …&gt;`,
    // which is a string on the page and not an attribute on an element.
    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;img");
    expect(markup).toContain("&lt;img src=x onerror=");
  });

  it("refuses a javascript: link and shows its source instead", () => {
    const markup = html(
      <SimpleMarkdown>{`[click](javascript:alert(1))`}</SimpleMarkdown>,
    );
    // Again: the scheme appears as text, because the refusal is to render the
    // link, not to conceal what the model wrote. What must not exist is an
    // anchor pointing at it.
    expect(markup).not.toContain("href=");
    expect(markup).not.toContain("<a ");
    expect(markup).toContain("[click]");
  });

  it("refuses a data: link too", () => {
    const markup = html(
      <SimpleMarkdown>{`[x](data:text/html;base64,PHNjcmlwdD4=)`}</SimpleMarkdown>,
    );
    expect(markup).not.toContain("<a ");
  });

  it("allows http and https, with noopener and noreferrer", () => {
    const markup = html(
      <SimpleMarkdown>{`[docs](https://example.com/a)`}</SimpleMarkdown>,
    );
    expect(markup).toContain('href="https://example.com/a"');
    expect(markup).toContain('rel="noopener noreferrer"');
  });
});

describe("SimpleMarkdown, on what it supports", () => {
  it("renders headings under the level it is given, not as h1", () => {
    const markup = html(
      <SimpleMarkdown baseHeadingLevel={3}>{"# Findings"}</SimpleMarkdown>,
    );
    expect(markup).toContain("<h3");
    expect(markup).not.toContain("<h1");
  });

  it("makes one list out of consecutive bullets", () => {
    const markup = html(
      <SimpleMarkdown>{"- one\n- two\n- three"}</SimpleMarkdown>,
    );
    expect(markup.match(/<ul/g) ?? []).toHaveLength(1);
    expect(markup.match(/<li/g) ?? []).toHaveLength(3);
  });

  it("tells an ordered list from an unordered one", () => {
    expect(html(<SimpleMarkdown>{"1. one\n2. two"}</SimpleMarkdown>)).toContain(
      "<ol",
    );
  });

  it("takes a fenced block verbatim, Markdown syntax and all", () => {
    const markup = html(
      <SimpleMarkdown>{"```\n- not a list\n**not bold**\n```"}</SimpleMarkdown>,
    );
    expect(markup).toContain("<pre");
    expect(markup).toContain("**not bold**");
    expect(markup).not.toContain("<strong");
  });

  it("handles bold, italic and inline code", () => {
    const markup = html(
      <SimpleMarkdown>{"**b** and *i* and `c`"}</SimpleMarkdown>,
    );
    expect(markup).toContain("<strong");
    expect(markup).toContain("<em");
    expect(markup).toContain("<code");
  });

  it("survives an empty string", () => {
    expect(html(<SimpleMarkdown>{""}</SimpleMarkdown>)).toContain("<div");
  });

  it("renders an unterminated marker as the text it is", () => {
    const markup = html(<SimpleMarkdown>{"**never closed"}</SimpleMarkdown>);
    expect(markup).not.toContain("<strong");
    expect(markup).toContain("**never closed");
  });

  /**
   * The reason the inline pass is a hand-written scanner and not a regex: the
   * input is model output, so it is untrusted and unbounded, and the code
   * scanner rejects alternation run in a loop over such a string.
   *
   * A timing assertion would be flaky on shared CI, so this asserts the thing
   * that actually matters — that pathological input terminates and produces
   * text. With a backtracking pattern this input is where it would hang.
   */
  it("handles pathological input without backtracking", () => {
    const pathological = `${"*".repeat(20000)}text`;
    const markup = html(<SimpleMarkdown>{pathological}</SimpleMarkdown>);
    expect(markup).toContain("text");
  });
});

describe("ChatPanel", () => {
  const messages = [
    { id: "1", role: "user" as const, content: "Which objects are at risk?" },
    { id: "2", role: "assistant" as const, content: "**Three** are." },
  ];

  it("is a live log, so a reply is announced when it arrives", () => {
    const markup = html(<ChatPanel messages={messages} />);
    expect(markup).toContain('role="log"');
    expect(markup).toContain('aria-live="polite"');
  });

  it("states who said what, rather than leaving it to the alignment", () => {
    const markup = html(<ChatPanel messages={messages} />);
    expect(markup).toContain("You said:");
    expect(markup).toContain("Assistant said:");
  });

  it("renders the assistant's Markdown and the user's text as text", () => {
    const markup = html(
      <ChatPanel
        messages={[
          { id: "1", role: "user", content: "**not markdown from me**" },
          { id: "2", role: "assistant", content: "**markdown from it**" },
        ]}
      />,
    );
    expect(markup).toContain(">markdown from it</strong>");
    expect(markup).toContain("**not markdown from me**");
  });

  it("disables the composer while a request is in flight, and says why", () => {
    const markup = html(<ChatPanel messages={messages} busy />);
    expect(markup).toContain("disabled");
    expect(markup).toContain("Waiting for an answer");
    expect(markup).toContain('aria-busy="true"');
  });

  it("says something useful when nothing has been asked", () => {
    const markup = html(<ChatPanel messages={[]} />);
    expect(markup).toContain("Nothing asked yet");
    // And it warns that the answers are generated, which is the caveat a chat
    // over customer data should carry on its face.
    expect(markup).toContain("generated");
  });

  it("offers suggestions only on an empty transcript", () => {
    expect(
      html(<ChatPanel messages={[]} suggestions={["What changed?"]} />),
    ).toContain("What changed?");
    expect(
      html(<ChatPanel messages={messages} suggestions={["What changed?"]} />),
    ).not.toContain("What changed?");
  });
});

describe("EditableField", () => {
  it("is a button when idle, so it can be reached and announced", () => {
    const markup = html(
      <EditableField value="Sustainment" label="Workstream" onCommit={() => {}} />,
    );
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Edit Workstream"');
  });

  it("shows a placeholder for an empty value rather than nothing at all", () => {
    const markup = html(
      <EditableField value="" label="Owner" placeholder="Unassigned" onCommit={() => {}} />,
    );
    expect(markup).toContain("Unassigned");
  });

  it("drops the affordance entirely when read-only", () => {
    const markup = html(
      <EditableField value="x" label="Owner" readOnly onCommit={() => {}} />,
    );
    expect(markup).not.toContain("<button");
  });
});

describe("UserName", () => {
  it("says who, and does not draw an empty chip for a missing name", () => {
    expect(html(<UserName name="Ada Lovelace" />)).toContain("Ada Lovelace");
    expect(html(<UserName id="u-1" />)).toContain("Unknown user");
  });

  it("initials a full name, a single name and an email the same way", () => {
    expect(html(<UserName name="Ada Lovelace" />)).toContain("AL");
    expect(html(<UserName name="Ada" />)).toContain("AD");
    expect(html(<UserName name="ada.lovelace@example.com" />)).toContain("AL");
  });

  it("gives the same person the same colour every time", () => {
    const a = html(<UserName name="Ada Lovelace" id="u-1" />);
    const b = html(<UserName name="Ada Lovelace" id="u-1" meta="Owner" />);
    const colour = /var\(--decho-chart-series\d+, #[0-9a-f]{6}\)/.exec(a)?.[0];
    expect(colour).toBeDefined();
    expect(b).toContain(colour);
  });

  it("keeps the name for a reader when only the avatar is drawn", () => {
    const markup = html(<UserName name="Ada Lovelace" avatarOnly />);
    expect(markup).toContain("Ada Lovelace");
    expect(markup).toContain('aria-hidden="true"');
  });
});

describe("DemoDataBadge", () => {
  it("is announced, and carries its reason into its accessible name", () => {
    const markup = html(
      <DemoDataBadge reason="figures are illustrative; 40-object sample" />,
    );
    expect(markup).toContain('role="note"');
    expect(markup).toContain(
      'aria-label="Demo data: figures are illustrative; 40-object sample"',
    );
  });
});

describe("CodeBlock", () => {
  it("names its copy button after the thing being copied", () => {
    const markup = html(
      <CodeBlock code="npm install @acc/decho-components" label="the install command" />,
    );
    expect(markup).toContain('aria-label="Copy the install command"');
  });

  it("renders the code as text in a pre", () => {
    const markup = html(<CodeBlock code={'<script>alert(1)</script>'} />);
    expect(markup).toContain("<pre");
    expect(markup).not.toContain("<script");
  });
});
