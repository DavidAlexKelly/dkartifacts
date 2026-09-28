/**
 * @acc/decho-components — the harness.
 *
 * The page is deliberately thin. Almost everything on it is one component:
 *
 *     <ComponentShowcase tokens={tokensFor(theme, mode)} />
 *
 * That is the point being demonstrated. A gallery maintained by the *app* is a
 * gallery that goes stale the first week somebody adds a component and forgets
 * this file; the gallery ships inside the library instead, with a test that
 * compares it against the package's own exports. So what is left here is the
 * part that genuinely belongs to a consumer: choosing a theme and a mode, and
 * saying how to install the thing.
 *
 * WHY THIS IS NOT THE /styling PAGE
 * ---------------------------------
 * `/styling` is about the token layer, and shows the class delivery beside the
 * component one so a drift between them is visible. This page is about the
 * component inventory: what exists, what it is called, and what it looks like
 * — the question that got answered wrongly five times when five widget sets
 * each rebuilt the same progress bar.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DECHO_THEMES,
  defaultModeFor,
  modesFor,
  onColorSchemeChange,
  prefersDarkMode,
  tokensFor,
  type DechoMode,
  type DechoSkin,
} from "@acc/decho-styling";
import {
  Button,
  Callout,
  CodeBlock,
  ComponentShowcase,
  DechoSurface,
  EVERYDAY_GROUPS,
  SHOWCASE_SPECIMENS,
  Tag,
} from "@acc/decho-components";
import "@acc/decho-components/styles.css";

type ModeChoice = DechoMode | "auto";

const MODE_CHOICES: ModeChoice[] = ["light", "dark", "auto"];

const USAGE = `import { ComponentShowcase } from "@acc/decho-components";
import { tokensFor } from "@acc/decho-styling";

// Every component in the library, in your theme, on one page.
<ComponentShowcase tokens={tokensFor("accenture-sap", "dark")} />

// Or just the pieces you were looking for.
<ComponentShowcase groups={["Charts"]} query="donut" />`;

/**
 * The system's colour scheme, watched.
 *
 * `prefersDarkMode()` for the first paint and `onColorSchemeChange` for the
 * rest — the styling package's own subscription rather than a second
 * `matchMedia`, so "auto" here means what `applyTheme(…, { mode: "auto" })`
 * means inside a widget.
 */
function useSystemDark(): boolean {
  const [dark, setDark] = useState(prefersDarkMode);
  useEffect(() => onColorSchemeChange(setDark), []);
  return dark;
}

function ComponentsPage(): React.ReactElement {
  const [theme, setTheme] = useState<DechoSkin>("accenture-sap");
  const [mode, setMode] = useState<ModeChoice>("auto");
  const systemDark = useSystemDark();
  const navigate = useNavigate();

  // Resolved the way the package resolves it: "auto" follows the system, and a
  // theme that does not offer the wanted mode falls back to its own default
  // rather than throwing at somebody who clicked a button. `command` is
  // dark-only and `daylight` light-only, which the buttons say on hover.
  const available = modesFor(theme);
  const wanted: DechoMode = mode === "auto" ? (systemDark ? "dark" : "light") : mode;
  const effectiveMode: DechoMode = available.includes(wanted) ? wanted : defaultModeFor(theme);

  const tokens = tokensFor(theme, effectiveMode);

  // The heavyweight components live on their own page: their specimens render
  // 800 table rows, a pivot over 200 and six weeks of calendar buttons, and
  // somebody checking what a Tag looks like should not wait for that.
  const everyday = SHOWCASE_SPECIMENS.filter((specimen) =>
    EVERYDAY_GROUPS.includes(specimen.group),
  ).length;

  return (
    <DechoSurface tokens={tokens} theme={theme} filled style={page}>
      <div style={topBar}>
        <div>
          <div style={{ fontSize: tokens.fontSize["2xl"], fontWeight: 600 }}>
            @acc/decho-components
          </div>
          <div style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>
            {`${everyday} everyday components — rendered from the package, not redrawn here`}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <Button
              variant="primary"
              onClick={() => navigate("/install?package=@acc/decho-components")}
            >
              Install &amp; use ›
            </Button>
            <Button onClick={() => navigate("/components/advanced")}>
              Grids, planning &amp; media ›
            </Button>
            <Button onClick={() => navigate("/styling")}>The tokens behind it ›</Button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MODE_CHOICES.map((choice) => {
              const supported =
                choice === "auto" ? available.length > 1 : available.includes(choice);
              return (
                <Button
                  key={choice}
                  size="sm"
                  variant={mode === choice ? "primary" : "default"}
                  disabled={!supported}
                  onClick={() => setMode(choice)}
                  title={
                    supported
                      ? choice === "auto"
                        ? `Follow the system — currently ${systemDark ? "dark" : "light"}`
                        : `Show ${theme} in ${choice} mode`
                      : `${theme} has no ${choice === "auto" ? "second" : choice} mode`
                  }
                >
                  {choice}
                </Button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {DECHO_THEMES.map((option) => (
              <Button
                key={option}
                size="sm"
                variant={theme === option ? "primary" : "default"}
                onClick={() => setTheme(option)}
                title={`Render every component in ${option}`}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <Callout
        tone="info"
        title={
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            This page is one component
            <Tag tone="accent">{`${theme} · ${effectiveMode}`}</Tag>
          </span>
        }
      >
        Everything below is <code>&lt;ComponentShowcase /&gt;</code>. It lives in
        the library so that it cannot fall behind it: a test in the package
        compares the specimen list against the package&apos;s own exports and
        fails, by name, on the first component that is added without one. The
        theme arrives as values, so nothing here depends on a stylesheet having
        loaded — which is the delivery a Foundry widget needs.
      </Callout>

      <CodeBlock label="Using it in your own app" code={USAGE} />

      {/*
        The whole inventory. No `tokens` juggling per component: the showcase
        writes the token set onto one wrapper and every component below reads
        it through custom properties, which is how the library is meant to be
        themed and therefore what a harness should be seen doing.
      */}
      <ComponentShowcase tokens={tokens} groups={EVERYDAY_GROUPS} />
    </DechoSurface>
  );
}

const page: React.CSSProperties = {
  height: "100%",
  overflow: "auto",
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 24,
};

const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

export default ComponentsPage;
