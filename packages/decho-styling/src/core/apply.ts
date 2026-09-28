/**
 * Putting a theme on a document, from JavaScript.
 *
 * WHY THE CSS CLASS IS NOT ENOUGH
 * -------------------------------
 * The documented way to select a theme is a class:
 *
 *     <html class="decho-root decho-accenture-sap">
 *
 * That works when you own the page. Inside a Foundry custom widget you do not:
 * `@osdk/cli widgetset deploy` ships the built assets and the host provides the
 * document, so a class written into `index.html` never reaches the browser.
 *
 * And the failure is not "no theme". `tokens.css` declares the base set on
 * `:root`, the base set is `classic`, and `classic` is dark — so a widget whose
 * theme class went missing renders in a *dark* theme: near-black scrollbars,
 * navy cards, light text on white. Five widget sets shipped exactly that.
 *
 * `applyTheme` removes the dependency on the host's markup: it writes the
 * variables onto an element you definitely have.
 *
 *     import { applyTheme } from "@acc/decho-styling";
 *     applyTheme("accenture-sap");          // before React mounts
 *
 * It is the same mechanism `DechoSurface` uses in @acc/decho-components, for
 * the same reason — in a widget, a stylesheet is the thing that silently fails.
 */

import {
  type DechoMode,
  type DechoSkin,
  type DechoTokenSet,
  allThemeVariables,
  defaultModeFor,
  modesFor,
  tokensFor,
} from "./tokens.js";

/**
 * Does the user's system ask for a dark interface?
 *
 * Vanilla rather than a React hook, because the root entry point of this
 * package has no React dependency and should not gain one. The widget
 * template already generates `useDarkTheme()`; this is the same signal for
 * everything that is not React, and what `mode: "auto"` reads.
 */
export function prefersDarkMode(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * Call back whenever the system preference changes. Returns an unsubscribe.
 *
 * The preference changes while a widget is open — a laptop switching at sunset
 * is the common case — so a theme chosen once at startup is a theme that goes
 * wrong an hour later.
 */
export function onColorSchemeChange(
  listener: (prefersDark: boolean) => void,
): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (event: MediaQueryListEvent) => listener(event.matches);
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}

/** The subset of an element this module touches, so tests need no DOM. */
export interface StyleTarget {
  style: {
    setProperty(name: string, value: string): void;
    removeProperty(name: string): void;
  };
  classList?: { add(...tokens: string[]): void; remove(...tokens: string[]): void };
}

export interface ApplyThemeOptions {
  /**
   * Which end of the theme's palette.
   *
   *   "light" | "dark"   explicit
   *   "auto"             follow `prefers-color-scheme`, and keep following it:
   *                      the returned undo unsubscribes
   *
   * Omitted, the theme's own default is used. A theme with only one mode
   * throws rather than inventing the other — see `modesFor`.
   */
  mode?: DechoMode | "auto";
  /**
   * Where to write the variables. Defaults to `document.documentElement`,
   * which is what a widget wants: one call, everything below it themed.
   */
  element?: StyleTarget | null;
  /**
   * Also set `background`, `color`, `font-family` and `color-scheme` on the
   * target (and on `document.body`, when the target is the document).
   *
   * On by default, and it is the half people forget: an unpainted page is not
   * white, it is whatever the host is — which is how a light widget ends up
   * with a black page behind it. `color-scheme` is what puts the *native*
   * scrollbars and form controls in the same theme.
   */
  paint?: boolean;
}

/**
 * Write a theme onto an element as CSS custom properties.
 *
 * Returns a function that undoes it — handy in a React effect, and what makes
 * this testable without a browser.
 */
