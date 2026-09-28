/**
 * @acc/decho-styling — the harness.
 *
 * Two things it has to show, neither of which a unit test can:
 *
 *   1. Both deliveries side by side. `tokens.test.ts` proves the values match;
 *      only a rendered page proves the result looks the same, so every section
 *      puts a class-based example next to a component one.
 *   2. Both skins, switchable. A skin that is only ever seen in isolation is a
 *      skin whose gaps go unnoticed — the switch at the top re-renders
 *      everything, and anything that fails to change is a token somebody
 *      hard-coded.
 *
 * The stylesheet import is here for the class-based examples only. The
 * components need no stylesheet, so if it ever stopped resolving, half of this
 * page would keep working and half would go bare — which is exactly the
 * diagnosis you want.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DECHO_TOKENS,
  defaultModeFor,
  modesFor,
  onColorSchemeChange,
  prefersDarkMode,
  themeVariables,
  tokensFor,
  withAccent,
  withTheme,
  type DechoMode,
  type DechoSkin,
  type DechoTone,
} from "@acc/decho-styling";
import {
  dividerStyle,
  inputStyle,
  labelStyle,
  monoStyle,
  sectionLabelStyle,
} from "@acc/decho-components";
import {
  AppBody,
  AppBreadcrumb,
  AppContent,
  AppFooter,
  AppHeader,
  AppShell,
  AppSidebar,
  AppSidebarNav,
  BarChart,
  Button,
  Callout,
  Card,
  DataTable,
  Dialog,
  Drawer,
  FacetGroup,
  ChartLegend,
  DechoSurface,
  DonutChart,
  NavItem,
  Panel,
  Sparkline,
  StatusHeatmap,
  Tabs,
  Tag,
  Toolbar,
  ToolbarSpacer,
  ToolbarStatus,
  type BarDatum,
  type DataTableColumn,
  type HeatmapRow,
} from "@acc/decho-components";
import { InstallCard } from "./InstallCard";
import "@acc/decho-styling/tokens.css";
import "@acc/decho-components/styles.css";

const TONES: DechoTone[] = [
  "neutral",
  "accent",
  "info",
  "success",
  "warning",
  "danger",
];

/** The accent a customer deployment might override to. */
const AMBER = "#b8862f";

/**
 * The accent picker. `undefined` is the theme's own — the first swatch shows
 * whatever that is, so "back to default" is always one click away.
 */
const ACCENTS: { label: string; value: string | undefined }[] = [
  { label: "the theme's own accent", value: undefined },
  { label: "green", value: "#2fbf71" },
  { label: "amber", value: "#e0a02a" },
  { label: "crimson", value: "#d4344e" },
  { label: "cyan", value: "#1fa8c4" },
  { label: "lime (light accent, dark button text)", value: "#c3e352" },
];

const SKINS: DechoSkin[] = [
  "classic",
  "modern",
  "daylight",
  "command",
  "accenture-standard",
  "accenture-light",
  "accenture-dark",
  "accenture-sap",
];

/**
 * Why a theme has only one mode, in the words the switch shows on hover.
 *
 * Worth saying out loud rather than greying a button out silently: a
 * single-mode theme is a design decision, not a gap waiting to be filled.
 */
const MODE_NOTE: Record<DechoSkin, string> = {
  classic: "Flat military green on near-black — the palette two estates shipped.",
  modern: "Lit glass over a dark background; the light itself is the design.",
  daylight: "The light theme, and the one the dark themes are an alternative to.",
  command: "Amber on near-black for a night watch; a light version is a different product.",
  "accenture-standard": "The corporate palette, light and dark in one theme.",
  "accenture-light": "The corporate palette in light, with accenture-dark as its dark mode.",
  "accenture-dark": "The dark end of the corporate palette; select accenture-light to get both modes.",
  "accenture-sap": "The SAP migration estate's look, in light and dark.",
};

const SKIN_BLURBS: Record<DechoSkin, string> = {
  classic: "Flat, military green, opaque — the palette this project has always drawn with",
  modern: "Indigo glass over a lit background, gradient hairlines, glowing selection",
  daylight: "The light theme: depth from shadow rather than luminance, darkened status colours",
  command: "Amber on near-black, sharp corners, opaque surfaces — the night watch",
  "accenture-standard": "The corporate palette as one theme with both modes — the name to use; accenture-light and accenture-dark are what it was called before",
  "accenture-light": "Corporate palette: Blue 3 actions, Violet 3 for AI, fixed RAG scale, brand chart series",
  "accenture-dark": "The same palette on Black and Dark Gray 1 — tones lightened, RAG scale unchanged",
  "accenture-sap": "Accenture purple on white — the SAP migration estate's look: purple actions, Zinc greys, 10px cards",
};

