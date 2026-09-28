/**
 * The same components as the stylesheet, as plain style objects.
 *
 * WHY BOTH
 * --------
 * A stylesheet is the better tool when you control the page: one copy of the
 * rules, real `:hover`, real media queries, and a host can override anything
 * with a selector. It is the worse tool inside a Foundry custom widget, where
 * the CSS has to survive being bundled by someone else's Vite config, imported
 * in the right order relative to Blueprint, and not clash with the host app's
 * own reset. When it does not survive, the failure is silent: the markup is
 * there, the classes are there, and the widget renders unstyled.
 *
 * These recipes cannot fail that way, because there is nothing to import but
 * JavaScript. They are what `../react/*` is built from, so a consumer who
 * takes the components takes this path whether they know it or not.
 *
 * THEMES
 * ------
 * Every value a recipe emits comes from `VAR_TOKENS`, so it is a `var()`
 * reference with the base value as its fallback — there is no
 * `if (theme === "modern")` anywhere below, and no theme name reaches this
 * file at all. A theme that needed special cases in the recipes would need
 * matching special cases in the CSS, and the two would drift the first time
 * one was edited.
 *
 * That also decouples this package from @acc/decho-styling: a themed ancestor
 * declares the variables and these recipes pick them up; with no themed
 * ancestor the fallbacks apply and the components are still correct. `tokens`
 * remains as an override for the case that cannot inherit — a portal.
 *
 * The one thing worth understanding is how a surface is painted. Instead of a
 * background colour, surfaces get a colour PLUS two background-image layers:
 * the hairline (a 1px gradient along the top edge) and the wash. In `classic`
 * both are `none`, so the result is the flat surface it always was; in `modern`
 * they are what makes a card look lit. It is done with background layers rather
 * than a `::before` because an inline style has no pseudo-elements — and doing
 * it the same way in the CSS keeps the two deliveries identical.
 */

import type { CSSProperties } from "react";
import {
  VAR_TOKENS,
  type DechoColor,
  type DechoTokenSet,
  type DechoTone,
  toneColors,
} from "./vars.js";

/** The resolved palette, as returned by `withTheme()`. */
export type DechoPalette = Record<DechoColor, string>;

export interface Styled {
  /**
   * A resolved token set, from @acc/decho-styling's `tokensFor()`,
   * `withAccent()` or `defineTheme().tokens`.
   *
   * Almost always unnecessary. Omitted, a recipe emits `var()` references, so
   * it follows whatever theme an ancestor declared — including one chosen after
   * this component rendered. Pass it only when there is no ancestor to inherit
   * from, which in practice means a portal.
   */
  tokens?: DechoTokenSet;
  /** From `withTheme()`, when this subtree overrides colours. */
  palette?: DechoPalette;
}

interface Resolved {
  t: DechoTokenSet;
  c: DechoPalette;
}

function resolve(options?: Styled): Resolved {
  const t = options?.tokens ?? VAR_TOKENS;
  const c = (
    options?.palette != null ? { ...t.color, ...options.palette } : t.color
  ) as DechoPalette;
  return { t, c };
}

/**
 * The colour plus the two gradient layers that make a surface a surface.
 *
 * `background-image: none, none` is valid and paints nothing, so this is a
 * single code path for both skins rather than a branch.
 */
function surfacePaint(
  t: DechoTokenSet,
  color: string,
  wash: string,
  hairline: boolean,
): CSSProperties {
  return {
    backgroundColor: color,
    backgroundImage: `${hairline ? t.gradient.hairline : "none"}, ${wash}`,
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundSize: "100% 1px, auto",
    backgroundPosition: "top left, center",
  };
}

/**
 * The baseline: font, colour, and — in a lit skin — the light itself.
 *
 * Put it on the widget's outermost element. Without `filled` it sets no
 * background, because a widget that paints its own cannot be embedded in a
 * panel that has one. With it, you get the page colour and, in `modern`, the
 * two pools of light every surface above is translucent over: skip it there and
 * the glass has nothing to be glass against.
 */
