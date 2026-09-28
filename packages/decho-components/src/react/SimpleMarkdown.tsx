/**
 * A small, safe subset of Markdown, for model output.
 *
 * WHY NOT A MARKDOWN LIBRARY
 * --------------------------
 * Because the job is not "render Markdown", it is "render what a language
 * model just said, in a widget, without an HTML injection path". A real parser
 * plus a sanitiser is two dependencies and a security posture; every renderer
 * in this estate instead reached for `dangerouslySetInnerHTML`, which is the
 * one thing that must not happen to a string that arrived from a model that
 * was reading customer data.
 *
 * This builds React elements. There is no `innerHTML` anywhere in it, so an
 * `<img onerror=…>` in the model's answer is text, because that is what it is.
 *
 * WHAT IT SUPPORTS, AND WHY THE LIST STOPS THERE
 * ----------------------------------------------
 * Headings (`#`–`###`), paragraphs, unordered and ordered lists, fenced code
 * blocks, inline code, bold, italic, links, and `---`. That is what the
 * insight chats in the estate actually produce, and each of the rest —
 * tables, footnotes, images, blockquote nesting, HTML passthrough — is either
 * something a model rarely emits here or something that wants a real parser.
 *
 * Links are `http(s)` only. `javascript:` and `data:` URLs in model output are
 * the exact case this is guarding, and an allowlist is the only way to be sure
 * rather than clever.
 */

import React from "react";
import { monoStyle } from "../core/recipes.js";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";

export interface SimpleMarkdownProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** The Markdown. Anything it cannot parse is rendered as text. */
  children: string;
  /** Heading level for `#`, so a chat inside a section does not claim `h1`. */
  baseHeadingLevel?: 2 | 3 | 4;
  tokens?: DechoTokenSet;
}

export function SimpleMarkdown({
  children,
  baseHeadingLevel = 3,
  tokens,
  style,
  ...rest
}: SimpleMarkdownProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const blocks = parseBlocks(children ?? "");

  return (
    <div
      {...rest}
      style={{
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.md,
        lineHeight: 1.55,
        color: t.color.text,
        ...style,
      }}
    >
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading": {
            const level = Math.min(baseHeadingLevel + block.depth - 1, 6);
            const Heading = `h${level}` as "h2" | "h3" | "h4" | "h5" | "h6";
            return (
              <Heading
                key={i}
                style={{
                  margin: i === 0 ? `0 0 ${t.space[2]}` : `${t.space[4]} 0 ${t.space[2]}`,
                  fontSize: block.depth === 1 ? t.fontSize.lg : t.fontSize.md,
                  fontWeight: 600,
                  lineHeight: 1.3,
                }}
              >
                {inline(block.text, t)}
              </Heading>
            );
          }

          case "code":
            return (
              <pre
                key={i}
                style={{
                  ...monoStyle({ tokens }),
                  margin: `${t.space[3]} 0`,
                  padding: t.space[3],
                  backgroundColor: t.color.bg,
                  border: `1px solid ${t.color.borderSubtle}`,
                  borderRadius: t.radius.md,
                  overflowX: "auto",
                  whiteSpace: "pre",
                }}
              >
                {block.text}
              </pre>
            );

          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List
                key={i}
                style={{
                  margin: `${t.space[2]} 0`,
                  paddingLeft: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item, t)}</li>
                ))}
              </List>
            );
          }

          case "rule":
            return (
              <hr
                key={i}
                style={{
                  margin: `${t.space[4]} 0`,
                  border: "none",
                  borderTop: `1px solid ${t.color.borderSubtle}`,
                }}
              />
            );

          default:
            return (
              <p key={i} style={{ margin: i === 0 ? 0 : `${t.space[3]} 0 0` }}>
                {inline(block.text, t)}
              </p>
            );
        }
      })}
    </div>
  );
}

/* ==========================================================================
   Blocks
   ========================================================================== */