export function applyTheme(
  theme: DechoSkin | DechoTokenSet = "classic",
  options: ApplyThemeOptions = {},
): () => void {
  // "auto" is resolved here and then re-resolved on every change, so the widget
  // follows the system rather than sampling it once at startup.
  if (options.mode === "auto" && typeof theme === "string") {
    const supportsDark = modesFor(theme).includes("dark");
    let undo = applyTheme(theme, {
      ...options,
      mode: supportsDark && prefersDarkMode() ? "dark" : defaultModeFor(theme),
    });
    const unsubscribe = onColorSchemeChange((prefersDark) => {
      undo();
      undo = applyTheme(theme, {
        ...options,
        mode: supportsDark && prefersDark ? "dark" : defaultModeFor(theme),
      });
    });
    return () => {
      unsubscribe();
      undo();
    };
  }

  const mode = options.mode === "auto" ? undefined : options.mode;
  const tokens: DechoTokenSet =
    typeof theme === "string" ? tokensFor(theme, mode) : theme;
  const variables =
    typeof theme === "string"
      ? allThemeVariables(theme, mode)
      : allThemeVariables(tokens);

  const target =
    options.element ??
    (typeof document !== "undefined" ? (document.documentElement as StyleTarget) : null);

  if (target == null) {
    // Server rendering, or a test with no DOM. Doing nothing is correct: there
    // is no document to theme, and throwing would make SSR everyone's problem.
    return () => {};
  }

  const paint = options.paint ?? true;
  const names = Object.keys(variables);

  for (const [name, value] of Object.entries(variables)) {
    target.style.setProperty(name, value);
  }

  const modeClass =
    typeof theme === "string" && mode != null && mode !== defaultModeFor(theme)
      ? `decho-${mode}`
      : null;

  if (typeof theme === "string") {
    target.classList?.add("decho-root", `decho-${theme}`);
    if (modeClass != null) {target.classList?.add(modeClass);}
  } else {
    target.classList?.add("decho-root");
  }

  if (paint) {
    target.style.setProperty("background", tokens.color.bg);
    target.style.setProperty("color", tokens.color.text);
    target.style.setProperty("font-family", tokens.fontFamily.sans);
    target.style.setProperty("color-scheme", tokens.effect.colorScheme);

    if (
      options.element == null &&
      typeof document !== "undefined" &&
      document.body != null
    ) {
      document.body.style.setProperty("background", tokens.color.bg);
      document.body.style.setProperty("color", tokens.color.text);
    }
  }

  return () => {
    for (const name of names) {
      target.style.removeProperty(name);
    }
    if (typeof theme === "string") {
      target.classList?.remove("decho-root", `decho-${theme}`);
      if (modeClass != null) {target.classList?.remove(modeClass);}
    } else {
      target.classList?.remove("decho-root");
    }
    if (paint) {
      for (const property of ["background", "color", "font-family", "color-scheme"]) {
        target.style.removeProperty(property);
      }
    }
  };
}

export interface AssertThemeOptions {
  /** The mode you expect to be live, if not the theme's default. */
  mode?: DechoMode;
  element?: Element | null;
  /** Injected for tests; defaults to `getComputedStyle`. */
  read?: (name: string) => string;
  /** Throw instead of warning. Off by default: a warning is enough to act on. */
  strict?: boolean;
}

/**
 * Check, at runtime, that the theme you asked for is the theme in force.
 *
 * Call it once in development. It answers the question nobody thought to ask
 * for an entire afternoon: *are the variables actually there?* A missing theme
 * resolves to the base set rather than to nothing, so the symptom is a widget
 * that looks wrong rather than one that looks unstyled — and "looks wrong" is
 * indistinguishable from "somebody chose that".
 *
 *     if (import.meta.env.DEV) assertThemeApplied("accenture-sap");
 *
 * Returns true when the theme is live, false when it is not. Never throws
 * unless asked to, and is a no-op with no DOM.
 */
export function assertThemeApplied(
  theme: DechoSkin,
  options: AssertThemeOptions = {},
): boolean {
  const expected = tokensFor(theme, options.mode).color.surface;

  const read =
    options.read ??
    (typeof window !== "undefined" && typeof getComputedStyle === "function"
      ? (name: string) =>
          getComputedStyle(
            options.element ?? document.documentElement,
          ).getPropertyValue(name)
      : null);

  if (read == null) {
    return true;
  }

  const actual = read("--decho-color-surface").trim();

  if (actual === "") {
    report(
      `@acc/decho-styling: no theme is applied — --decho-color-surface is not set. ` +
        `Nothing will be styled by the CSS classes, and components will use their ` +
        `built-in fallbacks. Call applyTheme(${JSON.stringify(theme)}) before rendering, ` +
        `or import @acc/decho-styling/tokens.css and put "decho-root decho-${theme}" on your root element.`,
      options.strict,
    );
    return false;
  }

  if (actual.toLowerCase() !== expected.toLowerCase()) {
    report(
      `@acc/decho-styling: the theme in force is not ${JSON.stringify(theme)} — ` +
        `--decho-color-surface is ${actual}, expected ${expected}. ` +
        `The commonest cause is a theme class that did not reach the document, in which ` +
        `case the variables fall back to the BASE theme, which is dark. ` +
        `applyTheme(${JSON.stringify(theme)}) fixes it wherever the markup comes from.`,
      options.strict,
    );
    return false;
  }

  return true;
}

function report(message: string, strict = false): void {
  if (strict) {
    throw new Error(message);
  }
  // Deliberately console.warn rather than throw: this runs in a browser, in
  // development, and the point is to be impossible to miss without being
  // impossible to ignore. `strict` is there for a test suite that wants both.
  console.warn(message);
}