export function rootStyle(options?: Styled & { filled?: boolean }): CSSProperties {
  const { t, c } = resolve(options);
  return {
    fontFamily: t.fontFamily.sans,
    fontSize: t.fontSize.md,
    lineHeight: 1.45,
    color: c.text,
    ...(options?.filled === true
      ? {
          backgroundColor: c.bg,
          backgroundImage: t.gradient.app,
          backgroundRepeat: "no-repeat",
          // `scroll`, not `local`: this element is usually the scroll
          // container, and with `local` the light scrolls away with the
          // content — leaving the translucent surfaces over flat black, which
          // is precisely how modern ends up looking grey.
          backgroundAttachment: "scroll",
        }
      : {}),
    // Tells the browser which way to draw native form controls and scrollbars.
    // From the tokens, so `daylight` gets light ones: one declaration, where
    // the alternative is styling every scrollbar by hand, per theme.
    colorScheme: t.effect.colorScheme,
  };
}

/** A plain surface: the background/border pair the card and panel share. */
export function surfaceStyle(
  options?: Styled & { raised?: boolean; overlay?: boolean },
): CSSProperties {
  const { t, c } = resolve(options);
  const overlay = options?.overlay === true;
  const raised = options?.raised === true;
  return {
    ...surfacePaint(
      t,
      overlay ? c.surfaceOverlay : raised ? c.surfaceRaised : c.surface,
      raised ? t.gradient.raised : t.gradient.surface,
      true,
    ),
    backdropFilter: overlay ? t.effect.blur : t.effect.surfaceBlur,
    WebkitBackdropFilter: overlay ? t.effect.blur : t.effect.surfaceBlur,
    border: `1px solid ${overlay ? c.borderOverlay : c.borderSubtle}`,
    borderRadius: t.radius.lg,
    color: c.text,
  };
}

export interface CardOptions extends Styled {
  /** Adds the hover affordance. Pair with `hovered` — see below. */
  interactive?: boolean;
  /**
   * Inline styles have no `:hover`, so the caller owns the hover state and
   * tells us. `../react/Card.tsx` does this with one `useState`; a caller
   * using the recipe directly either does the same or leaves it false and gets
   * a card that does not react to the pointer.
   */
  hovered?: boolean;
  selected?: boolean;
  /** Draws a 3px stripe down the left edge. For status, not decoration. */
  tone?: DechoTone;
}

export function cardStyle(options?: CardOptions): CSSProperties {
  const { t, c } = resolve(options);
  const selected = options?.selected === true;
  const hovered = options?.interactive === true && options?.hovered === true;
  const stripe = options?.tone != null ? toneColors(options.tone, c).fg : undefined;

  return {
    ...surfaceStyle(options),
    display: "flex",
    flexDirection: "column",
    gap: t.space[4],
    padding: t.space[5],
    borderColor: selected ? c.accent : hovered ? c.border : c.borderSubtle,
    borderLeft: stripe != null ? `3px solid ${stripe}` : undefined,
    boxShadow: selected
      ? t.shadow.selected
      : hovered
        ? t.shadow.cardHover
        : t.shadow.card,
    cursor: options?.interactive === true ? "pointer" : undefined,
    transition: `border-color ${t.effect.transition}, box-shadow ${t.effect.transition}, transform ${t.effect.transition}`,
  };
}

/** Title and meta on the left, actions on the right. */
export function cardHeaderStyle(options?: Styled): CSSProperties {
  const { t } = resolve(options);
  return {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: t.space[5],
  };
}

export function cardFooterStyle(options?: Styled): CSSProperties {
  const { t, c } = resolve(options);
  return {
    display: "flex",
    alignItems: "center",
    gap: t.space[4],
    paddingTop: t.space[4],
    borderTop: `1px solid ${c.borderSubtle}`,
  };
}

export function cardTitleStyle(options?: Styled): CSSProperties {
  const { t, c } = resolve(options);
  return {
    margin: 0,
    fontSize: t.fontSize.lg,
    fontWeight: 600,
    color: c.text,
  };
}

/** Subtitles, counts, timestamps — the second line under a title. */
export function cardMetaStyle(options?: Styled): CSSProperties {
  const { t, c } = resolve(options);
  return {
    margin: 0,
    fontSize: t.fontSize.sm,
    color: c.textMuted,
  };
}

export interface TagOptions extends Styled {
  tone?: DechoTone;
  /** Filled rather than tinted. For the one tag that must be read first. */
  solid?: boolean;
}

export function tagStyle(options?: TagOptions): CSSProperties {
  const { t, c } = resolve(options);
  const tone = toneColors(options?.tone ?? "neutral", c);
  const solid = options?.solid === true;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: t.space[2],
    padding: `1px ${t.space[3]}`,
    borderRadius: t.radius.pill,
    border: `1px solid ${solid ? "transparent" : tone.soft}`,
    background: solid ? tone.fg : tone.soft,
    color: solid ? c.onAccent : tone.fg,
    fontSize: t.fontSize.xs,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    lineHeight: 1.6,
  };
}

