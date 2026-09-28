/**
 * An event feed: what happened, when, and who did it.
 *
 * Trivial to draw and needed everywhere — audit trails, comment threads,
 * status history, action logs. It is in tier one because the estate has three
 * copies already and because the two details that make it readable are the
 * two that get skipped: a `<time dateTime>` so the timestamp is machine-
 * readable, and a relative label ("2 hours ago") that does not lie when the
 * page has been open all afternoon.
 *
 * WHY THE RELATIVE LABEL IS A PROP, NOT A CALCULATION
 * ---------------------------------------------------
 * Because "2 hours ago" computed at render is wrong five minutes later, and a
 * component that re-renders on a timer to fix that is a component that keeps a
 * widget awake. The caller formats — usually with `Intl.RelativeTimeFormat`,
 * which is locale-correct and free — and re-renders when it has a reason to.
 * `relativeTime` here is a helper for exactly that, not something this calls
 * on its own.
 */

import React from "react";
import { resolveTokens, toneColors, type DechoTokenSet, type DechoTone } from "../core/vars.js";
import { Icon, type DechoIconName } from "./Icon.js";

export interface TimelineEvent {
  key: string;
  /** What happened, in one line. */
  title: React.ReactNode;
  /** Detail: a comment body, a diff, a reason. */
  body?: React.ReactNode;
  /** ISO 8601. Rendered in a `<time>` element. */
  at?: string;
  /** What to show: "2 hours ago", "14:32", "yesterday". */
  when?: React.ReactNode;
  who?: React.ReactNode;
  icon?: DechoIconName;
  tone?: DechoTone;
}

export interface TimelineProps extends React.HTMLAttributes<HTMLOListElement> {
  events: TimelineEvent[];
  /** Tighter, for a sidebar. */
  compact?: boolean;
  tokens?: DechoTokenSet;
}

export function Timeline({
  events,
  compact = false,
  tokens,
  style,
  ...rest
}: TimelineProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const dot = compact ? 18 : 22;

  return (
    <ol
      {...rest}
      style={{
        margin: 0,
        padding: 0,
        listStyle: "none",
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.md,
        ...style,
      }}
    >
      {events.map((event, index) => {
        const colours = event.tone != null ? toneColors(event.tone, t.color) : null;
        const last = index === events.length - 1;
        return (
          <li
            key={event.key}
            style={{
              display: "grid",
              gridTemplateColumns: `${dot}px minmax(0, 1fr)`,
              gap: t.space[4],
              paddingBottom: last ? 0 : compact ? t.space[5] : t.space[6],
            }}
          >
            <div style={{ display: "grid", justifyItems: "center", gap: 2 }}>
              <span
                aria-hidden="true"
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: dot,
                  height: dot,
                  borderRadius: "50%",
                  background: colours != null ? t.color.surface : t.color.surface,
                  border: `1.5px solid ${colours?.fg ?? t.color.border}`,
                  color: colours?.fg ?? t.color.textMuted,
                }}
              >
                <Icon name={event.icon ?? "clock"} size={dot - 9} />
              </span>
              {!last && (
                // The spine. A background on a 1px element rather than a
                // border, so it can be a gradient later without changing the
                // markup.
                <span
                  aria-hidden="true"
                  style={{ width: 1.5, flex: 1, minHeight: 8, height: "100%", background: t.color.borderSubtle }}
                />
              )}
            </div>

            <div style={{ display: "grid", gap: t.space[2], paddingTop: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: t.space[4],
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: 500, color: t.color.text }}>{event.title}</span>
                {event.when != null && (
                  // `<time>` with a machine-readable datetime: the visible
                  // text can be relative and human, and the attribute stays
                  // exact — which is what makes the feed copyable into a
                  // ticket without losing the actual timestamp.
                  <time
                    dateTime={event.at}
                    title={event.at}
                    style={{
                      fontSize: t.fontSize.sm,
                      color: t.color.textFaint,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {event.when}
                  </time>
                )}
              </div>
              {event.who != null && (
                <div style={{ fontSize: t.fontSize.sm, color: t.color.textMuted }}>{event.who}</div>
              )}
              {event.body != null && (
                <div style={{ lineHeight: 1.5, color: t.color.text }}>{event.body}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
