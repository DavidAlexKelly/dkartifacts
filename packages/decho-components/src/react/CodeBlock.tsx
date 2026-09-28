/**
 * A block of code with a copy button.
 *
 * This was app furniture, with a note explaining why it should stay that way:
 * copying to the clipboard reaches for `navigator`, and a widget is a
 * sandboxed place to be doing that. The note has been overtaken by two facts.
 *
 * The first is that `navigator.clipboard` is optional-chained here and the
 * whole path is a no-op where it is unavailable — over plain http, or under a
 * permissions policy that forbids it — so the worst case is a button that does
 * nothing while the text stays selectable. That is a smaller risk than the
 * alternative, which is the second fact: two repos had already started
 * growing their own `<pre>`, and a code block is exactly the kind of thing
 * every estate ends up with five of.
 *
 * Everything visual comes from the tokens, so it follows the theme rather than
 * being a pale rectangle in the dark ones.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { monoStyle } from "../core/recipes.js";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";

export interface CodeBlockProps {
  code: string;
  /**
   * The theme, as values. Omitted, the block styles itself from `var()` and
   * follows whatever theme surrounds it — which is what a block inside a
   * `DechoSurface` wants.
   */
  tokens?: DechoTokenSet;
  /**
   * Names the block for a screen reader: the button reads "Copy the install
   * command" rather than one of six identical "Copy"s.
   */
  label?: string;
}

export function CodeBlock({
  code,
  tokens,
  label,
}: CodeBlockProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // The confirmation is on a timer, so it has to be cancelled if the block
  // unmounts first — switching package on the install page unmounts all of
  // them at once, and a setState afterwards is a warning in the console of
  // the page whose whole job is to look trustworthy.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(() => {
    // Not available over plain http, and not worth a fallback: the text is
    // right there and selectable. Failing silently is better than a button
    // that throws.
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  return (
    <div style={{ position: "relative" }}>
      <pre
        style={{
          ...monoStyle({ tokens }),
          margin: 0,
          padding: 10,
          // Room for the button, so a long first line does not run under it.
          paddingRight: 72,
          background: t.color.bg,
          border: `1px solid ${t.color.borderSubtle}`,
          borderRadius: t.radius.md,
          color: t.color.text,
          overflowX: "auto",
          whiteSpace: "pre",
        }}
      >
        {code}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={label != null ? `Copy ${label}` : "Copy to clipboard"}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          padding: "2px 8px",
          fontSize: t.fontSize.sm,
          fontFamily: t.fontFamily.sans,
          color: copied ? t.color.success : t.color.textMuted,
          background: t.color.surface,
          border: `1px solid ${t.color.borderSubtle}`,
          borderRadius: t.radius.sm,
          cursor: "pointer",
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
