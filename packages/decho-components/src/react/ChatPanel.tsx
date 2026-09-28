/**
 * A chat transcript and a composer.
 *
 * Two near-identical implementations in the estate — the insight chat and the
 * process-mining chat, about 17kB each — which differ in what they ask the
 * model and agree on everything this component does.
 *
 * Controlled, like everything here: messages in, `onSend` out. It does not
 * call a model, hold a conversation, retry, or know what a prompt is. That is
 * deliberate and it is the whole reason it can be shared: the two originals
 * differ precisely in the part that is left out.
 *
 * THE PARTS THAT ARE EASY TO GET WRONG
 * ------------------------------------
 *   - The transcript is a `role="log"` with `aria-live="polite"`, so a reply
 *     is announced when it arrives. Neither original announced anything, which
 *     for a feature whose output arrives seconds after the question is the
 *     difference between usable and not.
 *   - Enter sends, Shift+Enter makes a newline. Both originals sent on Enter
 *     with no way to write a second line.
 *   - It scrolls to the newest message when one arrives, but only if you were
 *     already at the bottom — scrolling someone away from what they were
 *     reading because the model finished is worse than not scrolling.
 *   - The composer is disabled while `busy`, and says why.
 */

import React, { useEffect, useRef, useState } from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { EmptyState } from "./EmptyState.js";
import { SimpleMarkdown } from "./SimpleMarkdown.js";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** Markdown for assistant messages unless `markdown` is off; text otherwise. */
  content: string;
  /** Rendered small and muted under the message. */
  meta?: React.ReactNode;
  /** A streaming or unconfirmed message, drawn at reduced emphasis. */
  pending?: boolean;
}

export interface ChatPanelProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  messages: ChatMessage[];
  onSend?: (text: string) => void;
  /** A request is in flight: the composer is disabled and says so. */
  busy?: boolean;
  placeholder?: string;
  /** Shown above the composer when there are no messages. */
  empty?: React.ReactNode;
  /** Render assistant messages as Markdown. On by default. */
  markdown?: boolean;
  /** Suggested prompts, shown as buttons when the transcript is empty. */
  suggestions?: string[];
  /** Names the transcript for a screen reader. */
  label?: string;
  height?: number | string;
  tokens?: DechoTokenSet;
}

export function ChatPanel({
  messages,
  onSend,
  busy = false,
  placeholder = "Ask a question",
  empty,
  markdown = true,
  suggestions,
  label = "Conversation",
  height = 360,
  tokens,
  style,
  ...rest
}: ChatPanelProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [draft, setDraft] = useState("");
  const transcript = useRef<HTMLDivElement | null>(null);
  const atBottom = useRef(true);

  // Track whether the reader is at the bottom *before* the new message lands,
  // because after it has landed the measurement is meaningless.
  const onScroll = () => {
    const el = transcript.current;
    if (el == null) {return;}
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    const el = transcript.current;
    if (el != null && atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const send = () => {
    const text = draft.trim();
    if (text === "" || busy) {return;}
    onSend?.(text);
    setDraft("");
  };

  return (
    <div
      {...rest}
      style={{
        display: "flex",
        flexDirection: "column",
        height,
        border: `1px solid ${t.color.borderSubtle}`,
        borderRadius: t.radius.lg,
        backgroundColor: t.color.surface,
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.md,
        color: t.color.text,
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        ref={transcript}
        onScroll={onScroll}
        role="log"
        aria-label={label}
        aria-live="polite"
        aria-busy={busy}
        style={{
          flex: "1 1 auto",
          overflow: "auto",
          padding: t.space[4],
          display: "flex",
          flexDirection: "column",
          gap: t.space[3],
        }}
      >
        {messages.length === 0 &&
          (empty ?? (
            <EmptyState
              title="Nothing asked yet"
              description="Answers are generated and worth checking against the objects they cite."
              tokens={tokens}
              compact
            />
          ))}

        {messages.map((message) => {
          const own = message.role === "user";
          const system = message.role === "system";

          return (
            <div
              key={message.id}
              style={{
                alignSelf: own ? "flex-end" : "flex-start",
                maxWidth: system ? "100%" : "86%",
                padding: `${t.space[2]} ${t.space[3]}`,
                borderRadius: t.radius.md,
                backgroundColor: own
                  ? t.color.accentSoft
                  : system
                    ? "transparent"
                    : t.color.surfaceRaised,
                border: system
                  ? "none"
                  : `1px solid ${own ? t.color.accent : t.color.borderSubtle}`,
                color: system ? t.color.textMuted : t.color.text,
                fontSize: system ? t.fontSize.sm : t.fontSize.md,
                fontStyle: system ? "italic" : undefined,
                opacity: message.pending === true ? 0.7 : 1,
              }}
            >
              {/* The role is stated rather than left to the alignment: "mine
                  is on the right" is a visual convention a screen reader does
                  not have. */}
              <span style={visuallyHidden}>
                {own ? "You said: " : system ? "Note: " : "Assistant said: "}
              </span>

              {markdown && message.role === "assistant" ? (
                <SimpleMarkdown tokens={tokens}>{message.content}</SimpleMarkdown>
              ) : (
                <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>
              )}

              {message.meta != null && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: t.fontSize.xs,
                    color: t.color.textFaint,
                  }}
                >
                  {message.meta}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {messages.length === 0 && suggestions != null && suggestions.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: t.space[2],
            padding: `0 ${t.space[4]} ${t.space[3]}`,
          }}
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={busy}
              onClick={() => onSend?.(suggestion)}
              style={{
                padding: "3px 10px",
                borderRadius: t.radius.pill,
                border: `1px solid ${t.color.borderSubtle}`,
                backgroundColor: t.color.surfaceRaised,
                color: t.color.textMuted,
                font: "inherit",
                fontSize: t.fontSize.sm,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: t.space[2],
          padding: t.space[3],
          borderTop: `1px solid ${t.color.borderSubtle}`,
          backgroundColor: t.color.surfaceRaised,
        }}
      >
        <label style={visuallyHidden} htmlFor="decho-chat-input">
          {placeholder}
        </label>
        <textarea
          id="decho-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline. Both originals sent on
            // Enter with no way to write a second line at all.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={busy ? "Waiting for an answer…" : placeholder}
          disabled={busy}
          style={{
            flex: "1 1 auto",
            resize: "none",
            minHeight: 30,
            maxHeight: 120,
            padding: `${t.space[2]} ${t.space[3]}`,
            backgroundColor: t.color.surface,
            border: `1px solid ${t.color.border}`,
            borderRadius: t.radius.sm,
            color: t.color.text,
            fontFamily: "inherit",
            fontSize: t.fontSize.md,
            lineHeight: 1.4,
          }}
        />
        <button
          type="submit"
          disabled={busy || draft.trim() === ""}
          style={{
            flex: "0 0 auto",
            padding: `${t.space[2]} ${t.space[4]}`,
            backgroundColor: t.color.accent,
            border: "none",
            borderRadius: t.radius.md,
            color: t.color.onAccent,
            font: "inherit",
            fontWeight: 600,
            cursor: busy || draft.trim() === "" ? "not-allowed" : "pointer",
            opacity: busy || draft.trim() === "" ? 0.5 : 1,
          }}
        >
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}

const visuallyHidden: React.CSSProperties = {
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