/** Rows for the table demo. Shaped like the estate's: an id, a name, figures. */
interface WorkRow {
  id: string;
  name: string;
  owner: string;
  fields: number;
  severity: string;
}

const WORK_ROWS: WorkRow[] = [
  { id: "r1", name: "AV-27 Recovery", owner: "Sustainment", fields: 140, severity: "High" },
  { id: "r2", name: "Bridging set B", owner: "Engineering", fields: 12, severity: "Medium" },
  { id: "r3", name: "Field hospital 4", owner: "Medical", fields: 64, severity: "Medium" },
];

const WORK_COLUMNS: DataTableColumn<WorkRow>[] = [
  { key: "name", header: "Object", value: (r) => r.name },
  { key: "owner", header: "Workstream", value: (r) => r.owner },
  { key: "fields", header: "Fields", value: (r) => r.fields, numeric: true },
  {
    key: "severity",
    header: "Severity",
    value: (r) => r.severity,
    render: (r) => (
      <Tag tone={r.severity === "High" ? "danger" : "warning"}>{r.severity}</Tag>
    ),
  },
];

/** A quarter of delivery, for the charts. */
const TREND = [12, 15, 14, 19, 22, 21, 26, 31, 29, 34, 38, 41];

const WORKSTREAMS: BarDatum[] = [
  { label: "Sustainment", value: 42 },
  { label: "Movement", value: 31 },
  { label: "Medical", value: 24 },
  { label: "Comms", value: 18 },
  { label: "Engineering", value: 12 },
];

const HEATMAP_COLUMNS = ["W1", "W2", "W3", "W4", "W5", "W6"];

const HEATMAP_ROWS: HeatmapRow[] = [
  { label: "Operations", cells: ["complete", "complete", "onTrack", "onTrack", "atRisk", "notAssessed"] },
  { label: "Asset Management", cells: ["complete", "onTrack", "onTrack", "atRisk", "high", "notAssessed"] },
  { label: "Supply", cells: ["onTrack", "atRisk", "high", "critical", "high", "atRisk"] },
  { label: "Human Resources", cells: ["onTrack", "onTrack", "onTrack", "onTrack", "notAssessed", undefined] },
  { label: "Finance", cells: ["notAssessed", "notAssessed", "onTrack", "onTrack", "onTrack", undefined] },
];

const SHELL_NAV = [
  { key: "overview", label: "System Overview", description: "Cross-enterprise picture", icon: "◍", group: "System views" },
  { key: "orchestration", label: "Orchestration", description: "Decisions and dependencies", icon: "⌸", group: "System views" },
  { key: "architecture", label: "System Architecture", description: "Underlying capabilities", icon: "◫", group: "System views" },
  { key: "operations", label: "Operations", description: "Restore mission coverage", icon: "O", group: "Mission domains", tone: "success" as const },
  { key: "supply", label: "Supply & Warehousing", description: "Source critical material", icon: "S", group: "Mission domains", tone: "warning" as const },
  { key: "finance", label: "Finance", description: "Assess enterprise impact", icon: "F", group: "Mission domains" },
];

const DOMAINS = [
  { label: "Operations", description: "Restore mission coverage", tone: "success" },
  { label: "Asset Management", description: "Diagnose and recover", tone: "success" },
  { label: "Supply & Warehousing", description: "Source critical material", tone: "warning" },
  { label: "Human Resources", description: "Allocate qualified workforce", tone: "neutral" },
  { label: "Finance", description: "Assess enterprise impact", tone: "neutral" },
] as const;

const AGENTS = [
  { code: "OSR", name: "Operations Sync & Resilience", tone: "neutral" },
  { code: "PMR", name: "Predictive Maintenance & Readiness", tone: "warning" },
  { code: "SRC", name: "Shortage, Substitution & Resupply", tone: "accent" },
  { code: "WDA", name: "Warehouse Daily Action", tone: "warning" },
] as const;

const TRACE = [
  { time: "07:15:34", text: "getHumanReviewThreshold → 0.6", tone: "neutral" },
  { time: "07:15:39", text: "recommendationNarrative emitted", tone: "accent" },
  { time: "07:15:43", text: "Approved · escalated priority to 1", tone: "success" },
] as const;

