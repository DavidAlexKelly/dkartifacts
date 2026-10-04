/**
 * The tokens. One list, two deliveries, two skins.
 *
 * Every colour, size, gradient and shadow the design system has lives here,
 * and both ways of consuming the package are derived from this object:
 *
 *   - `../css/tokens.css` declares the same values as CSS custom properties,
 *     for consumers who style with classes or their own CSS.
 *   - `./recipes.ts` reads them directly, for consumers who style inline —
 *     which in a Foundry custom widget is the path that cannot break, because
 *     it needs no stylesheet to be imported, bundled or ordered correctly.
 *
 * Two deliveries means two places to change a colour, which is exactly the
 * drift this repo's other packages take pains to avoid. `tokens.test.ts`
 * closes it: it derives the expected variable name for every token below and
 * fails if the stylesheet is missing one, has an extra one, or disagrees about
 * a value. Add a token here, run the test, and it tells you what to add there.
 *
 * SKINS
 * -----
 * `classic` is the palette this project already draws with — flat surfaces,
 * military green, the greys from `src/mil/theme.ts` and the basemap's
 * `SurfaceTheme`. `modern` is the indigo command-centre look: translucent
 * glass over a lit background, a glowing hairline along the top edge of every
 * surface, and shadows that carry colour rather than only darkness.
 *
 * A skin is NOT just a palette, which is why it lives here rather than in
 * `theme.ts`: it also changes gradients, blur, radii and the shadow stack. It
 * is expressed as `SKIN_OVERRIDES` — the tokens that differ — so that adding a
 * token to the base set cannot leave a skin silently missing it, and so the
 * stylesheet's skin block stays small enough to read.
 *
 * WHY EVERY SKIN-DEPENDENT DECORATION HAS A TOKEN, INCLUDING "none"
 * ----------------------------------------------------------------
 * `classic` sets its gradients and its surface blur to `none`. That is what
 * lets one rule serve both skins:
 *
 *     background-color: var(--decho-color-surface);
 *     background-image: var(--decho-gradient-hairline), var(--decho-gradient-surface);
 *
 * `background-image: none, none` is valid CSS and paints nothing, so classic
 * gets a flat surface from exactly the same declaration that gives modern its
 * lit one. No `.decho-modern .decho-card` overrides, no second component
 * stylesheet, and nothing that can be updated in one skin and forgotten in the
 * other.
 *
 * NO WEBFONTS
 * -----------
 * The font stacks are system fonts only. A custom widget runs under a
 * restrictive CSP with no configurable allowlist: an `@import` from Google
 * Fonts is blocked, and the widget silently falls back to whatever the browser
 * picks. A design system whose typography depends on a network request it is
 * not allowed to make is not a design system.
 */

/**
 * The eight themes.
 *
 * `classic` is the default everywhere. Nothing changes skin implicitly, so a
 * consumer upgrading this package never wakes up in a different theme.
 *
 *   classic   Flat, military green, opaque. The palette this project has
 *             always drawn with, and the safe choice for dense tables.
 *   modern    Indigo glass over a lit background, gradient hairlines, glowing
 *             selection. The command-centre look.
 *   daylight  The light theme. Not "modern with the colours flipped": on white,
 *             depth has to come from shadow rather than from luminance, and the
 *             status colours are darkened to stay legible on it.
 *   command   Amber on near-black, sharp corners, opaque surfaces. For an ops
 *             room at night, and for anyone who finds glass distracting when
 *             the screen is the only light in the room.
 *   crt       Phosphor green on black, monospace, square corners, glow for
 *             shadow. A vector terminal; pairs with decho-basemap's
 *             mapStyle="crt".
 *
 *   accenture-light / accenture-dark
 *             The corporate palette: Blue 3 for actions, Violet 3 for AI, the
 *             fixed RAG scale for heatmaps, the ten-colour brand series for
 *             charts. Deliberately plain — no gradients, no glass, 2px corners
 *             — because it is the theme used where the house style is the
 *             client's rather than ours.
 *
 *   accenture-sap
 *             Accenture purple on white: the look the SAP migration estate
 *             (Ignite, PRISM, FloX) already draws with, lifted off the five
 *             widget repositories that each hold their own copy of it.
 */
import {
  over,
  hue,
  hueDistance,
  luminance,
  parseColor,
  readableOn,
  shade,
  toHex,
  toRgbTriple,
  type Rgba,
} from "./color.js";

export type DechoSkin =
  | "classic"
  | "modern"
  | "daylight"
  | "command"
  | "crt"
  | "accenture-standard"
  | "accenture-light"
  | "accenture-dark"
  | "accenture-sap";


/* ==========================================================================
   Tints
   --------------------------------------------------------------------------
   `accentSoft` is a wash: translucent, correct over a surface you painted,
   and wrong as a background because then what shows through is the page. In a
   widget the page belongs to the host, so five widget sets painted near-black
   cards, rows and progress tracks with one.

   `accentTint` is that wash already flattened onto this theme-and-mode's
   surface. Being a token means it is a CSS custom property, which means it
   follows the mode — a value computed at import does not, which is why the
   dark modes shipped with chalky selections in 1.3.0.

   Derived, never declared: no theme writes a tint, and none can get it wrong.
   ========================================================================== */

/** wash → tint, by name. */
const TINT_SOURCES = {
  accentTint: "accentSoft",
  infoTint: "infoSoft",
  successTint: "successSoft",
  warningTint: "warningSoft",
  dangerTint: "dangerSoft",
  neutralTint: "neutralSoft",
} as const;

/** A tint token's name — `"accentTint"` and its five siblings. */
type TintToken = keyof typeof TINT_SOURCES;

/**
 * The six tints for a colour group, each composited over that group's surface.
 *
 * Called on the base set once, and again on every resolved set in `tokensFor`,
 * so a theme that changes `surface` or a wash gets tints that match rather than
 * the base set's. Overwrites any tint already present: a tint is derived, and a
 * theme that declared one by hand would be declaring a bug.
 */
function withTints<T extends Record<string, string>>(
  colors: T,
): T & Record<TintToken, string> {
  const out: Record<string, string> = { ...colors };
  const surface = colors.surface ?? "#ffffff";
  for (const [tint, wash] of Object.entries(TINT_SOURCES)) {
    const source = colors[wash];
    if (source != null) {
      out[tint] = over(source, surface);
    }
  }
  return out as T & Record<TintToken, string>;
}

