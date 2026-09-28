/**
 * A tag: a short, uppercase status word in a pill.
 *
 * Six tones and no colour prop. The whole point of a shared package is that
 * "danger" is the same red in the ORBAT widget and the routing widget, and an
 * open colour prop is precisely how that stops being true — the second time
 * somebody needs a warning they pick a hex from the nearest mock.
 */

import React from "react";
import { dotStyle, tagStyle } from "../core/recipes.js";
import type { DechoPalette } from "../core/recipes.js";
import type { DechoTokenSet, DechoTone } from "../core/vars.js";

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: DechoTone;
  /** Filled rather than tinted. For the one tag that must be read first. */
  solid?: boolean;
  /** Leading status dot. Useful when the tone is the whole message. */
  dot?: boolean;
  /**
   * An explicit token set, from `tokensFor()`, `withAccent()` or
   * `defineTheme()`. Rarely needed: tokens are inherited as CSS custom
   * properties, so a `DechoSurface` above this is usually the answer.
   */
  tokens?: DechoTokenSet;
  palette?: DechoPalette;
}

export function Tag({
  tone = "neutral",
  solid = false,
  dot = false,
  tokens,
  palette,
  children,
  style,
  ...rest
}: TagProps): React.ReactElement {

  return (
    <span
      {...rest}
      style={{ ...tagStyle({ tone, solid, tokens, palette }), ...style }}
    >
      {dot && (
        <span
          // The dot inside a solid tag has to be the text colour, not the tone:
          // a green dot on a green fill is an empty circle. Setting `color`
          // rather than `background` keeps the glow — which is written in
          // currentColor — in step with it.
          style={
            solid
              ? {
                  ...dotStyle({ tone, tokens, palette }),
                  background: "currentColor",
                  color: "inherit",
                }
              : dotStyle({ tone, tokens, palette })
          }
        />
      )}
      {children}
    </span>
  );
}