function StylingPage(): React.ReactElement {
  // Modern by default here because it is the skin this page exists to show.
  // The package still defaults to classic: nothing changes skin implicitly.
  const [skin, setSkin] = useState<DechoSkin>("modern");
  // "auto" is the interesting default here: it is what a widget uses, and it
  // makes this page change under you when the operating system does.
  const [mode, setMode] = useState<DechoMode | "auto">("auto");
  const systemDark = useSystemDark();
  const [selected, setSelected] = useState("A");
  const [view, setView] = useState("Orchestration");
  const [accent, setAccent] = useState<string | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(false);
  const [navKey, setNavKey] = useState("orchestration");
  const [tab, setTab] = useState("objects");
  const [facets, setFacets] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>(["r1"]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerRow, setDrawerRow] = useState<string | null>(null);
  const navigate = useNavigate();

  /*
    The mode, resolved the way `applyTheme` resolves it: "auto" follows the
    system, and a theme that does not offer the wanted mode falls back to its
    own default rather than throwing at the user. `command` is dark-only and
    `daylight` is light-only, so the switch below disables what they lack.
  */
  const available = modesFor(skin);
  const wanted: DechoMode = mode === "auto" ? (systemDark ? "dark" : "light") : mode;
  const effectiveMode: DechoMode = available.includes(wanted)
    ? wanted
    : defaultModeFor(skin);

  // The theme, as values, once. An accent used to be a prop on the surface;
  // it is now a re-tinted token set, which is the same decision made one level
  // earlier and in one place rather than on every component that needed it.
  const t =
    accent != null
      ? // The mode goes with it. Without this argument a re-tint resolved the
        // theme's default mode, so picking an accent while in dark mode snapped
        // the page back to light — which is exactly what it looked like.
        withAccent(skin, accent, effectiveMode)
      : tokensFor(skin, effectiveMode);

  return (
    <DechoSurface tokens={t} theme={skin} filled style={page}>
      <div style={topBar}>
        <div>
          <div style={{ fontSize: t.fontSize["2xl"], fontWeight: 600 }}>
            @acc/decho-styling + @acc/decho-components
          </div>
          <div style={{ color: t.color.textMuted, fontSize: t.fontSize.sm }}>
            Seven themes as tokens, and the components that wear them — two
            packages, neither depending on the other at runtime
          </div>
          {/*
            The way out of the catalogue and into a repo. Deliberately up here
            rather than only in the panel below: this page is what convinces
            somebody to use the package, and the next thing they need is how —
            which should not be a small button in a header they have to find.
          */}
          <div style={{ marginTop: 10 }}>
            <Button
              variant="primary"
              onClick={() => navigate("/install?package=@acc/decho-styling")}
            >
              Install &amp; use ›
            </Button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {ACCENTS.map((option) => (
            <button
              key={option.label}
              type="button"
              title={`Re-tint ${skin} to ${option.label}`}
              onClick={() => setAccent(option.value)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                cursor: "pointer",
                background: option.value ?? "var(--decho-color-accent)",
                border:
                  accent === option.value
                    ? "2px solid var(--decho-color-text)"
                    : "1px solid var(--decho-color-border)",
              }}
            />
          ))}
          <span style={{ width: 8 }} />
          {/*
            The mode switch. Disabled options are not hidden on purpose: "this
            theme has no light mode" is information, and hiding it makes the
            control look broken instead of honest.
          */}
          {(["light", "dark", "auto"] as const).map((option) => {
            const supported =
              option === "auto" ? available.length > 1 : available.includes(option);
            return (
              <Button
                key={option}
                size="sm"
                variant={mode === option ? "primary" : "default"}
                disabled={!supported}
                onClick={() => setMode(option)}
                title={
                  supported
                    ? option === "auto"
                      ? `Follow the system — currently ${systemDark ? "dark" : "light"}`
                      : `Show ${skin} in ${option} mode`
                    : `${skin} has no ${option === "auto" ? "second" : option} mode: ${MODE_NOTE[skin]}`
                }
              >
                {option}
              </Button>
            );
          })}
          <span style={{ width: 8 }} />
          {SKINS.map((option) => (
            <Button
              key={option}
              variant={skin === option ? "primary" : "default"}
              onClick={() => setSkin(option)}
              title={SKIN_BLURBS[option]}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>

      {/* ── How to get this exact theme into a repo ───────────────────────── */}
      <InstallCard skin={skin} />

      {/* ── Light and dark ────────────────────────────────────────────────── */}
      <Section
        title="Light and dark are one theme, not two"
        note="A theme is a palette; a mode is which end of it. The two panels below are the same theme, the same brand, the same RAG scale and the same geometry — resolved twice."
      >
        {modesFor(skin).length > 1 ? (
          <div style={grid}>
            {(["light", "dark"] as const).map((each) => {
              const modeTokens = tokensFor(skin, each);
              return (
                <DechoSurface
                  key={each}
                  tokens={modeTokens}
                  filled
                  style={{ padding: 16, borderRadius: modeTokens.radius.lg }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 600, color: modeTokens.color.text }}>
                      {skin} · {each}
                      {each === effectiveMode ? " (in force)" : ""}
                    </div>
                    <Tag tone="accent">{modeTokens.color.surface}</Tag>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(["neutral", "accent", "info", "success", "warning", "danger"] as DechoTone[]).map((tone) => (
                      <Tag key={tone} tone={tone}>
                        {tone}
                      </Tag>
                    ))}
                  </div>
                  {/* The tints, as backgrounds, in both modes at once. The bug
                      they exist for is only visible this way: a tint read as a
                      value in one mode and painted in the other is a chalky
                      light row on a near-black card, and no unit test sees it. */}
                  <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(["neutral", "accent", "info", "success", "warning", "danger"] as DechoTone[]).map((tone) => (
                      <span
                        key={tone}
                        title={`color.${tone}Tint — opaque, and follows the mode`}
                        style={{
                          background: modeTokens.color[`${tone}Tint` as keyof typeof modeTokens.color],
                          color: modeTokens.color.text,
                          border: `1px solid ${modeTokens.color.borderSubtle}`,
                          borderRadius: modeTokens.radius.sm,
                          padding: "2px 6px",
                          fontSize: modeTokens.fontSize.xs,
                        }}
                      >
                        {tone}Tint
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <StatusHeatmap columns={["W1", "W2", "W3"]} rows={HEATMAP_ROWS.slice(0, 2)} tokens={modeTokens} />
                  </div>
                  <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                    <Button variant="primary" size="sm" tokens={modeTokens}>
                      Primary
                    </Button>
                    <Button size="sm" tokens={modeTokens}>
                      Default
                    </Button>
                    <span style={{ ...monoStyle({ tokens: modeTokens }), fontSize: modeTokens.fontSize.sm }}>
                      color-scheme: {modeTokens.effect.colorScheme}
                    </span>
                  </div>
                </DechoSurface>
              );
            })}
          </div>
        ) : (
          <Callout tone="neutral" title={`${skin} has one mode`}>
            {MODE_NOTE[skin]} A light <code>command</code> or a dark{" "}
            <code>daylight</code> is a different design, not a mode, so{" "}
            <code>tokensFor(&quot;{skin}&quot;, &quot;
            {defaultModeFor(skin) === "dark" ? "light" : "dark"}&quot;)</code> throws
            rather than inventing one. <code>defineTheme()</code> is the way to add it.
          </Callout>
        )}

        <div style={{ marginTop: 14 }}>
          <Callout tone="info" title="What a mode deliberately does not change">
            The seven RAG states are identical in both — a heatmap has to
            screenshot the same either way — and so are the ten chart series, the
            radii, the spacing and the type. What moves is the surfaces, the
            text, the tones (lightened, not reused: #0f6e3d passes on white and
            fails on near-black), the six <code>*Tint</code> backgrounds — each
            derived from that mode&apos;s own surface, which is the 1.3.1 fix —
            the shadows, the chart axis and grid, and{" "}
            <code>color-scheme</code>, which is what puts the native scrollbars
            in the same mode.
          </Callout>
        </div>
      </Section>

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      <Section
        title="Charts"
        note="SVG, no charting dependency, coloured from the theme's ten-colour series. The heatmap uses the fixed RAG scale, which is a separate token group from the six tones — a status is not a tag."
      >
        <div style={grid}>
          <Panel title="Throughput" actions={<Tag tone="success">+18%</Tag>}>
            <Sparkline values={TREND} area width={240} height={48} />
            <div style={{ ...monoStyle({ tokens: t }), marginTop: 8 }}>
              12 weeks · {TREND[0]} → {TREND[TREND.length - 1]}
            </div>
          </Panel>

          <Panel title="Open actions by workstream">
            <BarChart data={WORKSTREAMS} />
          </Panel>

          <Panel title="Readiness">
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <DonutChart
                data={WORKSTREAMS.slice(0, 4)}
                centre={
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>115</div>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>ACTIONS</div>
                  </div>
                }
              />
              <ChartLegend
                items={WORKSTREAMS.slice(0, 4).map((d) => ({
                  label: d.label,
                  value: d.value,
                }))}
              />
            </div>
          </Panel>
        </div>

        <Panel title="Delivery status by domain" actions={<Tag tone="neutral">RAG</Tag>}>
          <StatusHeatmap columns={HEATMAP_COLUMNS} rows={HEATMAP_ROWS} />
        </Panel>
      </Section>

      {/* ── The whole frame, from the package ─────────────────────────────── */}
      <Section
        title="Application shell"
        note="AppShell · AppHeader · AppSidebar · AppSidebarNav · AppContent · AppBreadcrumb · AppFooter. A whole app frame with no layout CSS of its own — and it re-themes with the buttons above."
      >
        <div style={{ height: 380, borderRadius: 12, overflow: "hidden" }}>
          {/*
            `accent` is passed even though a nested surface now inherits it,
            because this section is the one that proves the shell re-themes —
            reading it should not require knowing that the inheritance exists.
          */}
          <AppShell tokens={t} theme={skin}>
            <AppHeader
              brand={<>◈&nbsp;Mission Control</>}
              actions={
                <>
                  <Tag tone="success" dot>
                    Live
                  </Tag>
                  <Button size="sm" onClick={() => setCollapsed((c) => !c)}>
                    {collapsed ? "Expand" : "Collapse"}
                  </Button>
                </>
              }
            />
            <AppBody>
              <AppSidebar
                collapsed={collapsed}
                footer={
                  !collapsed && (
                    <span style={{ fontSize: 11, color: "var(--decho-color-text-faint)" }}>
                      v0.2.0
                    </span>
                  )
                }
              >
                <AppSidebarNav
                  items={SHELL_NAV}
                  activeKey={navKey}
                  collapsed={collapsed}
                  onSelect={setNavKey}
                />
              </AppSidebar>

              <AppContent
                header={
                  <AppBreadcrumb
                    items={[
                      { label: "Plans", onClick: () => setNavKey("overview") },
                      { label: "Exercise 12", onClick: () => setNavKey("orchestration") },
                      { label: "Objectives" },
                    ]}
                  />
                }
              >
                <Card
                  title="AV-27 Recovery"
                  meta={`Selected: ${navKey}`}
                  tone="accent"
                  actions={<Tag tone="success">Complete</Tag>}
                >
                  The frame above is the package&apos;s: header, sidebar, nav,
                  breadcrumb, content and footer. The only layout this page
                  contributes is the 380px box it sits in.
                </Card>
              </AppContent>
            </AppBody>
            <AppFooter actions={<span>{SKIN_BLURBS[skin]}</span>}>
              <Tag tone="neutral">{skin}</Tag>
            </AppFooter>
          </AppShell>
        </div>
      </Section>

      {/* ── The reference layout the modern skin was drawn for ────────────── */}
      <Section
        title="Mission control"
        note="A navigation rail and a status card, built only from NavItem, Card, Tag and Button. The swatches above re-tint the theme: hovers, focus rings, the selection glow, the primary button gradient and modern's hairline all follow; surfaces, text and status colours do not."
      >
        <div style={{ ...grid, gridTemplateColumns: "minmax(280px, 340px) 1fr" }}>
          <Panel title="Command workspace" actions={<Tag tone="success" dot>Live</Tag>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: t.fontSize["2xl"], fontWeight: 600 }}>
                  Mission Control
                </div>
                <div style={{ color: t.color.textMuted, fontSize: t.fontSize.sm }}>
                  Unified operational navigation and recovery coordination.
                </div>
              </div>

              <div style={sectionLabelStyle({ tokens: t })}>System views</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <NavItem
                  label="System Overview"
                  description="Cross-enterprise picture"
                  icon="◍"
                  active={view === "System Overview"}
                  onClick={() => setView("System Overview")}
                />
                <NavItem
                  label="Orchestration"
                  description="Decisions and dependencies"
                  icon="⌸"
                  active={view === "Orchestration"}
                  trailing={<span style={{ color: t.color.textFaint }}>›</span>}
                  onClick={() => setView("Orchestration")}
                />
                <NavItem
                  label="System Architecture"
                  description="Underlying capabilities"
                  icon="◫"
                  active={view === "System Architecture"}
                  onClick={() => setView("System Architecture")}
                />
              </div>

              <Card
                title="AV-27 Recovery"
                meta="Mission command"
                tone="accent"
                actions={<Tag tone="success" dot>Complete</Tag>}
                footer={<Button variant="primary" size="sm">Review outcome ›</Button>}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <Tag tone="success" dot>Assets</Tag>
                  <Tag tone="warning" dot>Supply</Tag>
                  <Tag dot>People</Tag>
                  <Tag dot>Impact</Tag>
                </div>
                <div style={{ ...monoStyle({ tokens: t }), marginTop: 4 }}>
                  Recovery phase · handoff
                </div>
              </Card>

              <div style={{ ...sectionLabelStyle({ tokens: t }), marginTop: 4 }}>
                Mission domains
                <span style={{ ...dividerStyle({ tokens: t }), flex: "1 1 auto" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {DOMAINS.map((domain) => (
                  <NavItem
                    key={domain.label}
                    label={domain.label}
                    description={domain.description}
                    icon={domain.label.charAt(0)}
                    trailing={<Tag tone={domain.tone} dot />}
                  />
                ))}
              </div>
            </div>
          </Panel>

          <Panel
            title="Agent orchestration"
            actions={<Tag tone="accent">Autonomous</Tag>}
            scroll
          >
            <div style={{ ...grid, gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
              {AGENTS.map((agent) => (
                <Card
                  key={agent.code}
                  interactive
                  selected={agent.code === "SRC"}
                  title={agent.name}
                  meta={agent.code}
                  actions={<Tag tone={agent.tone}>{agent.code === "SRC" ? "3?" : "9+"}</Tag>}
                />
              ))}
            </div>

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {TRACE.map((line) => (
                <div key={line.time} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={monoStyle({ tokens: t })}>{line.time}</span>
                  <Tag tone={line.tone} dot />
                  <span style={{ fontSize: t.fontSize.md }}>{line.text}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </Section>

      <Section
        title="Tokens"
        note={`src/core/tokens.ts, and the same values as custom properties in src/css/tokens.css — showing the ${skin} skin`}
      >
        <div style={swatches}>
          {Object.entries(t.color).map(([name, value]) => (
            <div key={name} style={swatch}>
              <span style={{ ...swatchChip, background: value }} />
              <span style={{ minWidth: 0 }}>
                <div style={{ fontSize: t.fontSize.sm }}>{name}</div>
                <div style={monoStyle({ tokens: t })}>{value}</div>
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tags" note="Six tones, tinted and solid. No colour prop.">
        <div style={row}>
          {TONES.map((tone) => (
            <Tag key={tone} tone={tone} dot>
              {tone}
            </Tag>
          ))}
        </div>
        <div style={row}>
          {TONES.map((tone) => (
            <Tag key={tone} tone={tone} solid>
              {tone}
            </Tag>
          ))}
        </div>
        <div style={row}>
          {TONES.map((tone) => (
            <span key={tone} className={`decho-tag decho-tag--${tone}`}>
              <span className={`decho-dot decho-dot--${tone}`} />
              {tone} · css
            </span>
          ))}
        </div>
      </Section>

      <Section title="Buttons" note="Hover and focus are state, because inline styles have neither.">
        <div style={row}>
          <Button>Default</Button>
          <Button variant="primary">Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button active>Active</Button>
          <Button size="sm">Small</Button>
          <Button iconOnly aria-label="Zoom to selection">
            ⌖
          </Button>
        </div>
        <div style={row}>
          <button type="button" className="decho-button">
            Default · css
          </button>
          <button type="button" className="decho-button decho-button--primary">
            Primary · css
          </button>
          <button type="button" className="decho-button decho-button--ghost">
            Ghost · css
          </button>
          <button type="button" className="decho-button decho-button--danger">
            Danger · css
          </button>
        </div>
      </Section>

      <Section title="Cards" note="Status stripe, hover, selection. In modern the surface is lit and the top edge catches a gradient hairline.">
        <div style={grid}>
          {(["A", "B"] as const).map((id) => (
            <Card
              key={id}
              title={`1 PARA · ${id}`}
              meta="Bn · 612 pax · last seen 12 min ago"
              tone={id === "A" ? "warning" : "success"}
              interactive
              selected={selected === id}
              actions={
                <Tag tone={id === "A" ? "warning" : "success"}>
                  {id === "A" ? "Degraded" : "Ready"}
                </Tag>
              }
              footer={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setSelected(id)}
                >
                  {selected === id ? "Selected" : "Select"}
                </Button>
              }
            >
              Two platoons detached to the crossing; sustainment unaffected.
            </Card>
          ))}

          <article className="decho-card decho-card--info">
            <div className="decho-card__header">
              <div style={{ minWidth: 0 }}>
                <div className="decho-card__title">CSS card</div>
                <div className="decho-card__meta">
                  Same markup shape, class-based
                </div>
              </div>
              <span className="decho-tag decho-tag--info">Info</span>
            </div>
            <div className="decho-card__body">
              Rendered from <code className="decho-mono">styles.css</code>. If
              this looks different from the two beside it — in either skin — the
              two deliveries have drifted.
            </div>
            <div className="decho-card__footer">
              <span className="decho-muted">No JavaScript involved</span>
            </div>
          </article>
        </div>
      </Section>

      {/*
        The workflow components: the table, the two overlays, the tab strip and
        the filters. Interactive on purpose — this is the only place the
        keyboard behaviour can be checked, and the keyboard behaviour is most of
        what these add over the estate's originals. Try it: Tab to the tab
        strip and use the arrows, Tab to a facet and press Space, sort a column
        from the keyboard, open the dialog and press Escape.
      */}
      <Section
        title="Tables, overlays and filters"
        note="DataTable, Dialog, Drawer, Tabs, Toolbar and FacetGroup — the workflow layer, all controlled, none of it fetching anything."
      >
        <Tabs
          items={[
            { key: "objects", label: "Objects", badge: WORK_ROWS.length },
            { key: "runs", label: "Runs", badge: 0 },
            { key: "history", label: "History", disabled: true },
          ]}
          activeKey={tab}
          onSelect={setTab}
          idPrefix="styling-demo"
          style={{ marginBottom: 12 }}
        />

        {tab === "objects" ? (
          <>
            <Toolbar label="Table actions">
              <FacetGroup
                label="Severity"
                facets={[
                  { value: "high", label: "High", count: 1 },
                  { value: "medium", label: "Medium", count: 2 },
                ]}
                selected={facets}
                onChange={setFacets}
              />
              <ToolbarSpacer />
              <ToolbarStatus>
                {`${selectedRows.length} of ${WORK_ROWS.length} selected`}
              </ToolbarStatus>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setDialogOpen(true)}
              >
                Link object
              </Button>
            </Toolbar>

            <DataTable
              caption="Objects in scope"
              columns={WORK_COLUMNS}
              rows={WORK_ROWS}
              getRowId={(row) => row.id}
              getRowLabel={(row) => row.name}
              selectedIds={selectedRows}
              onSelectionChange={setSelectedRows}
              onRowClick={(row) => setDrawerRow(row.id)}
              activeRowId={drawerRow ?? undefined}
              maxHeight={220}
            />
          </>
        ) : (
          <DataTable
            caption="Runs"
            columns={WORK_COLUMNS}
            rows={[]}
            getRowId={(row) => row.id}
            empty="No runs in this window"
          />
        )}

        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Link a RICEFW object"
          description="Escape closes this, and focus returns to the button that opened it."
          footer={
            <>
              <Button size="sm" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setDialogOpen(false)}
              >
                Link
              </Button>
            </>
          }
        >
          A dialog rendered in place rather than through a portal, so it stays
          inside the subtree whose custom properties are the theme — switch the
          theme above with this open and it follows.
        </Dialog>

        <Drawer
          open={drawerRow != null}
          onClose={() => setDrawerRow(null)}
          title={WORK_ROWS.find((r) => r.id === drawerRow)?.name ?? ""}
          meta="Non-modal: the table behind stays usable, which is what clicking through a list needs"
          actions={<Tag tone="accent">Detail</Tag>}
          footer={
            <Button size="sm" onClick={() => setDrawerRow(null)}>
              Close
            </Button>
          }
        >
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            Click another row with this open: the drawer follows the selection
            rather than making you dismiss it first.
          </p>
        </Drawer>
      </Section>

      <Section title="Panels" note="Header pinned, body scrolls. The overlay variant is the one that floats over a map.">
        <div style={grid}>
          <Panel
            title="Order of battle"
            actions={<Tag tone="neutral">24</Tag>}
            scroll
            style={{ height: 200 }}
          >
            <ul style={list}>
              {Array.from({ length: 24 }, (_, i) => (
                <li key={i} style={listItem}>
                  <span style={monoStyle({ tokens: t })}>{`UNIT-${100 + i}`}</span>
                  <Tag tone={i % 5 === 0 ? "danger" : "neutral"}>
                    {i % 5 === 0 ? "No comms" : "Nominal"}
                  </Tag>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Overlay" overlay style={{ height: 200 }}>
            <p style={{ margin: 0 }}>
              Translucent and blurred — the surface{" "}
              <code style={monoStyle({ tokens: t })}>@acc/decho-basemap</code>&apos;s
              toolbar uses, so a panel and a toolbar on the same map read as one
              product.
            </p>
          </Panel>

          <Panel title="Fields" style={{ height: 200 }}>
            <label htmlFor="callsign" style={labelStyle({ tokens: t })}>
              Callsign
            </label>
            <input
              id="callsign"
              style={inputStyle({ tokens: t })}
              defaultValue="ZERO ALPHA"
            />
            <hr style={{ ...dividerStyle({ tokens: t }), margin: "12px 0" }} />
            <label htmlFor="grid" style={labelStyle({ tokens: t })}>
              Grid
            </label>
            <input id="grid" className="decho-input" defaultValue="30U XC 1234" />
          </Panel>
        </div>
      </Section>

      <Section
        title="Overriding the accent"
        note="Scoped to this subtree — never to :root, because a widget shares its page. The skin decides the surfaces; the override decides the accent."
      >
        <div
          className="decho-root"
          style={{ ...themeVariables({ accent: AMBER }), ...grid }}
        >
          <Card
            tokens={t}
            palette={withTheme({ accent: AMBER }, skin)}
            title="Amber deployment"
            meta="Recipes are told the palette; they cannot inherit a literal."
            footer={
              <Button
                variant="primary"
                size="sm"
                palette={withTheme({ accent: AMBER }, skin)}
              >
                Primary
              </Button>
            }
          >
            <span style={monoStyle({ tokens: t })}>
              withTheme({"{ accent: '#b8862f' }"}, &quot;{skin}&quot;)
            </span>
          </Card>

          <article className="decho-card">
            <div className="decho-card__title">CSS inherits it for free</div>
            <div className="decho-card__body">
              <span className="decho-tag decho-tag--accent">Accent</span>{" "}
              <button type="button" className="decho-button decho-button--primary">
                Primary
              </button>
            </div>
            <div className="decho-card__meta">
              One custom property on the wrapper; every class below it follows.
            </div>
          </article>
        </div>
      </Section>
    </DechoSurface>
  );
}

/**
 * The system's colour preference, as a hook.
 *
 * `prefersDarkMode()` for the first paint and `onColorSchemeChange` for the
 * rest — the package's own subscription rather than a second `matchMedia`, so
 * this page answers the question exactly the way `applyTheme(…, { mode: "auto" })`
 * does inside a widget.
 */
function useSystemDark(): boolean {
  const [dark, setDark] = useState(prefersDarkMode);
  useEffect(() => onColorSchemeChange(setDark), []);
  return dark;
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section style={section}>
      <h2 style={sectionTitle}>{title}</h2>
      <p style={sectionNote}>{note}</p>
      {children}
    </section>
  );
}

const page: React.CSSProperties = {
  height: "100%",
  overflow: "auto",
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 28,
};

const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const section: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: DECHO_TOKENS.fontSize["2xl"],
  fontWeight: 600,
};

const sectionNote: React.CSSProperties = {
  margin: 0,
  // Deliberately a variable rather than a token literal: this page switches
  // skin at runtime, and the CSS layer is the half that follows automatically.
  color: "var(--decho-color-text-muted)",
  fontSize: DECHO_TOKENS.fontSize.sm,
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
};

const grid: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
};

const swatches: React.CSSProperties = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
};

const swatch: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const swatchChip: React.CSSProperties = {
  flex: "0 0 auto",
  width: 22,
  height: 22,
  borderRadius: "var(--decho-radius-sm)",
  border: "1px solid var(--decho-color-border-subtle)",
};

const list: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const listItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

export default StylingPage;
