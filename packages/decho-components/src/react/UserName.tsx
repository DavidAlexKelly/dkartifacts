/**
 * A person: initials, a name, and a colour that is always the same colour for
 * the same person.
 *
 * The estate's `UserName`, which took a Foundry user id and rendered whatever
 * it had — sometimes a display name, sometimes the id, sometimes an empty
 * space. Two decisions here, both about honesty:
 *
 *   - It takes a `name` and an optional `id`, and it does not resolve one to
 *     the other. Resolution is an OSDK call and this package makes none; the
 *     widget already has the user object, or is loading it, and `loading`
 *     covers the gap.
 *   - With no name it says "Unknown user" rather than drawing an empty chip.
 *     A blank avatar reads as a rendering bug; "Unknown user" reads as missing
 *     data, which is what it is.
 *
 * The avatar colour is `chartSeries(hash(id ?? name))` — deterministic, drawn
 * from the theme, and stable across sessions and widgets, so the same person
 * is the same colour in the table and in the drawer. It is decoration: the
 * name is always present as text.
 */

import React from "react";
import {
  chartSeries,
  resolveTokens,
  type DechoTokenSet,
} from "../core/vars.js";

export interface UserNameProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** The display name. Omit with `loading`, or to get "Unknown user". */
  name?: string;
  /** Used for the colour, and shown as the tooltip when there is no name. */
  id?: string;
  /** A role, a team, a timestamp — rendered small after the name. */
  meta?: React.ReactNode;
  loading?: boolean;
  /** Just the avatar, for a dense table cell. The name stays in the tooltip. */
  avatarOnly?: boolean;
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

export function UserName({
  name,
  id,
  meta,
  loading = false,
  avatarOnly = false,
  size = "sm",
  tokens,
  style,
  ...rest
}: UserNameProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const small = size === "sm";
  const box = small ? 18 : 24;

  const display = loading ? "Loading…" : (name ?? "Unknown user");
  const known = !loading && name != null && name.trim() !== "";
  const colour = known ? chartSeries(hash(id ?? name ?? ""), tokens) : t.color.borderStrong;

  return (
    <span
      {...rest}
      title={avatarOnly ? display : (id ?? undefined)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: t.fontFamily.sans,
        fontSize: small ? t.fontSize.sm : t.fontSize.md,
        color: known ? t.color.text : t.color.textFaint,
        minWidth: 0,
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 auto",
          width: box,
          height: box,
          borderRadius: "50%",
          backgroundColor: colour,
          color: t.color.onAccent,
          fontSize: small ? 8.5 : 10.5,
          fontWeight: 700,
          letterSpacing: "0.02em",
        }}
      >
        {known ? initials(name ?? "") : "?"}
      </span>

      {avatarOnly ? (
        // The name is still present for a reader, because an avatar alone is a
        // coloured circle as far as assistive tech is concerned.
        <span style={visuallyHidden}>{display}</span>
      ) : (
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {display}
          {meta != null && (
            <span style={{ color: t.color.textFaint }}>{" · "}{meta}</span>
          )}
        </span>
      )}
    </span>
  );
}

/** "Ada Lovelace" → "AL"; "ada.lovelace@acc" → "AL"; "Ada" → "AD". */
function initials(name: string): string {
  const cleaned = name.replace(/@.*$/, "").replace(/[._-]+/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {return "?";}
  if (parts.length === 1) {return parts[0].slice(0, 2).toUpperCase();}
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A small stable hash. Not a security primitive — it picks one of ten chart
 * colours, and the only property required is that it gives the same answer
 * every time for the same string.
 */
function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
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