export const DECHO_TOKENS = {
  /**
   * Colour.
   *
   * The surface ladder runs bg → surface → surfaceRaised: page, panel, and the
   * thing sitting on the panel. `surfaceOverlay` is deliberately translucent —
   * it is for panels that float over a map, where a solid slab hides exactly
   * the terrain being worked on. Pair it with `effect.blur`.
   *
   * Each status colour has a `Soft` partner at 18% alpha: the wash behind a
   * tag or a selected row, where the solid colour would shout — and, added by
   * `withTints`, a `Tint` partner, which is that wash already flattened onto
   * this set's `surface` and therefore safe as a background.
   */
  color: withTints({
    bg: "#0a0c0f",
    surface: "#111318",
    surfaceRaised: "#171a21",
    surfaceOverlay: "rgba(17, 19, 24, 0.78)",

    border: "#374057",
    borderSubtle: "#23293a",
    borderStrong: "#4a5470",
    /**
     * The border on a translucent surface — a toolbar or panel over a map.
     * A token rather than a literal because it is the one border that has to
     * invert in a light theme: white at low alpha reads as a highlight on
     * dark and as nothing at all on white.
     */
    borderOverlay: "rgba(255, 255, 255, 0.14)",

    text: "#e8ecf4",
    textMuted: "#8b93a7",
    textFaint: "#5a6178",
    onAccent: "#ffffff",

    accent: "#4a7c59",
    accentHover: "#5d9670",
    accentSoft: "rgba(74, 124, 89, 0.18)",
    /** The lighter green the basemap toolbar uses: the accent, over a map. */
    accentOverMap: "#7fb08c",

    info: "#4a7ca8",
    infoSoft: "rgba(74, 124, 168, 0.18)",
    success: "#3f8f63",
    successSoft: "rgba(63, 143, 99, 0.18)",
    warning: "#b8862f",
    warningSoft: "rgba(184, 134, 47, 0.18)",
    danger: "#a4453a",
    dangerSoft: "rgba(164, 69, 58, 0.18)",
    /** The `neutral` tone's tint — the sixth member of the Soft family. */
    neutralSoft: "rgba(139, 147, 167, 0.16)",

    /**
     * AI features get their own colour, everywhere.
     *
     * Not a tone, because it is not a status: it marks the controls that hand
     * work to a model, and a user is entitled to know which those are at a
     * glance without reading the label.
     */
    ai: "#7b5ea7",
    aiSoft: "rgba(123, 94, 167, 0.18)",

    link: "#8fb8ff",
  }),

  /**
   * RAG status — the heatmap scale.
   *
   * Separate from the six tones because it is a different job. A tone answers
   * "how should this tag look"; a status answers "what state is this item in",
   * and the answers have to be stable across every heatmap in the estate or
   * the colours stop meaning anything. Each cell is one fixed state, never a
   * gradient between two.
   *
   * `notAssessed` is deliberately not red: "nobody has looked at this yet" and
   * "this has breached" are different facts, and colouring the first like the
   * second is how a board meeting ends up discussing the wrong row.
   */
  status: {
    critical: "#8e292c",
    high: "#ac2f33",
    atRisk: "#b8862f",
    onTrack: "#3f8f63",
    complete: "#2f7a52",
    notAssessed: "#8b93a7",
    noData: "#5a6178",
  },

  /**
   * The chart series palette, in order.
   *
   * Ten, because that is where a legend stops being readable and a chart needs
   * grouping instead of another colour. `chartSeries(i)` wraps, so a series
   * beyond the tenth repeats rather than crashing or going transparent.
   */
  chart: {
    series1: "#1d9e75",
    series2: "#085041",
    series3: "#5dcaa5",
    series4: "#9fe1cb",
    series5: "#04342c",
    series6: "#e1f5ee",
    series7: "#2d6b55",
    series8: "#4db896",
    series9: "#0a3d2e",
    series10: "#c8ede0",
    /** Axes, ticks and the zero line. */
    axis: "rgba(139, 147, 167, 0.35)",
    /** The horizontal rules behind the plot. */
    grid: "rgba(139, 147, 167, 0.16)",
  },

  /**
   * Spacing.
   *
   * The low end is finer than a 4px scale because this is dense operational
   * UI: the map toolbars in this repo are laid out on 2px gaps and 4px padding,
   * and a scale that starts at 4 would round them up and change what is already
   * shipped.
   */
  space: {
    "1": "2px",
    "2": "4px",
    "3": "6px",
    "4": "8px",
    "5": "12px",
    "6": "16px",
    "7": "24px",
  },

  radius: {
    sm: "4px",
    md: "6px",
    lg: "8px",
    pill: "999px",
  },

  fontSize: {
    xs: "10px",
    sm: "11px",
    md: "12px",
    lg: "13px",
    xl: "15px",
    "2xl": "18px",
  },

  fontFamily: {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },

  /**
   * The decoration layer — what makes a skin dynamic rather than flat.
   *
   * `app` lights the page behind everything. `surface` and `raised` are the
   * washes over a panel's flat colour. `hairline` is painted as a 1px
   * background layer along the top edge of a surface rather than a border, so
   * it can be a gradient that fades out at both ends — a border cannot.
   * `accent` fills primary buttons and active rows.
   *
   * `none` in `classic` is load-bearing; see the note at the top of the file.
   */
  gradient: {
    app: "none",
    surface: "none",
    raised: "none",
    accent: "none",
    hairline: "none",
  },

  /**
   * Shadows.
   *
   * `sm`/`md`/`lg` are the raw ramp. The four semantic ones are what the
   * components actually use, because a skin does not scale a shadow — it
   * changes what a shadow is for: in `modern`, selection is a coloured glow
   * rather than a darker drop.
   */
  shadow: {
    sm: "0 1px 2px rgba(0, 0, 0, 0.3)",
    md: "0 2px 10px rgba(0, 0, 0, 0.35)",
    lg: "0 8px 28px rgba(0, 0, 0, 0.45)",

    card: "0 1px 2px rgba(0, 0, 0, 0.3)",
    cardHover: "0 2px 10px rgba(0, 0, 0, 0.35)",
    selected: "0 1px 2px rgba(0, 0, 0, 0.3), 0 0 0 1px #4a7c59",
    panel: "0 2px 10px rgba(0, 0, 0, 0.35)",
    /**
     * The halo on a status dot, in `currentColor` so one value serves all six
     * tones — the dot sets `color` to its tone and the glow follows. `none` in
     * classic, where a dot is a disc rather than a light source.
     */
    dot: "none",
  },

  effect: {
    /** `backdrop-filter` for the deliberately translucent surfaces. */
    blur: "blur(6px)",
    /**
     * `backdrop-filter` for ordinary cards and panels. `none` in classic,
     * where the surface is opaque and a blur would cost GPU for no pixels.
     */
    surfaceBlur: "none",
    transition: "120ms ease",
    /**
     * Drives the CSS `color-scheme` property, which is what makes the browser
     * draw native scrollbars, checkboxes and date pickers dark or light. A
     * token because it is the one thing `daylight` must flip and no amount of
     * colour work substitutes for: a light theme with dark native controls
     * looks broken in a way nobody can quite name.
     */
    colorScheme: "dark",
  },
} as const;

type BaseTokens = typeof DECHO_TOKENS;

/**
 * The tokens with every value widened to `string` — what a skin resolves to.
 *
 * `-readonly` because `DECHO_TOKENS` is `as const`, and a skin is built by
 * assigning merged groups into a fresh object. Widening the values is the
 * point: a recipe reading `t.color.accent` must not be typed to the literal
 * `"#4a7c59"`, or `modern` would not be assignable to the same type.
 */
export type DechoTokenSet = {
  -readonly [G in keyof BaseTokens]: Record<keyof BaseTokens[G], string>;
};

export type DechoTokenOverrides = {
  [G in keyof BaseTokens]?: Partial<Record<keyof BaseTokens[G], string>>;
};

/**
 * `modern` — the indigo command-centre skin.
 *
 * Everything about it is a consequence of one decision: the page is lit, so
 * the surfaces have to be translucent. Once they are, a flat fill reads as a
 * sticker, so each one gets a wash and a hairline; a black drop shadow reads as
 * dirt, so shadows carry the accent's colour; and 4px corners read as
 * mechanical against all that soft light, so the radii grow.
 */
/**
 * The RAG scale from the heatmap specification. Shared by both Accenture
 * themes, and identical in each: a heatmap that reads differently in dark mode
 * is a heatmap you cannot screenshot into a report.
 *
 * `noData` is the one value the reference names ("Gray — Shade 5") without
 * giving a hex; this is Blueprint's Gray 5, which the rest of the set is drawn
 * from. Worth confirming with whoever owns the palette.
 */
const ACCENTURE_STATUS = {
  critical: "#8e292c", // Red Shade 1
  high: "#ac2f33", // Red Shade 2
  atRisk: "#b83211", // Orange Shade 2
  onTrack: "#1c6e42", // Green Shade 2
  complete: "#165a36", // Green Shade 1
  notAssessed: "#8f99a8", // Gray 3
  noData: "#c5cbd3", // Gray 5 — assumed
} as const;

/**
 * The corporate palette's light end, declared once and used under two names.
 *
 * `accenture-standard` is the name to use — one theme, two modes. `accenture-
 * light` is what it was called before modes existed, and points at the same
 * object rather than a copy of it, because two spellings of one palette is the
 * drift this package exists to remove.
 */
const ACCENTURE_LIGHT: DechoTokenOverrides = {
    color: {
      bg: "#f6f7f9", // Lt Gray 5 — secondary surfaces
      surface: "#ffffff", // White — card backgrounds, tile surfaces
      surfaceRaised: "#ffffff",
      surfaceOverlay: "rgba(255, 255, 255, 0.94)",

      // "Tile and card borders at 20% opacity" — Black, per the reference.
      border: "rgba(17, 20, 24, 0.2)",
      borderSubtle: "rgba(17, 20, 24, 0.12)",
      borderStrong: "#2d72d2",
      borderOverlay: "rgba(17, 20, 24, 0.16)",

      text: "#1c2127", // Dark Gray 1 — headings, body on light
      textMuted: "#2f343c", // Dark Gray 3 — secondary body text
      textFaint: "#8f99a8", // Gray 3
      onAccent: "#ffffff",

      accent: "#2d72d2", // Blue 3 — primary CTAs, links, active tabs
      accentHover: "#215db0", // Blue 2
      accentSoft: "rgba(138, 187, 255, 0.35)", // Blue 5 — tinted backgrounds
      accentOverMap: "#2d72d2",

      ai: "#9d3f9d", // Violet 3 — AI CTAs and AI panel titles
      aiSoft: "rgba(157, 63, 157, 0.14)",

      info: "#2d72d2",
      infoSoft: "rgba(45, 114, 210, 0.12)",
      success: "#1c6e42", // Green Shade 2
      successSoft: "rgba(28, 110, 66, 0.12)",
      warning: "#b83211", // Orange Shade 2
      warningSoft: "rgba(184, 50, 17, 0.12)",
      danger: "#ac2f33", // Red Shade 2
      dangerSoft: "rgba(172, 47, 51, 0.12)",
      neutralSoft: "rgba(143, 153, 168, 0.18)",

      link: "#2d72d2",
    },

    status: ACCENTURE_STATUS,

    // No gradients: "basic" was the brief, and a wash over white reads as a
    // rendering artefact rather than as depth.
    gradient: {
      app: "none",
      surface: "none",
      raised: "none",
      accent: "none",
      hairline: "none",
    },

    shadow: {
      card: "0 1px 2px rgba(17, 20, 24, 0.1)",
      cardHover: "0 2px 6px rgba(17, 20, 24, 0.16)",
      // Blue 4 is the specified focus ring, so selection uses it too.
      selected: "0 0 0 2px #4c90f0",
      panel: "0 2px 8px rgba(17, 20, 24, 0.12)",
      dot: "none",
    },

    radius: {
      sm: "2px",
      md: "3px",
      lg: "4px",
      pill: "999px",
    },

    effect: {
      blur: "blur(4px)",
      surfaceBlur: "none",
      transition: "100ms ease",
      colorScheme: "light",
    },

    chart: {
      // Lighter axis and grid than the shared default: the base values are
      // pitched for a dark plot and disappear on white.
      axis: "rgba(28, 33, 39, 0.35)",
      grid: "rgba(28, 33, 39, 0.12)",
    },
  };

export const SKIN_OVERRIDES: Record<
  Exclude<DechoSkin, "classic">,
  DechoTokenOverrides