type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; depth: number; text: string }
  | { type: "code"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "rule" };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code. Everything to the closing fence is taken verbatim —
    // including Markdown syntax, which is the point of a fence.
    const fence = /^```/.exec(line);
    if (fence != null) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading != null) {
      flush();
      blocks.push({
        type: "heading",
        depth: heading[1].length,
        text: heading[2],
      });
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flush();
      blocks.push({ type: "rule" });
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet != null || numbered != null) {
      flush();
      const ordered = numbered != null;
      const items: string[] = [(bullet ?? numbered)![1]];
      // Consecutive lines of the same kind are one list: a model that emits
      // four bullets means one list, not four.
      while (i + 1 < lines.length) {
        const next = ordered
          ? /^\s*\d+[.)]\s+(.*)$/.exec(lines[i + 1])
          : /^\s*[-*+]\s+(.*)$/.exec(lines[i + 1]);
        if (next == null) {break;}
        items.push(next[1]);
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (line.trim() === "") {
      flush();
      continue;
    }

    paragraph.push(line.trim());
  }

  flush();
  return blocks;
}

/* ==========================================================================
   Inline
   ========================================================================== */

/**
 * `**bold**`, `*italic*`, `` `code` `` and `[text](https://…)`.
 *
 * A hand-written scanner rather than a regex, and that is not stylistic. The
 * input is a string a language model produced, which makes it untrusted input
 * of unbounded length, and a regex with alternation run in a loop over such a
 * string is how a renderer becomes a denial-of-service — the estate's code
 * scanner flags exactly this and was right to.
 *
 * This makes a single left-to-right pass with `indexOf`: every character is
 * examined once, there is no backtracking to reason about, and the cost is
 * linear in the length of the text by construction rather than by argument.
 * An unterminated marker (`**bold` with no closer) is emitted as the text it
 * is, which is also what a reader would expect to see.
 */
function inline(
  text: string,
  t: ReturnType<typeof resolveTokens>,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let plain = "";
  let key = 0;
  let i = 0;

  const flush = () => {
    if (plain !== "") {
      out.push(plain);
      plain = "";
    }
  };

  while (i < text.length) {
    const char = text[i];

    // `code`
    if (char === "`") {
      const close = text.indexOf("`", i + 1);
      if (close > i + 1) {
        flush();
        out.push(
          <code
            key={key++}
            style={{
              fontFamily: t.fontFamily.mono,
              fontSize: "0.92em",
              padding: "1px 4px",
              backgroundColor: t.color.surfaceRaised,
              border: `1px solid ${t.color.borderSubtle}`,
              borderRadius: t.radius.sm,
            }}
          >
            {text.slice(i + 1, close)}
          </code>,
        );
        i = close + 1;
        continue;
      }
    }

    // **bold**
    if (char === "*" && text[i + 1] === "*") {
      const close = text.indexOf("**", i + 2);
      if (close > i + 2) {
        flush();
        out.push(
          <strong key={key++} style={{ fontWeight: 600 }}>
            {text.slice(i + 2, close)}
          </strong>,
        );
        i = close + 2;
        continue;
      }
    }

    // *italic*
    if (char === "*") {
      const close = text.indexOf("*", i + 1);
      if (close > i + 1) {
        flush();
        out.push(<em key={key++}>{text.slice(i + 1, close)}</em>);
        i = close + 1;
        continue;
      }
    }

    // [text](href)
    if (char === "[") {
      const labelEnd = text.indexOf("]", i + 1);
      if (labelEnd > i && text[labelEnd + 1] === "(") {
        const hrefEnd = text.indexOf(")", labelEnd + 2);
        if (hrefEnd > labelEnd + 2) {
          const label = text.slice(i + 1, labelEnd);
          const href = text.slice(labelEnd + 2, hrefEnd);
          flush();
          if (isSafeHref(href)) {
            out.push(
              <a
                key={key++}
                href={href}
                target="_blank"
                // `noopener` for the tab-napping hole, `noreferrer` because
                // the URL came from a model and may be anywhere.
                rel="noopener noreferrer"
                style={{ color: t.color.link, textDecoration: "underline" }}
              >
                {label}
              </a>,
            );
          } else {
            // An unsafe or malformed link renders as its own source text,
            // which is both honest and inspectable — silently dropping it
            // would hide what the model actually said.
            out.push(text.slice(i, hrefEnd + 1));
          }
          i = hrefEnd + 1;
          continue;
        }
      }
    }

    plain += char;
    i++;
  }

  flush();
  return out;
}

/**
 * An allowlist, not a denylist: `http` and `https`, nothing else.
 *
 * Two string comparisons rather than a pattern. `javascript:` and `data:` are
 * the cases this exists for, and a denylist of schemes is a game of
 * whack-a-mole against a string somebody else generated.
 */
function isSafeHref(href: string): boolean {
  const lower = href.trim().toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://");
}
