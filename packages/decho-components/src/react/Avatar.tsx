/**
 * A person, as a circle — and a stack of them.
 *
 * `UserName` already covers "show who this is" for one person inline. An
 * ownership column showing five people needs the stack, and every table in the
 * estate that has one draws it by hand with a negative margin and no
 * indication of who the "+3" are.
 *
 * INITIALS ARE NOT `name[0] + name[1]`
 * ------------------------------------
 * Which is what the hand-rolled versions do, so "Dana Okafor" is "DA". The
 * rules are in `initials.ts`, in their own module so that this file exports
 * components and nothing else — and so they can be tested without React.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { Icon } from "./Icon.js";
import { initialsOf } from "./initials.js";

export interface AvatarProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** The display name. Used for the initials and the accessible name. */
  name?: string;
  /** An image, if there is one. Falls back to initials when it fails to load. */
  src?: string;
  size?: number;
  /** Squared off, for a system or a team rather than a person. */
  square?: boolean;
  tokens?: DechoTokenSet;
}

export function Avatar({
  name,
  src,
  size = 24,
  square = false,
  tokens,
  style,
  ...rest
}: AvatarProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [broken, setBroken] = React.useState(false);
  const initials = name != null ? initialsOf(name) : "";

  return (
    <span
      {...rest}
      // The name is on the wrapper, so an avatar in a stack is announced once
      // rather than as an image and then as text.
      role="img"
      aria-label={name ?? "Unknown user"}
      title={name}
      style={{
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
        width: size,
        height: size,
        borderRadius: square ? t.radius.sm : "50%",
        // The tint, not the wash: an avatar is a filled shape, and a
        // translucent one over an unpainted host page takes the host's colour.
        background: t.color.accentTint,
        color: t.color.accent,
        border: `1px solid ${t.color.border}`,
        overflow: "hidden",
        fontFamily: t.fontFamily.sans,
        fontSize: Math.max(9, Math.round(size * 0.42)),
        fontWeight: 600,
        letterSpacing: "0.02em",
        userSelect: "none",
        ...style,
      }}
    >
      {src != null && !broken ? (
        <img
          src={src}
          alt=""
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : initials !== "" ? (
        <span aria-hidden="true">{initials}</span>
      ) : (
        <Icon name="user" size={Math.round(size * 0.55)} />
      )}
    </span>
  );
}

export interface AvatarGroupProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  people: { name?: string; src?: string }[];
  /** How many to show before the overflow counter. */
  max?: number;
  size?: number;
  tokens?: DechoTokenSet;
}

export function AvatarGroup({
  people,
  max = 4,
  size = 24,
  tokens,
  style,
  ...rest
}: AvatarGroupProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const shown = people.slice(0, max);
  const hidden = people.slice(max);

  return (
    <span
      {...rest}
      style={{ display: "inline-flex", alignItems: "center", ...style }}
    >
      {shown.map((person, index) => (
        <Avatar
          key={`${person.name ?? "unknown"}-${index}`}
          name={person.name}
          src={person.src}
          size={size}
          tokens={tokens}
          style={{
            marginLeft: index === 0 ? 0 : -Math.round(size * 0.3),
            // A ring in the surface colour, so overlapping circles read as
            // separate people rather than as one blob.
            boxShadow: `0 0 0 1.5px ${t.color.surface}`,
            zIndex: shown.length - index,
          }}
        />
      ))}
      {hidden.length > 0 && (
        <span
          // Named, and titled with the actual names: a "+3" that cannot be
          // resolved is a count of people nobody can identify.
          role="img"
          aria-label={`and ${hidden.length} more: ${hidden
            .map((person) => person.name ?? "unknown")
            .join(", ")}`}
          title={hidden.map((person) => person.name ?? "unknown").join("\n")}
          style={{
            display: "grid",
            placeItems: "center",
            width: size,
            height: size,
            marginLeft: -Math.round(size * 0.3),
            borderRadius: "50%",
            background: t.color.neutralTint,
            color: t.color.textMuted,
            border: `1px solid ${t.color.border}`,
            boxShadow: `0 0 0 1.5px ${t.color.surface}`,
            fontFamily: t.fontFamily.sans,
            fontSize: Math.max(9, Math.round(size * 0.38)),
            fontWeight: 600,
          }}
        >
          {`+${hidden.length}`}
        </span>
      )}
    </span>
  );
}