> = {
  modern: {
    color: {
      bg: "#080b16",
      // Translucent, because the app gradient behind them is the point. The
      // blur in effect.surfaceBlur is what keeps text on them readable.
      surface: "rgba(19, 23, 42, 0.72)",
      surfaceRaised: "rgba(32, 38, 68, 0.72)",
      surfaceOverlay: "rgba(13, 17, 32, 0.72)",

      // White at low alpha rather than a grey: over a lit background a fixed
      // grey border is darker than the surface in some places and lighter in
      // others, which is how a card ends up looking cut out.
      border: "rgba(255, 255, 255, 0.12)",
      borderSubtle: "rgba(255, 255, 255, 0.07)",
      borderStrong: "rgba(139, 124, 246, 0.5)",

      text: "#e9ecfb",
      textMuted: "#9aa3c4",
      textFaint: "#6a7292",

      accent: "#6c5ce7",
      accentHover: "#8b7cf6",
      accentSoft: "rgba(108, 92, 231, 0.2)",
      accentOverMap: "#8b7cf6",

      info: "#5b8bf7",
      infoSoft: "rgba(91, 139, 247, 0.18)",
      success: "#35d07a",
      successSoft: "rgba(53, 208, 122, 0.16)",
      warning: "#f0a83c",
      warningSoft: "rgba(240, 168, 60, 0.16)",
      danger: "#ef5350",
      dangerSoft: "rgba(239, 83, 80, 0.16)",

      link: "#a9b8ff",
    },

    gradient: {
      // Two pools of light: indigo from above, a cool teal from the top right.
      // Both fade to transparent rather than to a colour, so the same gradient
      // works over any bg and a host can put it on an element it does not own.
      app: "radial-gradient(120% 90% at 50% -20%, rgba(108, 92, 231, 0.3) 0%, rgba(8, 11, 22, 0) 62%), radial-gradient(80% 70% at 108% 4%, rgba(53, 214, 192, 0.12) 0%, rgba(8, 11, 22, 0) 70%)",
      surface:
        "linear-gradient(158deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.015) 42%, rgba(255, 255, 255, 0) 100%)",
      raised:
        "linear-gradient(150deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.02) 100%)",
      accent: "linear-gradient(135deg, #6c5ce7 0%, #8b7cf6 52%, #9d7bf8 100%)",
      // The line along the top edge of every surface. Transparent at both ends
      // so it reads as a highlight catching the edge, not as a rule.
      hairline:
        "linear-gradient(90deg, rgba(108, 92, 231, 0) 0%, rgba(139, 124, 246, 0.7) 32%, rgba(53, 214, 192, 0.45) 68%, rgba(108, 92, 231, 0) 100%)",
    },

    shadow: {
      card: "0 10px 30px rgba(4, 6, 16, 0.5)",
      cardHover:
        "0 16px 40px rgba(4, 6, 16, 0.6), 0 0 22px rgba(108, 92, 231, 0.2)",
      selected:
        "0 16px 40px rgba(4, 6, 16, 0.55), 0 0 0 1px rgba(139, 124, 246, 0.55), 0 0 28px rgba(108, 92, 231, 0.35)",
      panel: "0 18px 44px rgba(4, 6, 16, 0.55)",
      dot: "0 0 8px currentColor, 0 0 2px currentColor",
    },

    radius: {
      sm: "8px",
      md: "10px",
      lg: "14px",
    },

    effect: {
      blur: "blur(14px)",
      surfaceBlur: "blur(14px)",
      transition: "160ms cubic-bezier(0.4, 0, 0.2, 1)",
    },

    status: {
      critical: "#ef5350",
      high: "#f0705f",
      atRisk: "#f0a83c",
      onTrack: "#35d07a",
      complete: "#1f9d6d",
      notAssessed: "#9aa3c4",
      noData: "#6a7292",
    },
  },

  /**
   * `daylight` — the light theme.
   *
   * Not `modern` with the luminance inverted. On a dark background depth comes
   * from a surface being *lighter* than the page; on white there is nowhere
   * lighter to go, so it has to come from shadow, and the shadows here are the
   * only ones in the package that carry weight rather than glow. The status
   * colours are darkened well past their dark-theme values: `#35d07a` on white
   * is a pastel nobody can read, and a "success" nobody can read is a bug.
   */
  daylight: {
    color: {
      bg: "#f4f6fb",
      surface: "rgba(255, 255, 255, 0.86)",
      surfaceRaised: "rgba(255, 255, 255, 0.96)",
      surfaceOverlay: "rgba(255, 255, 255, 0.9)",

      border: "rgba(16, 24, 52, 0.14)",
      borderSubtle: "rgba(16, 24, 52, 0.09)",
      borderStrong: "rgba(85, 70, 214, 0.5)",
      // Inverted: a white hairline on white is invisible.
      borderOverlay: "rgba(16, 24, 52, 0.12)",

      text: "#14192b",
      textMuted: "#4d5573",
      textFaint: "#7c85a3",
      onAccent: "#ffffff",

      accent: "#5546d6",
      accentHover: "#6c5ce7",
      accentSoft: "rgba(85, 70, 214, 0.14)",
      accentOverMap: "#5546d6",

      info: "#2563eb",
      infoSoft: "rgba(37, 99, 235, 0.12)",
      success: "#157f4e",
      successSoft: "rgba(21, 127, 78, 0.12)",
      warning: "#a86a12",
      warningSoft: "rgba(168, 106, 18, 0.14)",
      danger: "#c0392b",
      dangerSoft: "rgba(192, 57, 43, 0.12)",
      neutralSoft: "rgba(77, 85, 115, 0.12)",

      link: "#2f5fe0",
    },

    gradient: {
      app: "radial-gradient(120% 90% at 50% -20%, rgba(108, 92, 231, 0.16) 0%, rgba(244, 246, 251, 0) 60%), radial-gradient(80% 70% at 108% 4%, rgba(53, 214, 192, 0.14) 0%, rgba(244, 246, 251, 0) 70%)",
      surface:
        "linear-gradient(158deg, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0.25) 100%)",
      raised:
        "linear-gradient(150deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.55) 100%)",
      accent: "linear-gradient(135deg, #5546d6 0%, #6c5ce7 100%)",
      hairline:
        "linear-gradient(90deg, rgba(85, 70, 214, 0) 0%, rgba(85, 70, 214, 0.35) 32%, rgba(53, 214, 192, 0.3) 68%, rgba(85, 70, 214, 0) 100%)",
    },

    shadow: {
      card: "0 1px 2px rgba(16, 24, 52, 0.08), 0 8px 24px rgba(16, 24, 52, 0.06)",
      cardHover: "0 12px 28px rgba(16, 24, 52, 0.12)",
      selected: "0 0 0 1px #5546d6, 0 10px 26px rgba(85, 70, 214, 0.18)",
      panel: "0 10px 30px rgba(16, 24, 52, 0.1)",
      // No halo: a glowing dot on white reads as a printing error.
      dot: "none",
    },

    radius: {
      sm: "8px",
      md: "10px",
      lg: "14px",
    },

    effect: {
      blur: "blur(10px)",
      surfaceBlur: "blur(10px)",
      transition: "140ms cubic-bezier(0.4, 0, 0.2, 1)",
      colorScheme: "light",
    },

    status: {
      critical: "#b3261e",
      high: "#c0392b",
      atRisk: "#a86a12",
      onTrack: "#157f4e",
      complete: "#0f5c39",
      notAssessed: "#7c85a3",
      noData: "#b9c0d0",
    },

    chart: {
      axis: "rgba(20, 25, 43, 0.35)",
      grid: "rgba(20, 25, 43, 0.12)",
    },
  },

  /**
   * `command` — amber on near-black.
   *
   * The night-watch theme, and deliberately the least decorated: opaque
   * surfaces, no backdrop blur, and 2px corners. Glass and rounding are
   * pleasant in daylight and a distraction at 03:00 when the screen is the
   * only light in the room — so this one keeps the hairline and the glow on
   * the things that carry status, and takes them off everything else.
   *
   * `warning` is deliberately not the accent: when amber is the interface, an
   * amber warning is invisible.
   */
  command: {
    color: {
      bg: "#07090b",
      surface: "#0f1215",
      surfaceRaised: "#171b20",
      surfaceOverlay: "rgba(10, 13, 16, 0.82)",

      border: "#2a3138",
      borderSubtle: "#1b2126",
      borderStrong: "rgba(240, 168, 60, 0.5)",
      borderOverlay: "rgba(255, 255, 255, 0.1)",

      text: "#e8e4dc",
      textMuted: "#a49c8d",
      textFaint: "#6f6a5f",
      // Dark ink on an amber fill: white on amber fails contrast.
      onAccent: "#12100c",

      accent: "#f0a83c",
      accentHover: "#ffc266",
      accentSoft: "rgba(240, 168, 60, 0.16)",
      accentOverMap: "#ffc266",

      info: "#57a0d3",
      infoSoft: "rgba(87, 160, 211, 0.16)",
      success: "#4f9d5d",
      successSoft: "rgba(79, 157, 93, 0.16)",
      warning: "#e5a11c",
      warningSoft: "rgba(229, 161, 28, 0.16)",
      danger: "#d1453b",
      dangerSoft: "rgba(209, 69, 59, 0.16)",
      neutralSoft: "rgba(164, 156, 141, 0.14)",

      link: "#f0c07a",
    },

    gradient: {
      app: "radial-gradient(110% 80% at 50% -10%, rgba(240, 168, 60, 0.12) 0%, rgba(7, 9, 11, 0) 60%), radial-gradient(70% 60% at 0% 100%, rgba(209, 69, 59, 0.08) 0%, rgba(7, 9, 11, 0) 70%)",
      surface:
        "linear-gradient(158deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0) 60%)",
      raised:
        "linear-gradient(150deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.01) 100%)",
      accent: "linear-gradient(135deg, #f0a83c 0%, #ffc266 100%)",
      hairline:
        "linear-gradient(90deg, rgba(240, 168, 60, 0) 0%, rgba(240, 168, 60, 0.6) 40%, rgba(209, 69, 59, 0.35) 75%, rgba(240, 168, 60, 0) 100%)",
    },

    shadow: {
      card: "0 2px 8px rgba(0, 0, 0, 0.5)",
      cardHover: "0 8px 22px rgba(0, 0, 0, 0.6), 0 0 18px rgba(240, 168, 60, 0.14)",
      selected: "0 0 0 1px rgba(240, 168, 60, 0.6), 0 0 22px rgba(240, 168, 60, 0.25)",
      panel: "0 10px 30px rgba(0, 0, 0, 0.6)",
      dot: "0 0 8px currentColor",
    },

    // Sharp. The fastest way to tell at a glance which theme you are looking
    // at, and — with the two Accenture themes' 2px — the estate's other
    // geometry.
    radius: {
      sm: "2px",
      md: "3px",
      lg: "4px",
    },

    effect: {
      blur: "blur(8px)",
      // Opaque surfaces: no blur to pay for, and none to see.
      surfaceBlur: "none",
      transition: "100ms linear",
      colorScheme: "dark",
    },

    status: {
      critical: "#d1453b",
      high: "#e0644f",
      atRisk: "#e5a11c",
      onTrack: "#4f9d5d",
      complete: "#3c7a48",
      notAssessed: "#a49c8d",
      noData: "#6f6a5f",
    },
  },

  /**
   * `crt` — phosphor green on black, like a vector terminal.
   *
   * `command`'s sibling, taken further: one colour does almost all the work,
   * at different strengths — bright for what you read, dim for what frames it
   * — and the type is monospace throughout. Shadows are a glow in the
   * phosphor rather than darkness, because on a screen that only lights what
   * it draws there is nothing for a shadow to fall on.
   *
   * Pairs with `@acc/decho-basemap`'s `mapStyle="crt"`, drawn in the same
   * green. Scanlines and text glow are not tokens: they are effects over the
   * whole screen, and the app adds them if it wants them.
   *
   * The status colours leave the green on purpose: a red alert in a green
   * interface is the one thing that has to stand out. `success` is the
   * accent, since here green already means "fine".
   */
  crt: {
    color: {
      bg: "#020703",
      surface: "#03110a",
      surfaceRaised: "#06190e",
      surfaceOverlay: "rgba(2, 12, 6, 0.86)",

      border: "#145a2a",
      borderSubtle: "#0b3318",
      borderStrong: "rgba(51, 255, 102, 0.55)",
      borderOverlay: "rgba(51, 255, 102, 0.28)",

      text: "#5cff8a",
      textMuted: "#2fbf5a",
      textFaint: "#1f8a40",
      // Black ink on a lit button, as on an inverted terminal cell.
      onAccent: "#021006",

      accent: "#33ff66",
      accentHover: "#7dffa0",
      accentSoft: "rgba(51, 255, 102, 0.14)",
      accentOverMap: "#33ff66",

      info: "#33ccff",
      infoSoft: "rgba(51, 204, 255, 0.16)",
      success: "#33ff66",
      successSoft: "rgba(51, 255, 102, 0.16)",
      warning: "#ffcc33",
      warningSoft: "rgba(255, 204, 51, 0.16)",
      danger: "#ff4d4d",
      dangerSoft: "rgba(255, 77, 77, 0.16)",
      neutralSoft: "rgba(51, 255, 102, 0.08)",

      link: "#99ffbb",
    },

    gradient: {
      app: "radial-gradient(120% 90% at 50% 0%, rgba(51, 255, 102, 0.08) 0%, rgba(2, 7, 3, 0) 65%)",
      surface: "none",
      raised: "none",
      accent: "none",
      hairline:
        "linear-gradient(90deg, rgba(51, 255, 102, 0) 0%, rgba(51, 255, 102, 0.55) 50%, rgba(51, 255, 102, 0) 100%)",
    },

    shadow: {
      sm: "0 0 4px rgba(51, 255, 102, 0.1)",
      md: "0 0 10px rgba(51, 255, 102, 0.12)",
      lg: "0 0 24px rgba(51, 255, 102, 0.16)",
      card: "0 0 8px rgba(51, 255, 102, 0.08)",
      cardHover: "0 0 16px rgba(51, 255, 102, 0.2)",
      selected: "0 0 0 1px rgba(51, 255, 102, 0.7), 0 0 16px rgba(51, 255, 102, 0.35)",
      panel: "0 0 0 1px rgba(51, 255, 102, 0.12), 0 0 18px rgba(51, 255, 102, 0.12)",
      dot: "0 0 6px currentColor",
    },

    // Square, near enough: a character cell has no rounded corners.
    radius: {
      sm: "0px",
      md: "1px",
      lg: "2px",
    },

    // Monospace for everything, prose included. System fonts only: a theme
    // that fetched a webfont would break inside Foundry, which allows none.
    fontFamily: {
      sans: "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace",
      mono: "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace",
    },

    effect: {
      blur: "blur(4px)",
      surfaceBlur: "none",
      transition: "80ms linear",
      colorScheme: "dark",
    },

    status: {
      critical: "#ff3b3b",
      high: "#ff7a3d",
      atRisk: "#ffcc33",
      onTrack: "#33ff66",
      complete: "#1fbf4c",
      notAssessed: "#2fbf5a",
      noData: "#1f8a40",
    },

    chart: {
      axis: "rgba(51, 255, 102, 0.35)",
      grid: "rgba(51, 255, 102, 0.12)",
    },
  },

  /**
   * `accenture-light` — the corporate palette.
   *
   * Every value here is from the supplied reference, with the token's stated
   * purpose honoured: Blue 3 for primary actions and links, Blue 2 for hover,
   * Blue 1 for pressed, Blue 4 for focus rings, Blue 5 for tinted backgrounds,
   * Violet 3 for AI. Card borders are Black at 20%, as specified.
   *
   * Plain on purpose — gradients `none`, 2px corners, weightless shadows. The
   * house style here is the client's, and a design system's job in that
   * situation is to disappear.
   */
  "accenture-light": ACCENTURE_LIGHT,

  /**
   * `accenture-dark` — the same palette after dark.
   *
   * Surfaces are the reference's own greys: Black for the page, Dark Gray 1
   * for cards, Dark Gray 3 for raised.
   *
   * The tone colours are lightened from their light-mode values, because the
   * reference has no dark-mode-legible member for some of them — Green Shade 2
   * on Black is unreadable, and an unreadable "on track" is worse than an
   * off-palette one. Where the set does have a lighter member it is used
   * exactly: Blue 4 for the accent, Blue 5 for hover, Brand 1 for success.
   *
   * The `status` scale is NOT adjusted. Those seven are the RAG colours the
   * heatmap spec fixes, they sit behind text rather than being text, and a
   * heatmap that reads differently in dark mode is a heatmap you cannot
   * screenshot into a report.
   */
  "accenture-dark": {
    color: {
      bg: "#111418", // Black
      surface: "#1c2127", // Dark Gray 1
      surfaceRaised: "#2f343c", // Dark Gray 3
      surfaceOverlay: "rgba(28, 33, 39, 0.92)",

      border: "rgba(255, 255, 255, 0.16)",
      borderSubtle: "rgba(255, 255, 255, 0.1)",
      borderStrong: "#4c90f0", // Blue 4
      borderOverlay: "rgba(255, 255, 255, 0.16)",

      text: "#f6f7f9", // Lt Gray 5
      textMuted: "#8f99a8", // Gray 3
      // Derived: the reference has no step between Gray 3 and Dark Gray 3.
      textFaint: "#6b7484",
      onAccent: "#ffffff",

      accent: "#4c90f0", // Blue 4 — Blue 3 is too dark on Black
      accentHover: "#8abbff", // Blue 5
      accentSoft: "rgba(76, 144, 240, 0.18)",
      accentOverMap: "#8abbff",

      ai: "#c67fc6", // Violet 3, lightened for contrast on Black
      aiSoft: "rgba(198, 127, 198, 0.18)",

      info: "#4c90f0",
      infoSoft: "rgba(76, 144, 240, 0.18)",
      success: "#1d9e75", // Brand 1 — the set's legible green
      successSoft: "rgba(29, 158, 117, 0.18)",
      warning: "#e0733f", // Orange Shade 2, lightened
      warningSoft: "rgba(224, 115, 63, 0.18)",
      danger: "#e05c60", // Red Shade 2, lightened
      dangerSoft: "rgba(224, 92, 96, 0.18)",
      neutralSoft: "rgba(143, 153, 168, 0.18)",

      link: "#8abbff",
    },

    // Unchanged from light: the RAG scale is fixed by the heatmap spec.
    status: ACCENTURE_STATUS,

    gradient: {
      app: "none",
      surface: "none",
      raised: "none",
      accent: "none",
      hairline: "none",
    },

    shadow: {
      card: "0 1px 2px rgba(0, 0, 0, 0.4)",
      cardHover: "0 2px 8px rgba(0, 0, 0, 0.5)",
      selected: "0 0 0 2px #4c90f0",
      panel: "0 2px 10px rgba(0, 0, 0, 0.5)",
      dot: "none",
    },

    radius: {
      sm: "2px",
      md: "3px",
      lg: "4px",
      pill: "999px",
    },

    effect: {
      blur: "blur(4px)",
      surfaceBlur: "none",
      transition: "100ms ease",
      colorScheme: "dark",
    },

    chart: {
      axis: "rgba(246, 247, 249, 0.35)",
      grid: "rgba(246, 247, 249, 0.12)",
    },
  },

  /**
   * `accenture-sap` — Accenture purple on white.
   *
   * The look the SAP migration estate already draws with: the Ignite process
   * review, PRISM's overview and process tracker, and the FloX harmonisation,
   * transformation, validation and MyMigration widget sets. None of those is a
   * consumer of this package — they are separate widget-set repositories, each
   * holding its own hand-copied `theme.ts` with a provenance comment begging
   * the reader not to let it drift. This theme is that palette, in the one
   * place where copying stops being the only mechanism available.
   *
   * WHERE THE VALUES CAME FROM
   * --------------------------
   * The estate's source of truth is the Overview Page and Process Tracker
   * widget set's `src/theme.ts`, copied into PRISM and from there into Ignite.
   * Its `accenture` object supplies the surfaces, greys and brand ramp here;
   * `semanticPills.ts`'s `PILL_TONE` supplies the five chip colours, which is
   * the strongest evidence in the estate for what a tone should look like,
   * because every migrated table resolves its chips through it.
   *
   * Where the repositories disagreed, this takes the source-of-truth value and
   * the near-misses are recorded rather than averaged: the dependency-flow and
   * data-readiness widgets accent on `#7c3aed`, the FloX donuts on `#A200FF`,
   * and two of them wash the page `#f8f7fc` instead of `#f4f4f7`. Those are the
   * drift, not the design.
   *
   * WHAT MAKES IT DIFFERENT FROM `accenture-light`
   * ----------------------------------------------
   * `accenture-light` is the corporate palette as specified: Blue 3 for
   * actions, Blueprint's greys, 2px corners. This is what a particular
   * programme actually built on top of that: purple rather than blue for every
   * action, Zinc greys rather than Blueprint's, 10px cards, 6px controls, and a
   * shadow that carries a purple cast. Both are "Accenture"; only one of them
   * is what these widgets look like today, and picking the wrong one is
   * immediately visible beside a widget that was not migrated.
   *
   * NO GRADIENTS, DELIBERATELY
   * --------------------------
   * There is no `gradient` override below, and that is not an omission: the
   * base set is `none` throughout, and the estate paints flat. Its one real
   * gradient is Ignite's hero band, which belongs to a page header rather than
   * to every surface, and its filled buttons are a flat `purpleDark` — giving
   * them `gradient.accent` here would make every primary button in the estate
   * change appearance on adoption, which is the one thing a shared package
   * must not do.
   */
  /**
   * `accenture-standard` — the corporate palette, light end.
   *
   * The same values as `accenture-light`, under the name that carries both
   * modes. Declared by reference rather than copied: two spellings of one
   * palette is exactly the drift this package exists to remove, and a test
   * asserts the three names resolve to the same two token sets.
   */
  "accenture-standard": ACCENTURE_LIGHT,

  "accenture-sap": {
    color: {
      bg: "#f4f4f7", // accenture.canvas
      surface: "#ffffff",
      // accenture.offWhite — table headers, the ghost button's hover.
      surfaceRaised: "#fafafb",
      surfaceOverlay: "rgba(255, 255, 255, 0.94)",

      // The estate has two greys here and uses the darker one on controls and
      // the lighter one on cards, which is the opposite way round from the
      // token names' suggestion — so they are mapped by role, not by name:
      // `border` is what a secondary button draws, `borderSubtle` what a card
      // and a table rule draw.
      border: "#d4d4d8", // accenture.borderStrong
      borderSubtle: "#e4e4e7", // accenture.border
      // The brand purple, because in the estate a hovered or active edge turns
      // accent-coloured rather than merely darker.
      borderStrong: "#a100ff", // accenture.purple
      // Dark at low alpha: a white hairline on a white surface is invisible.
      borderOverlay: "rgba(24, 24, 27, 0.14)",

      text: "#18181b",
      textMuted: "#52525b",
      textFaint: "#8a8a94",
      onAccent: "#ffffff",

      // `purpleDark`, not the brand `#a100ff`: this is the fill a primary
      // button gets and it carries white text, which is 8.3:1 here and 3.3:1
      // on the brand purple. The brand purple's place is decoration that holds
      // no text — bars, heatmap fills, an active edge — which is exactly how
      // the estate uses it.
      accent: "#7500c0",
      // One step darker, because the estate's filled buttons darken on hover
      // rather than lighten. `purpleDeep` (#460073) is the literal value used
      // there and is deliberately NOT used here: at that luminance `withAccent`
      // classes a colour as shadow rather than as brand and leaves it behind,
      // so a re-tinted deployment would get a green button that turns purple
      // under the pointer. This is `heroBorder`, one shade up, which re-tints.
      accentHover: "#5c1a94",
      // ≈ `purpleTint` #f4e8ff over white, as an alpha so it also works over
      // the canvas and so the six-tone `*Soft` family stays one notation.
      accentSoft: "rgba(161, 0, 255, 0.1)",
      accentOverMap: "#a100ff",

      // The estate has no AI colour — it has no AI-specific affordance yet
      // beyond the insight chats, which borrow the accent. Violet is not
      // available as a distinction here the way it is in `accenture-light`,
      // because violet IS the accent; this is `levelPalette[5]`'s teal, the
      // remaining hue the estate already draws with. Worth confirming with
      // whoever owns the palette before an AI feature ships against it.
      ai: "#155e63",
      aiSoft: "rgba(21, 94, 99, 0.12)",

      // `levelPalette[1]`'s blue — the estate's one deliberately non-purple
      // informational hue, kept in `igniteStyles.ts` for exactly this reason.
      info: "#1b4e8f",
      infoSoft: "rgba(27, 78, 143, 0.1)",
      // The tone foregrounds are `PILL_TONE`'s: dark enough to be read as
      // 10px uppercase text on white, which the brighter solids are not. The
      // solids live in `status` below, where they sit behind text instead.
      success: "#0f6e3d",
      successSoft: "rgba(18, 134, 75, 0.1)",
      warning: "#8a5300",
      warningSoft: "rgba(208, 135, 0, 0.12)",
      danger: "#9b1c1c",
      dangerSoft: "rgba(220, 75, 75, 0.1)",
      neutralSoft: "rgba(82, 82, 91, 0.07)",

      link: "#7500c0",
    },

    /**
     * The RAG scale, from the estate's `statusPalette`, `scopePalette` and
     * `stagePalette`.
     *
     * `onTrack` and `complete` are the brighter `positive` and the chip green;
     * `atRisk` and `high` are the amber and red *solids* rather than the chip
     * foregrounds, because a heatmap cell is a fill with a label on top.
     *
     * Ignite colours "in progress" purple, and that is not carried here: a
     * status scale whose middle is the brand colour cannot survive a re-tint,
     * and the accent tone already says "this is in flight".
     *
     * `noData` is `stagePalette`'s "Not Started" grey rather than the lighter
     * `borderStrong`, which is one shade too pale to be seen against this
     * theme's canvas — `contrast.test.ts` fails it.
     */
    status: {
      critical: "#9b1c1c",
      high: "#dc4b4b",
      atRisk: "#d08700",
      onTrack: "#12864b",
      complete: "#0f6e3d",
      notAssessed: "#8a8a94",
      noData: "#c7c7ce",
    },

    /**
     * The brand ramp first, then the estate's distinct hues.
     *
     * Five purples in the order `stagePalette` steps through them, so a chart
     * of two or three series is unmistakably this programme's; then the level
     * palette's blue, teal and green and the amber, for the charts that need
     * more than a ramp. The tenth is the neutral grey rather than a sixth hue,
     * because a legend with ten entries is already past the point where colour
     * is doing the work.
     */
    chart: {
      series1: "#a100ff",
      series2: "#7500c0",
      series3: "#460073",
      series4: "#c084fc",
      series5: "#d8b4fe",
      series6: "#1b4e8f",
      series7: "#155e63",
      series8: "#12864b",
      series9: "#d08700",
      series10: "#52525b",
      axis: "rgba(24, 24, 27, 0.35)",
      grid: "rgba(24, 24, 27, 0.12)",
    },

    /**
     * The only theme that names a typeface, and the exception is narrow enough
     * to be worth stating: naming Graphik costs nothing a widget's CSP can
     * block, because it is not a request. If the corporate font is installed —
     * which on an Accenture-managed machine it usually is — the estate's own
     * typography appears; if it is not, the stack falls through to Segoe UI and
     * the system fonts, which is what every one of these widgets already does.
     * What remains forbidden is an `@import`, and there is none here.
     */
    fontFamily: {
      sans: '"Graphik", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
      mono: '"SF Mono", "Roboto Mono", Menlo, Consolas, "Liberation Mono", monospace',
    },

    // 10px cards, 6px controls, 4px on the small stuff — measured off the
    // estate, where a card is 10, a button and an icon tile are 6, and a
    // severity badge or a bar track is 4.
    radius: {
      sm: "4px",
      md: "6px",
      lg: "10px",
    },

    /**
     * Weightless, and tinted.
     *
     * `sm`/`md`/`lg` are overridden as well as the semantic four — unlike the
     * other two light themes here, which leave the raw ramp at classic's
     * dark-theme values. The recipes only use the semantic ones, so nothing in
     * this package notices, but `DECHO_TOKENS.shadow.md` is exported and a
     * consumer reaching for it on white should not get a 35%-black drop.
     *
     * The hover and selection shadows carry a purple cast, which is Ignite's
     * `rgba(70, 0, 115, …)` verbatim. It is dark enough that `withAccent`
     * treats it as shadow and leaves it alone on a re-tint; the selection ring
     * above it is `purpleTintStrong`, which does follow the accent, so the
     * visible half of a selection re-tints and the soft half stays neutral.
     */
    shadow: {
      sm: "0 1px 2px rgba(24, 24, 27, 0.06)",
      md: "0 2px 8px rgba(24, 24, 27, 0.08)",
      lg: "0 8px 24px rgba(24, 24, 27, 0.12)",

      card: "0 1px 4px rgba(24, 24, 27, 0.06)",
      cardHover: "0 3px 12px rgba(70, 0, 115, 0.12)",
      selected: "0 0 0 2px #e6d0ff, 0 4px 16px rgba(70, 0, 115, 0.15)",
      panel: "0 2px 8px rgba(24, 24, 27, 0.08)",
      // Stated rather than inherited: a glowing dot on white reads as a
      // printing error, and this is the token that would make it glow.
      dot: "none",
    },

    effect: {
      blur: "blur(4px)",
      // Opaque surfaces throughout: nothing to blur, nothing to pay for.
      surfaceBlur: "none",
      // 0.15s, which is what every transition in every one of these widgets is.
      transition: "150ms ease",
      colorScheme: "light",
    },
  },
};


