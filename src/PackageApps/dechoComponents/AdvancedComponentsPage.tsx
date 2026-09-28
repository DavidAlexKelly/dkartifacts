/**
 * @acc/decho-components — the heavyweight half.
 *
 * A second page rather than three more shelves on `/components`, for a reason
 * that is about the components rather than about tidiness: these render a
 * great deal. The virtualised table's specimen holds 800 rows, the pivot
 * aggregates 200, the Gantt measures itself with a ResizeObserver and the
 * calendar builds six weeks of buttons. Somebody opening the gallery to check
 * what a Tag looks like should not wait for any of that.
 *
 * The split is a prop, not a fork: both pages are `<ComponentShowcase />` with
 * different `groups`, and the lists come from the package
 * (`EVERYDAY_GROUPS`, `ADVANCED_GROUPS`) so a new shelf lands on the right
 * page without this file being touched.
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
  ADVANCED_GROUPS,
  Banner,
  Button,
  ComponentShowcase,
  DechoSurface,
  SHOWCASE_SPECIMENS,
  Tag,
} from "@acc/decho-components";
import "@acc/decho-components/styles.css";

type ModeChoice = DechoMode | "auto";

const MODE_CHOICES: ModeChoice[] = ["light", "dark", "auto"];

/** The system's colour scheme, watched — same hook as the other pages. */
function useSystemDark(): boolean {
  const [dark, setDark] = useState(prefersDarkMode);
  useEffect(() => onColorSchemeChange(setDark), []);
  return dark;
}

function AdvancedComponentsPage(): React.ReactElement {
  const [theme, setTheme] = useState<DechoSkin>("accenture-sap");
  const [mode, setMode] = useState<ModeChoice>("auto");
  const systemDark = useSystemDark();
  const navigate = useNavigate();

  const available = modesFor(theme);
  const wanted: DechoMode = mode === "auto" ? (systemDark ? "dark" : "light") : mode;
  const effectiveMode: DechoMode = available.includes(wanted) ? wanted : defaultModeFor(theme);
  const tokens = tokensFor(theme, effectiveMode);

  const count = SHOWCASE_SPECIMENS.filter((specimen) =>
    ADVANCED_GROUPS.includes(specimen.group),
  ).length;

  return (
    <DechoSurface tokens={tokens} theme={theme} filled style={page}>
      <div style={topBar}>
        <div>
          <div style={{ fontSize: tokens.fontSize["2xl"], fontWeight: 600 }}>
            Grids, planning and media
          </div>
          <div style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>
            {`${count} heavyweight components — the ones that carry a data engine`}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <Button variant="primary" onClick={() => navigate("/components")}>
              ‹ Everyday components
            </Button>
            <Button onClick={() => navigate("/install?package=@acc/decho-components")}>
              Install &amp; use ›
            </Button>
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

      <Banner
        tone="info"
        title={
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            These are the expensive ones
            <Tag tone="accent">{`${theme} · ${effectiveMode}`}</Tag>
          </span>
        }
      >
        Every component here carries a tested pure module behind it — a
        virtualiser, a pivot engine, a tree, a board, a date scale, a month
        grid. Try them: scroll the 800-row table, move a Kanban card with{" "}
        <kbd>ctrl</kbd> and the arrow keys, walk the tree with <kbd>→</kbd> and{" "}
        <kbd>←</kbd>, and page the calendar by arrowing off the end of a week.
        None of it needs a dependency beyond React.
      </Banner>

      <ComponentShowcase tokens={tokens} groups={ADVANCED_GROUPS} heading={false} />
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

export default AdvancedComponentsPage;
