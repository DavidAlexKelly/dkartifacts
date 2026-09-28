/**
 * The one element that chooses a theme, and the only thing here resembling a
 * provider.
 *
 * It is optional. With no surface above them the components resolve their
 * `var()` fallbacks and render in the base theme, which is the difference
 * between a library you can drop one component of into an existing page and a
 * library that renders wrong until you remember a wrapper.
 *
 * It does two things, and both are ways of saying the same thing to the two
 * deliveries at once:
 *
 *   1. `tokens` — writes a token set onto this element as CSS custom
 *      properties. Every recipe below is a `var()` reference to those names,
 *      so the inline-styled components follow; so do the CSS classes, which
 *      inherit custom properties by definition. This needs no stylesheet, so
 *      it is the delivery to use inside a Foundry custom widget.
 *
 *   2. `theme` — adds `decho-<name>` and `data-decho-theme`, for the CSS
 *      delivery, where @acc/decho-styling's `tokens.css` carries the values.
 *      Cheaper in the DOM (one class rather than eighty declarations) and the
 *      right choice when you own the page and can be sure the stylesheet is
 *      loaded.
 *
 * NOTE THERE IS NO CONTEXT HERE, AND NO `skin` PROP
 * -------------------------------------------------
 * The predecessor of this component in @acc/decho-styling had three React
 * contexts — a skin, a resolved token set, and the accent a re-tint was asked
 * for — to get a theme down to inline styles that held literal values. Custom
 * properties inherit through the DOM on their own, so all three are gone, and
 * with them the bug they existed to prevent: a nested surface can no longer
 * undo an ancestor's theme by publishing its own, because it only writes the
 * variables it was actually given.
 *
 * It also means this package needs no dependency on the styling package. A
 * theme arrives as *values* — `tokens={tokensFor("accenture-sap")}` — or as a
 * *name* that a stylesheet resolves. Neither is an import.
 */

import React from "react";
import { rootStyle, surfaceStyle } from "../core/recipes.js";
import { tokenVariables, type DechoTokenSet } from "../core/vars.js";

export interface DechoSurfaceProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The theme, as values. From @acc/decho-styling:
   *
   *     tokensFor("accenture-sap")
   *     withAccent("modern", "#2fbf71")
   *     defineTheme({ name: "acme", extends: "daylight", … }).tokens
   *
   * Written onto this element as custom properties, so everything below
   * follows — classes and components alike.
   */
  tokens?: DechoTokenSet;
  /**
   * The theme, as a name, for the CSS delivery: adds `decho-<theme>` and
   * `data-decho-theme`.
   *
   * On its own this does nothing unless something declares those variables —
   * `@acc/decho-styling/tokens.css`, or a host that wrote them itself. Pass
   * `tokens` instead if you would rather not depend on a stylesheet loading.
   */
  theme?: string;
  /**
   * Paint the themed background on this element.
   *
   * Worth knowing for the translucent themes: `modern`'s surfaces are glass,
   * and glass with nothing behind it looks grey. Off by default because a
   * widget does not own its page; `AppShell` turns it on, because a shell does.
   */
  filled?: boolean;
  /** Render as a surface — a panel's fill, border and radius — not a bare div. */
  surface?: boolean;
}

export function DechoSurface({
  tokens,
  theme,
  filled = false,
  surface = false,
  className,
  children,
  style,
  ...rest
}: DechoSurfaceProps): React.ReactElement {
  return (
    <div
      {...rest}
      data-decho-theme={theme}
      className={[
        "decho-root",
        theme != null ? `decho-${theme}` : "",
        filled ? "decho-root--filled" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        // Variables first, so a caller's own `style` can still override one.
        ...(tokens != null ? tokenVariables(tokens) : {}),
        ...rootStyle({ tokens, filled }),
        ...(surface ? surfaceStyle({ tokens }) : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