/* ==========================================================================
   Modes
   --------------------------------------------------------------------------
   A theme is a palette; a mode is which end of it. `accenture-sap` in light
   mode is white surfaces with #18181b text, and in dark mode near-black
   surfaces with #f4f4f5 text — the same brand, the same geometry, the same RAG
   scale, the same chart series.

   WHY A MODE AND NOT A SEVENTH AND EIGHTH THEME
   ---------------------------------------------
   `accenture-light` and `accenture-dark` are two themes, which means the RAG
   scale, the chart series, the radii, the spacing and the type ramp are
   written twice and kept in step by hand — the drift this package exists to
   remove, reproduced inside it. It also leaves the widget template's generated
   `useDarkTheme()` hook with nothing to select, so five repos either invented a
   dark palette (in colours that are in no brand guide) or deleted the hook.

   WHAT A MODE IS NOT
   ------------------
   An inversion. Three things are deliberate:

     - The RAG scale does NOT move. A heatmap has to screenshot the same in
       both, so `status` is identical across modes.
     - Tones are *lightened*, not reused: #0f6e3d passes on white and fails on
       near-black, so the dark mode declares its own.
     - Not every theme has two modes. `command` is night-watch amber and
       `modern` is lit glass; a light version of either is a different design,
       not a mode. Those declare one mode and `tokensFor(theme, "light")`
       throws rather than inventing one.
   ========================================================================== */