/** The dot inside a tag, or on its own next to a label. */
export function dotStyle(options?: Styled & { tone?: DechoTone }): CSSProperties {
  const { t, c } = resolve(options);
  const tone = toneColors(options?.tone ?? "neutral", c);
  return {
    width: 6,
    height: 6,
    borderRadius: t.radius.pill,
    background: tone.fg,
    // `color` is set so that shadow.dot — which is written in currentColor —
    // haloes in the tone without needing a token per tone. It is `none` in
    // classic, where a dot is a disc rather than a light source.
    color: tone.fg,
    boxShadow: t.shadow.dot,
    flex: "0 0 auto",
  };
}

export type DechoButtonVariant = "default" | "primary" | "ghost" | "danger";

export interface ButtonOptions extends Styled {
  variant?: DechoButtonVariant;
  size?: "sm" | "md";
  /** A square button holding one icon — 28px, the map toolbars' geometry. */
  iconOnly?: boolean;
  hovered?: boolean;
  active?: boolean;
  disabled?: boolean;
}

export function buttonStyle(options?: ButtonOptions): CSSProperties {
  const { t, c } = resolve(options);
  const variant = options?.variant ?? "default";
  const size = options?.size ?? "md";
  const hovered = options?.hovered === true && options?.disabled !== true;
  const iconOnly = options?.iconOnly === true;

  const fills: Record<DechoButtonVariant, CSSProperties> = {
    default: {
      ...surfacePaint(
        t,
        hovered ? c.surfaceRaised : c.surface,
        t.gradient.raised,
        false,
      ),
      border: `1px solid ${hovered ? c.borderStrong : c.border}`,
      color: c.text,
    },
    primary: {
      backgroundColor: hovered ? c.accentHover : c.accent,
      // `none` in classic, so this is the flat accent fill it always was.
      backgroundImage: t.gradient.accent,
      border: "1px solid transparent",
      color: c.onAccent,
      boxShadow: hovered ? t.shadow.cardHover : undefined,
    },
    ghost: {
      background: hovered ? c.accentSoft : "transparent",
      border: "1px solid transparent",
      color: hovered ? c.text : c.textMuted,
    },
    danger: {
      background: hovered ? c.danger : "transparent",
      border: `1px solid ${c.danger}`,
      color: hovered ? c.onAccent : c.danger,
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: t.space[3],
    padding: iconOnly ? 0 : size === "sm" ? `3px ${t.space[4]}` : `5px ${t.space[5]}`,
    width: iconOnly ? 28 : undefined,
    height: iconOnly ? 28 : undefined,
    borderRadius: t.radius.md,
    fontFamily: t.fontFamily.sans,
    fontSize: size === "sm" ? t.fontSize.sm : t.fontSize.md,
    fontWeight: 600,
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    cursor: options?.disabled === true ? "default" : "pointer",
    opacity: options?.disabled === true ? 0.4 : 1,
    transition: `background ${t.effect.transition}, border-color ${t.effect.transition}, box-shadow ${t.effect.transition}`,
    ...fills[variant],
    // The pressed/selected look wins over the variant's own border.
    ...(options?.active === true
      ? { borderColor: c.accent, color: variant === "primary" ? c.onAccent : c.accent }
      : {}),
  };
}

/**
 * The focus ring, as its own recipe.
 *
 * One ring everywhere — keyboard users navigate across widgets, and a focus
 * style that changes between them reads as a bug. Inline styles have no
 * `:focus-visible`, so components track focus and spread this.
 */
export function focusRingStyle(options?: Styled): CSSProperties {
  const { c } = resolve(options);
  return {
    outline: "none",
    boxShadow: `0 0 0 2px ${c.accentSoft}`,
  };
}

export interface PanelOptions extends Styled {
  /** Translucent and blurred, for a panel floating over a map. */
  overlay?: boolean;
}

export function panelStyle(options?: PanelOptions): CSSProperties {
  const { t } = resolve(options);
  return {
    ...surfaceStyle({ ...options, overlay: options?.overlay }),
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    boxShadow: t.shadow.panel,
  };
}

export function panelHeaderStyle(options?: Styled): CSSProperties {
  const { t, c } = resolve(options);
  return {
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: t.space[5],
    padding: `${t.space[4]} ${t.space[5]}`,
    borderBottom: `1px solid ${c.borderSubtle}`,
    fontSize: t.fontSize.sm,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: c.textMuted,
  };
}

/**
 * `minHeight: 0` is not decoration: a flex child defaults to `min-height:auto`
 * and refuses to shrink below its content, so without it a long list pushes the
 * header out of the panel instead of scrolling inside it.
 */
export function panelBodyStyle(options?: Styled & { scroll?: boolean }): CSSProperties {
  const { t, c } = resolve(options);
  return {
    flex: "1 1 auto",
    minHeight: 0,
    overflow: options?.scroll === true ? "auto" : undefined,
    padding: t.space[5],
    color: c.text,
  };
}

export interface NavItemOptions extends Styled {
  active?: boolean;
  hovered?: boolean;
}

/**
 * A row in a navigation rail: icon tile, label, one line of description.
 *
 * Here because it is the shape every operational sidebar in this project keeps
 * rebuilding, and because it is where a skin is most visible — an active row is
 * a tinted rectangle in `classic` and a lit one, with a gradient wash and a
 * glowing left edge, in `modern`.
 */
export function navItemStyle(options?: NavItemOptions): CSSProperties {
  const { t, c } = resolve(options);
  const active = options?.active === true;
  const hovered = options?.hovered === true && !active;

  return {
    display: "flex",
    alignItems: "center",
    gap: t.space[5],
    width: "100%",
    padding: `${t.space[4]} ${t.space[5]}`,
    borderRadius: t.radius.lg,
    border: `1px solid ${active ? c.borderStrong : hovered ? c.borderSubtle : "transparent"}`,
    // The active wash runs left-to-right rather than being a flat tint: the
    // row is brightest where the accent edge is, which is what makes it read
    // as lit from that edge rather than merely coloured.
    backgroundColor: active ? c.accentSoft : hovered ? c.surfaceRaised : "transparent",
    backgroundImage: active ? t.gradient.raised : "none",
    boxShadow: active ? t.shadow.card : undefined,
    color: active ? c.text : c.textMuted,
    textAlign: "left",
    cursor: "pointer",
    transition: `background ${t.effect.transition}, border-color ${t.effect.transition}, color ${t.effect.transition}`,
  };
}

/** The square icon tile at the head of a nav row. */
export function navIconStyle(options?: NavItemOptions): CSSProperties {
  const { t, c } = resolve(options);
  const active = options?.active === true;
  return {
    display: "grid",
    placeItems: "center",
    flex: "0 0 auto",
    width: 30,
    height: 30,
    borderRadius: t.radius.md,
    border: `1px solid ${active ? c.borderStrong : c.borderSubtle}`,
    backgroundColor: active ? c.accentSoft : c.surfaceRaised,
    backgroundImage: t.gradient.raised,
    color: active ? c.accentHover : c.textMuted,
  };
}

export function navLabelStyle(options?: Styled): CSSProperties {
  const { t } = resolve(options);
  return {
    fontSize: t.fontSize.lg,
    fontWeight: 600,
    lineHeight: 1.3,
    color: "inherit",
  };
}

export function navDescriptionStyle(options?: Styled): CSSProperties {
  const { t, c } = resolve(options);
  return {
    fontSize: t.fontSize.sm,
    lineHeight: 1.3,
    color: c.textFaint,
  };
}

/**
 * The uppercase caption that heads a group — "MISSION DOMAINS".
 *
 * `ruled` trails it with a hairline that fills the remaining width, which is
 * the divider-and-label pattern the reference design uses throughout.
 */
export function sectionLabelStyle(options?: Styled): CSSProperties {
  const { t, c } = resolve(options);
  return {
    display: "flex",
    alignItems: "center",
    gap: t.space[5],
    fontSize: t.fontSize.xs,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: c.textFaint,
  };
}

/* --------------------------------------------------------------------------
   Application shell
   --------------------------------------------------------------------------
   Header, sidebar, content, footer, breadcrumb: the frame every operational
   app in this estate draws before it draws anything of its own. They are here
   for the same reason the card is — five apps had five slightly different
   versions of this frame, and the differences were all accidents.

   The shell is deliberately not a single `<AppLayout>` component with slots.
   A layout component owns the grid, and the moment one app needs a second
   sidebar or a full-bleed map it has to be forked. These are pieces: compose
   them, and the composition stays yours.
   -------------------------------------------------------------------------- */

/** The outermost frame: header on top, sidebar and content side by side. */
export function appShellStyle(options?: Styled): CSSProperties {
  const { c } = resolve(options);
  return {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    overflow: "hidden",
    color: c.text,
  };
}

/** The row holding the sidebar and the content column. */
export function appBodyStyle(): CSSProperties {
  return {
    flex: "1 1 auto",
    minHeight: 0,
    display: "flex",
    overflow: "hidden",
  };
}

export function appHeaderStyle(options?: Styled): CSSProperties {
  const { t, c } = resolve(options);
  return {
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    gap: t.space[5],
    padding: `${t.space[4]} ${t.space[6]}`,
    minHeight: 48,
    ...surfacePaint(t, c.surface, t.gradient.surface, true),
    backdropFilter: t.effect.surfaceBlur,
    WebkitBackdropFilter: t.effect.surfaceBlur,
    borderBottom: `1px solid ${c.borderSubtle}`,
    color: c.text,
  };
}

/** The brand block at the head of the header or the sidebar. */
export function appBrandStyle(options?: Styled): CSSProperties {
  const { t, c } = resolve(options);
  return {
    display: "flex",
    alignItems: "center",
    gap: t.space[4],
    minWidth: 0,
    fontSize: t.fontSize.xl,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: c.text,
  };
}

export function appSidebarStyle(
  options?: Styled & { width?: number; collapsed?: boolean },
): CSSProperties {
  const { t, c } = resolve(options);
  const width = options?.collapsed === true ? 64 : (options?.width ?? 260);
  return {
    flex: "0 0 auto",
    width,
    minWidth: width,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    ...surfacePaint(t, c.surface, t.gradient.surface, false),
    backdropFilter: t.effect.surfaceBlur,
    WebkitBackdropFilter: t.effect.surfaceBlur,
    borderRight: `1px solid ${c.borderSubtle}`,
    color: c.text,
    transition: `width ${t.effect.transition}`,
  };
}

export function appContentStyle(options?: Styled): CSSProperties {
  const { t } = resolve(options);
  return {
    flex: "1 1 auto",
    minWidth: 0,
    minHeight: 0,
    overflow: "auto",
    padding: t.space[6],
    display: "flex",
    flexDirection: "column",
    gap: t.space[6],
  };
}

export function appFooterStyle(options?: Styled): CSSProperties {
  const { t, c } = resolve(options);
  return {
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: t.space[5],
    padding: `${t.space[4]} ${t.space[6]}`,
    borderTop: `1px solid ${c.borderSubtle}`,
    fontSize: t.fontSize.sm,
    color: c.textMuted,
  };
}

export function breadcrumbStyle(options?: Styled): CSSProperties {
  const { t, c } = resolve(options);
  return {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: t.space[3],
    margin: 0,
    padding: 0,
    listStyle: "none",
    fontSize: t.fontSize.sm,
    color: c.textMuted,
  };
}

/** The separator between crumbs. Presentational, so it is aria-hidden. */
export function breadcrumbSeparatorStyle(options?: Styled): CSSProperties {
  const { c } = resolve(options);
  return { color: c.textFaint, userSelect: "none" };
}

export function inputStyle(options?: Styled & { invalid?: boolean }): CSSProperties {
  const { t, c } = resolve(options);
  return {
    width: "100%",
    padding: `5px ${t.space[4]}`,
    background: c.bg,
    border: `1px solid ${options?.invalid === true ? c.danger : c.border}`,
    borderRadius: t.radius.sm,
    color: c.text,
    fontFamily: t.fontFamily.sans,
    fontSize: t.fontSize.md,
    lineHeight: 1.4,
  };
}

/** The little uppercase caption above a field or a group of them. */
export function labelStyle(options?: Styled): CSSProperties {
  const { t, c } = resolve(options);
  return {
    display: "block",
    marginBottom: t.space[2],
    fontSize: t.fontSize.xs,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: c.textMuted,
  };
}

export function dividerStyle(options?: Styled): CSSProperties {
  const { c } = resolve(options);
  return {
    height: 1,
    width: "100%",
    background: c.borderSubtle,
    border: "none",
    margin: 0,
  };
}

/** Monospaced values — coordinates, SIDCs, ids. */
export function monoStyle(options?: Styled): CSSProperties {
  const { t, c } = resolve(options);
  return {
    fontFamily: t.fontFamily.mono,
    fontSize: t.fontSize.sm,
    color: c.textMuted,
  };
}