/** Which end of a theme's palette. */
export type DechoMode = "light" | "dark";

/** The modes each theme has, and which one it is by default. */
export const THEME_MODES: Record<
  DechoSkin,
  { readonly default: DechoMode; readonly modes: readonly DechoMode[] }
> = {
  classic: { default: "dark", modes: ["dark"] },
  modern: { default: "dark", modes: ["dark"] },
  daylight: { default: "light", modes: ["light"] },
  command: { default: "dark", modes: ["dark"] },
  crt: { default: "dark", modes: ["dark"] },
  // The pair, folded: `accenture-light` in dark mode IS `accenture-dark`, and a
  // test asserts that token for token. The old names stay as themes so nothing
  // breaks; new code should say `accenture` … which is what they are.
  // The corporate palette, as one theme with two ends. This is the name to
  // use; the two below are what it was before modes existed and are kept so
  // nothing breaks.
  "accenture-standard": { default: "light", modes: ["light", "dark"] },
  "accenture-light": { default: "light", modes: ["light", "dark"] },
  "accenture-dark": { default: "dark", modes: ["dark"] },
  "accenture-sap": { default: "light", modes: ["light", "dark"] },
};

/** The modes a theme offers. */
export function modesFor(theme: DechoSkin): readonly DechoMode[] {
  return THEME_MODES[theme].modes;
}

/** The mode a theme uses when none is asked for. */
export function defaultModeFor(theme: DechoSkin): DechoMode {
  return THEME_MODES[theme].default;
}

/**
 * The dark delta for the themes that have one, on top of that theme's own
 * values — so everything not mentioned here (geometry, type, the RAG scale,
 * the chart series) simply carries over.
 */
export const MODE_OVERRIDES: Partial<Record<DechoSkin, DechoTokenOverrides>> = {
  /** `accenture-standard` after dark — the values that were `accenture-dark`. */
  "accenture-standard": SKIN_OVERRIDES["accenture-dark"],

  /**
   * `accenture-light` in dark mode is exactly the `accenture-dark` theme,
   * which is why this is that theme's override set rather than a second copy
   * of it. `modes.test.ts` asserts the two resolve identically.
   */
  "accenture-light": SKIN_OVERRIDES["accenture-dark"],

  /**
   * `accenture-sap` after dark.
   *
   * Zinc's dark end rather than pure black — #09090b page, #18181b surfaces —
   * because the light mode is Zinc's light end, and the brand purple sits on
   * both. `accent` stays #a100ff: it is 3.4:1 on the dark surface and carries
   * white at 3.3:1, where a light-mode #7500c0 would disappear. Tones are
   * lightened because the light-mode ones do not survive on near-black. The
   * RAG scale is untouched, on purpose.
   */
  "accenture-sap": {
    color: {
      bg: "#09090b",
      surface: "#18181b",
      surfaceRaised: "#27272a",
      surfaceOverlay: "rgba(24, 24, 27, 0.92)",

      border: "#3f3f46",
      borderSubtle: "#27272a",
      borderStrong: "#a100ff",
      // Light at low alpha now: a dark hairline on a dark surface is invisible.
      borderOverlay: "rgba(255, 255, 255, 0.14)",

      text: "#f4f4f5",
      textMuted: "#a1a1aa",
      textFaint: "#71717a",
      onAccent: "#ffffff",

      accent: "#a100ff",
      accentHover: "#b95cff",
      accentSoft: "rgba(161, 0, 255, 0.22)",
      accentOverMap: "#a100ff",
      link: "#c084fc",

      ai: "#2dd4bf",
      aiSoft: "rgba(45, 212, 191, 0.18)",

      info: "#7aa9ef",
      infoSoft: "rgba(122, 169, 239, 0.18)",
      success: "#4ade80",
      successSoft: "rgba(74, 222, 128, 0.18)",
      warning: "#fbbf24",
      warningSoft: "rgba(251, 191, 36, 0.18)",
      danger: "#f87171",
      dangerSoft: "rgba(248, 113, 113, 0.18)",
      neutralSoft: "rgba(161, 161, 170, 0.16)",
    },

    /**
     * Only the hairlines. The ten series colours are a brand decision and do
     * not move between modes — a chart has to be recognisable as the same
     * chart — but an axis is drawn on the page, so it follows the page.
     */
    chart: {
      axis: "rgba(244, 244, 245, 0.35)",
      grid: "rgba(244, 244, 245, 0.12)",
    },

    shadow: {
      sm: "0 1px 2px rgba(0, 0, 0, 0.5)",
      md: "0 2px 8px rgba(0, 0, 0, 0.55)",
      lg: "0 8px 24px rgba(0, 0, 0, 0.6)",
      card: "0 1px 4px rgba(0, 0, 0, 0.5)",
      cardHover: "0 3px 12px rgba(0, 0, 0, 0.6)",
      selected: "0 0 0 2px rgba(161, 0, 255, 0.55), 0 4px 16px rgba(0, 0, 0, 0.6)",
      panel: "0 2px 8px rgba(0, 0, 0, 0.55)",
      dot: "none",
    },

    effect: {
      colorScheme: "dark",
    },
  },
};

/**
 * Every theme's name, in the order they are declared.
 *
 * Exported so that a consumer reading a theme out of configuration, a URL or a
 * Workshop parameter can validate it rather than hope. Iterating this is also
 * how the harness and the tests cover "every theme" without a list that goes
 * stale.
 */
export const DECHO_THEMES: readonly DechoSkin[] = [
  "classic",
  ...(Object.keys(SKIN_OVERRIDES) as DechoSkin[]),
] as const;

/** Type guard for a theme name from outside the type system. */
export function isTheme(name: unknown): name is DechoSkin {
  return typeof name === "string" && (DECHO_THEMES as readonly string[]).includes(name);
}

/**
 * Every token for a theme, with the base set filled in behind the overrides.
 *
 * Throws on a name that is not a theme. It used to fall through to the base
 * set, which is the worst possible answer: `tokensFor("accenture-SAP")` would
 * silently return `classic`, and `classic` is dark, so the mistake looked like
 * a design decision rather than a typo.
 */
export function tokensFor(
  skin: DechoSkin = "classic",
  mode?: DechoMode,
): DechoTokenSet {
  const base = DECHO_TOKENS as unknown as DechoTokenSet;
  if (!isTheme(skin)) {
    throw new Error(
      `@acc/decho-styling: ${JSON.stringify(skin)} is not a theme. ` +
        `Available: ${DECHO_THEMES.join(", ")}.`,
    );
  }
  const wanted = mode ?? defaultModeFor(skin);
  if (!modesFor(skin).includes(wanted)) {
    throw new Error(
      `@acc/decho-styling: ${JSON.stringify(skin)} has no ${wanted} mode ` +
        `(it offers: ${modesFor(skin).join(", ")}). A light \`command\` or a dark ` +
        `\`daylight\` is a different design, not a mode — use defineTheme() if you ` +
        `want one.`,
    );
  }
  // The mode delta sits on top of the theme, which sits on top of the base.
  const modeOverrides =
    wanted === defaultModeFor(skin) ? undefined : MODE_OVERRIDES[skin];

  if (skin === "classic" && modeOverrides == null) {
    return base;
  }
  // One cast, at the end. Assigning group by group instead needs TypeScript to
  // correlate the same key across two mapped types, which it does not do: it
  // widens `merged[group]` to the intersection of every group and rejects each
  // one for missing the others' keys. The shape is asserted in tokens.test.ts
  // — every group present, with exactly the base set's keys — which is the
  // check the cast is standing in for.
  const overrides = (skin === "classic"
    ? {}
    : SKIN_OVERRIDES[skin]) as Record<string, Record<string, string>>;
  const modeDelta = (modeOverrides ?? {}) as Record<string, Record<string, string>>;
  return Object.fromEntries(
    Object.entries(base).map(([group, entries]) => {
      const merged = {
        ...entries,
        ...(overrides[group] ?? {}),
        ...(modeDelta[group] ?? {}),
      } as Record<string, string>;
      // Re-derived after merging, not inherited: the tint depends on this
      // theme-and-mode's washes and surface, and taking the base set's would
      // paint a dark-mode selection in near-black-on-white.
      return [group, group === "color" ? withTints(merged) : merged];
    }),
  ) as DechoTokenSet;
}

/**
 * Only the variables a MODE changes, relative to the theme's default mode.
 *
 * What the stylesheet's `.decho-<theme>.decho-dark` block holds, and what
 * `applyTheme(theme, { mode })` layers on top.
 */
export function modeDeltas(theme: DechoSkin, mode: DechoMode): Record<string, string> {
  if (mode === defaultModeFor(theme)) {
    return {};
  }
  if (MODE_OVERRIDES[theme] == null) {
    return {};
  }
  // Resolved-against-resolved, so the tints the mode implies are in here even
  // though no mode declares one.
  return variableDiff(tokensFor(theme, mode), tokensFor(theme));
}

export type DechoTokens = BaseTokens;
export type DechoTokenGroup = keyof BaseTokens;

/** A colour token name — `"accent"`, `"textMuted"`, and so on. */
export type DechoColor = keyof BaseTokens["color"];

/** A RAG state — the seven a heatmap cell can be in. */
export type DechoStatus = keyof BaseTokens["status"];

/** The fill for a RAG state in a given theme. */
export function statusColor(
  status: DechoStatus,
  skin: DechoSkin = "classic",
): string {
  return tokensFor(skin).status[status];
}

/**
 * The nth series colour, wrapping.
 *
 * Wrapping rather than throwing or fading out: a chart handed eleven series is
 * a chart that needs grouping, and it should say so by repeating a colour
 * rather than by rendering an invisible line nobody notices is missing.
 */
export function chartSeries(index: number, skin: DechoSkin = "classic"): string {
  return seriesColor(tokensFor(skin), index);
}

/** The nth series colour from a resolved token set, wrapping. */
export function seriesColor(tokens: DechoTokenSet, index: number): string {
  const chart = tokens.chart;
  const series = [
    chart.series1,
    chart.series2,
    chart.series3,
    chart.series4,
    chart.series5,
    chart.series6,
    chart.series7,
    chart.series8,
    chart.series9,
    chart.series10,
  ];
  return series[((index % series.length) + series.length) % series.length];
}

/**
 * The six tones a tag, a card stripe or a status dot can take.
 *
 * A closed set rather than "any colour": the point of a shared package is that
 * a warning looks the same in every widget, and an open colour prop is how
 * that stops being true.
 */
export type DechoTone =
  | "neutral"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "danger";

/** The foreground/background pair for a tone, resolved from a skin's palette. */
export function toneColors(
  tone: DechoTone,
  colors: Record<DechoColor, string> = DECHO_TOKENS.color,
): { fg: string; soft: string } {
  switch (tone) {
    case "accent":
      return { fg: colors.accent, soft: colors.accentSoft };
    case "info":
      return { fg: colors.info, soft: colors.infoSoft };
    case "success":
      return { fg: colors.success, soft: colors.successSoft };
    case "warning":
      return { fg: colors.warning, soft: colors.warningSoft };
    case "danger":
      return { fg: colors.danger, soft: colors.dangerSoft };
    case "neutral":
    default:
      return { fg: colors.textMuted, soft: colors.neutralSoft };
  }
}

/**
 * `color.surfaceRaised` → `--decho-color-surface-raised`.
 *
 * Mechanical, with no exceptions table, because the drift test derives names
 * with this same function: a naming rule that needs a lookup to apply is a
 * naming rule the test cannot enforce.
 */
export function tokenVariableName(group: string, key: string): string {
  const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return `--decho-${kebab(group)}-${kebab(key)}`;
}

/**
 * The variables where `resolved` differs from `against`.
 *
 * Computed by comparing two resolved sets rather than by reading whatever was
 * declared, because not every token is declared: `withTints` derives six, and a
 * hand-written list of overrides does not know about them. That is precisely
 * how 1.3.0's theme blocks ended up without tints, leaving every theme to
 * inherit `classic`'s — which are dark.
 */
function variableDiff(
  resolved: DechoTokenSet,
  against: DechoTokenSet,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [group, entries] of Object.entries(resolved)) {
    const base = (against as unknown as Record<string, Record<string, string>>)[group] ?? {};
    for (const [key, value] of Object.entries(entries)) {
      if (value !== base[key]) {
        out[tokenVariableName(group, key)] = value;
      }
    }
  }
  return out;
}

/**
 * EVERY token for a theme as `{ "--decho-…": value }` — base included.
 *
 * This is the one to write onto an element in a host you do not control: it is
 * self-sufficient, so nothing falls through to whatever the host happens to
 * have declared. See `themeDeltas` for the stylesheet's half.
 *
 * Accepts a resolved token set as well as a name, so a custom theme from
 * `defineTheme()` or a re-tint from `withAccent()` can be written out too.
 */
export function allThemeVariables(
  theme: DechoSkin | DechoTokenSet = "classic",
  mode?: DechoMode,
): Record<string, string> {
  const out: Record<string, string> = {};
  const resolved = typeof theme === "string" ? tokensFor(theme, mode) : theme;
  for (const [group, entries] of Object.entries(resolved)) {
    for (const [key, value] of Object.entries(entries)) {
      out[tokenVariableName(group, key)] = value;
    }
  }
  return out;
}

/**
 * @deprecated Renamed to `allThemeVariables`, which says which half it is.
 * Kept because consumers import it; removed no earlier than 2.0.
 */
export const tokenVariables = allThemeVariables;

/**
 * @deprecated Renamed to `themeDeltas`. "Skin" was the old word for a theme and
 * the name did not say that this returns only the changes.
 */
export const skinVariables = themeDeltas;

/**
 * A theme re-tinted to a different primary colour.
 *
 * The everyday version of `defineTheme`: keep a theme exactly as it is — its
 * surfaces, its geometry, its shadows, its status colours — and change only
 * what the accent touches. Hovers, focus rings, the selection glow, the
 * gradient on a primary button and, in `modern`, the hairline along the top of
 * every card all follow.
 *
 *   tokensFor("modern")                 // indigo
 *   withAccent("modern", "#2fbf71")     // the same theme in green
 *
 * WHY THIS IS NOT JUST `color.accent`
 * -----------------------------------
 * An accent is never one value. In `modern`, the indigo appears as three hex
 * shades in the accent gradient, as `rgba(108, 92, 231, …)` in the app glow,
 * the hover glow and the selection ring, and again in the strong border.
 * Overriding `color.accent` alone — which is all `themeVariables` does —
 * turns the buttons green and leaves everything else purple, which reads as a
 * bug rather than as a re-tint.
 *
 * HOW THE FAMILY IS FOUND
 * -----------------------
 * Every colour mentioned anywhere in the token set is parsed, and those within
 * `ACCENT_HUE_TOLERANCE` of the theme's own accent hue are treated as family.
 * Detection rather than a hardcoded list, for two reasons: a hardcoded list
 * drifts the moment a theme gains a shade (it already did, silently, during
 * development), and detection automatically spares the *other* hues a theme
 * deliberately mixes in — modern's hairline fades indigo into teal, and the
 * teal stop survives a re-tint, which is what keeps the hairline from becoming
 * a flat single-colour line.
 *
 * Each family member is re-issued at the same lightness offset from the new
 * accent that it had from the old one, so a ramp stays a ramp. The accent
 * token itself is set to exactly the colour asked for — anything else makes
 * "I asked for #2fbf71" quietly untrue.
 */
const ACCENT_HUE_TOLERANCE = 30;

/**
 * Below this luminance a colour is a shadow or a page stop, not an accent.
 *
 * The hue test alone is not enough *inside* an eligible token either. Modern's
 * app gradient fades to `rgba(8, 11, 22, 0)` — the page colour at zero alpha —
 * and its shadows are built on `rgba(4, 6, 16, …)`. Both are blue-tinted, so
 * both sit within 30° of the indigo accent, and a green re-tint turned the
 * drop shadow into a green glow. A near-black is never what anyone means by
 * "the primary colour", whatever its hue.
 */
const ACCENT_MIN_LUMINANCE = 0.03;

/**
 * The tokens the accent owns.
 *
 * Scanning every token and re-tinting anything near the accent's hue was the
 * first attempt, and it was wrong in a way worth recording: `modern`'s page
 * (#080b16) and text (#e9ecfb) are deliberately blue-tinted, which puts them
 * within 30° of its indigo, so a green re-tint turned the background green.
 *
 * Hue proximity decides which *stops inside* these values are family — that is
 * what spares the teal in modern's hairline. But which values are eligible at
 * all is a fixed list, because "what the accent owns" is a design decision,
 * not something to infer. Notably absent: `ai` and `aiSoft` (AI has its own
 * colour on purpose), every status and chart colour, and every surface.
 */
export const ACCENT_TOKENS: Partial<Record<keyof DechoTokenSet, string[]>> = {
  color: [
    "accent",
    "accentHover",
    "accentSoft",
    "accentOverMap",
    "borderStrong",
    // Links follow the accent. In the Accenture palette Blue 3 is specified
    // for "primary CTAs, navigation selected state, active tab indicators,
    // links" — one decision, so one colour. `info` is deliberately NOT here
    // even though it holds the same blue: an informational status must mean
    // the same thing after a re-tint, or the status scale stops being a scale.
    "link",
  ],
  gradient: ["accent", "hairline", "app"],
  shadow: ["cardHover", "selected"],
};

/** Hex and `r, g, b` triples, the two notations the tokens use. */
const COLOUR_IN_VALUE = /#[0-9a-fA-F]{6}\b|\b\d{1,3},\s*\d{1,3},\s*\d{1,3}\b/g;

export function withAccent(
  skin: DechoSkin,
  accent: string,
  mode?: DechoMode,
): DechoTokenSet {
  // The mode matters and used to be missing: `withAccent(skin, accent)`
  // resolved the theme's DEFAULT mode, so re-tinting a widget that was in dark
  // mode silently snapped it back to light. The accent is a change to a theme,
  // not a replacement for one.
  const base = tokensFor(skin, mode);
  const target = parseColor(accent);
  const from = parseColor(base.color.accent);
  const baseHue = from != null ? hue(from) : null;

  // An unparseable colour returns the theme untouched. Throwing would take a
  // page down over a typo in a Workshop parameter, and an unchanged accent is
  // visible immediately to whoever typed it.
  if (target == null || from == null || baseHue == null) {return base;}

  const fromLum = luminance(from);

  /** The replacement for one family member, keeping its lightness offset. */
  const retint = (colour: Rgba): Rgba => {
    const offset = luminance(colour) - fromLum;
    if (Math.abs(offset) < 0.004) {return target;} // the accent itself
    // Luminance is not linear in the mix amount, so this is approximate by
    // design: it preserves the *order* and rough spacing of a ramp, which is
    // what the eye reads, without pretending to a precision sRGB cannot give.
    return shade(target, Math.max(-0.85, Math.min(0.85, offset * 1.6)));
  };

  const substitutions = new Map<string, string>();
  for (const [group, keys] of Object.entries(ACCENT_TOKENS)) {
    for (const key of keys) {
      const value = (base[group as keyof DechoTokenSet] as Record<string, string>)[key];
      if (value == null) {continue;}
      for (const match of value.match(COLOUR_IN_VALUE) ?? []) {
        if (substitutions.has(match)) {continue;}
        const isHex = match.startsWith("#");
        const parsed = parseColor(isHex ? match : `rgb(${match})`);
        if (parsed == null) {continue;}
        const h = hue(parsed);
        // Greys (h === null) are surfaces and borders, not accent.
        if (h == null || hueDistance(h, baseHue) > ACCENT_HUE_TOLERANCE) {
          continue;
        }
        // Near-blacks are shadow and page stops, not brand — whatever their hue.
        if (luminance(parsed) < ACCENT_MIN_LUMINANCE) {
          continue;
        }
        const next = retint(parsed);
        substitutions.set(match, isHex ? toHex(next) : toRgbTriple(next));
      }
    }
  }

  const retinted = {} as DechoTokenSet;
  for (const group of Object.keys(base) as (keyof DechoTokenSet)[]) {
    const eligible = new Set(ACCENT_TOKENS[group] ?? []);
    const entries: Record<string, string> = {};
    for (const [key, value] of Object.entries(base[group])) {
      entries[key] = eligible.has(key)
        ? value.replace(COLOUR_IN_VALUE, (m) => substitutions.get(m) ?? m)
        : value;
    }
    retinted[group] = entries as never;
  }

  // Exactly what was asked for, and text that can be read on it: white on a
  // lime accent is the commonest mistake in a brand swap.
  retinted.color.accent = toHex(target);
  retinted.color.onAccent = readableOn(target);
  // The tints are derived, so they are re-derived here rather than substituted:
  // `ACCENT_TOKENS` does not list them, and a selected row left tinted with the
  // colour the brand used to be is the sort of thing nobody spots for months.
  retinted.color = withTints(retinted.color as unknown as Record<string, string>) as never;
  return retinted;
}

/**
 * The variables a re-tint changes, ready to put on an element.
 *
 * For the CSS delivery: the classes read custom properties, so re-tinting is a
 * matter of redeclaring the handful that moved. Only the differences are
 * emitted, so it is obvious in devtools what the accent did.
 */
export function accentVariables(
  skin: DechoSkin,
  accent: string,
  mode?: DechoMode,
): Record<string, string> {
  return variableDiff(withAccent(skin, accent, mode), tokensFor(skin, mode));
}

/**
 * A theme defined by a consumer, without a change to this package.
 *
 * Hundreds of projects means dozens of brands, and a design system whose
 * maintainer is on the critical path for every client palette is a bottleneck
 * pretending to be a standard. `defineTheme` puts a project's brand in the
 * project: extend a built-in theme, override the tokens that differ, and apply
 * the result either as CSS (inject `.css`) or inline (spread `.style`, which
 * needs no stylesheet at all) or to components (`tokens=`).
 *
 *   const acme = defineTheme({
 *     name: "acme",
 *     extends: "daylight",
 *     tokens: { color: { accent: "#c8102e" } },
 *   });
 *
 *   <style>{acme.css}</style>
 *   <div className="decho-root decho-acme">…</div>
 *   // or, with no stylesheet:
 *   <DechoSurface tokens={acme.tokens} style={acme.style}>…</DechoSurface>
 */
export interface DechoThemeDefinition {
  /** Used for the class and data attribute: `decho-<name>`. */
  name: string;
  /** Defaults to `"classic"`. */
  extends?: DechoSkin;
  /**
   * Re-tint the base theme's primary colour. Applied first, so `tokens` below
   * can still override anything it produced.
   *
   * This is the common case — "modern, but our green" — and it reaches every
   * derived value: hovers, focus rings, the selection glow, the primary
   * button's gradient and modern's hairline.
   */
  accent?: string;
  tokens?: DechoTokenOverrides;
}

export interface DechoCustomTheme {
  name: string;
  /** Every token, resolved. Hand to a component's `tokens` prop. */
  tokens: DechoTokenSet;
  /** Only what differs from the base set. */
  variables: Record<string, string>;
  /** A ready-to-inject stylesheet block. */
  css: string;
  /** The variables as a style object, for applying without a stylesheet. */
  style: Record<string, string>;
}

export function defineTheme(definition: DechoThemeDefinition): DechoCustomTheme {
  const parent = definition.extends ?? "classic";
  const base =
    definition.accent != null ? withAccent(parent, definition.accent) : tokensFor(parent);
  const overrides = (definition.tokens ?? {}) as Record<string, Record<string, string>>;

  const tokens = Object.fromEntries(
    Object.entries(base).map(([group, entries]) => {
      const merged = { ...entries, ...(overrides[group] ?? {}) } as Record<string, string>;
      // As in `tokensFor`: a custom theme that moves `surface` or a wash gets
      // tints that match it, and cannot declare a wrong one.
      return [group, group === "color" ? withTints(merged) : merged];
    }),
  ) as DechoTokenSet;

  // Only the changed variables are emitted, for the same reason skins only
  // declare their overrides: a block of thirty identical declarations hides
  // the two that matter, in the stylesheet and in devtools alike.
  // Every token that differs from the theme being extended — which is the
  // accent ramp plus anything named in `tokens`, plus the tints those imply.
  // Computed by comparison rather than from the inputs, so a re-tint cannot
  // emit a variable it forgot.
  const variables = variableDiff(tokens, tokensFor(parent));

  const declarations = Object.entries(variables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");

  return {
    name: definition.name,
    tokens,
    variables,
    css: `.decho-${definition.name},\n[data-decho-theme="${definition.name}"] {\n${declarations}\n}\n`,
    style: variables,
  };
}

/**
 * Only the variables a theme *changes* — what the stylesheet's theme block
 * holds.
 *
 * The difference between this and `allThemeVariables` is load-bearing and was
 * not obvious from the old names (`skinVariables` / `tokenVariables`, one
 * letter apart in meaning and nothing apart in shape):
 *
 *   themeDeltas("modern")         →  the ~40 tokens modern overrides
 *   allThemeVariables("modern")   →  all ~83, base included
 *
 * Deltas are right for a stylesheet, where the base block is already in the
 * cascade. They are wrong for writing onto an element in a host you do not
 * control, because anything omitted then resolves against whatever the host
 * has — which, if `tokens.css` is loaded, is the base theme, and the base theme
 * is dark. That mistake cost five widget sets an afternoon; `applyTheme()` uses
 * `allThemeVariables` precisely to avoid it.
 */
export function themeDeltas(skin: DechoSkin): Record<string, string> {
  if (skin === "classic") {
    return {};
  }
  // The overrides the theme declares, plus the tints they imply. Comparing
  // resolved sets is the only way to catch the second kind: `SKIN_OVERRIDES`
  // has no tint in it, and never should — a tint is derived.
  return variableDiff(tokensFor(skin), tokensFor("classic"));
}
