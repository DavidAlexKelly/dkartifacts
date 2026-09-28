/**
 * The shell every example app renders inside: a header with a switcher, and a
 * content area that fills the rest of the viewport.
 *
 * The content area matters more than it looks. Two of the three examples mount
 * a MapLibre map, and MapLibre measures its container ONCE, at construction —
 * so the area below the header has to have a definite height from the first
 * frame. `height: 100vh` on the shell, `flex: 1` plus `minHeight: 0` here, and
 * `position: relative` so an absolutely-positioned map fills it.
 *
 * `minHeight: 0` is not decoration: a flex child's default `min-height: auto`
 * refuses to shrink below its content, so without it a tall page pushes the
 * header off-screen instead of scrolling inside its own pane.
 */

import React, { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { EXAMPLE_APPS, appForPath } from "@/PackageApps/apps";
import { useArtifactSwitching } from "@/workshopConfig";

function AppShell(): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const current = appForPath(location.pathname);
  const artifactSwitching = useArtifactSwitching();

  // The template centres #root in a flex row with a max-width and padding,
  // which is right for a document and wrong for an application shell. Opt the
  // whole shell into full-bleed for as long as it is mounted, rather than
  // making each page remember to do it.
  useEffect(() => {
    document.body.classList.add("app-shell-route");
    return () => document.body.classList.remove("app-shell-route");
  }, []);

  return (
    <div style={shell}>
      <header style={header}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong style={{ fontSize: 14 }}>Artifact examples</strong>
            <span style={{ color: "#5a6178", fontSize: 11 }}>
              one app per package in <code>packages/</code>
            </span>
          </div>
          {current && (
            <div style={blurbStyle} title={current.blurb}>
              <code style={{ color: "#8fb8ff" }}>{current.packageName}</code> ·{" "}
              {current.blurb}
            </div>
          )}
        </div>

        {/* On by default, standalone and embedded alike — it is the only
            navigation the harness has. A Workshop module that is showing one
            example as part of a workflow can switch it off with the
            "artifact-switching" variable. See src/workshopConfig.ts. */}
        {artifactSwitching && (
          <label style={switcher}>
            <span style={{ color: "#8b93a7", fontSize: 11 }}>Example</span>
            <select
              value={current?.path ?? ""}
              onChange={(e) => navigate(e.target.value)}
              style={select}
            >
              {/* Only present when the current route is not an example — an
                  auth callback, say — so the control never shows a blank value
                  for a route the list does know about. */}
              {!current && <option value="">(not an example)</option>}
              {EXAMPLE_APPS.map((app) => (
                <option key={app.path} value={app.path}>
                  {app.label} — {app.packageName}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      <main style={content}>
        <Outlet />
      </main>
    </div>
  );
}

const shell: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  width: "100%",
  background: "#0a0c0f",
  color: "#e8ecf4",
};

const header: React.CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: "8px 14px",
  background: "#111318",
  borderBottom: "1px solid #23293a",
  font: "12px/1.4 system-ui, sans-serif",
};

const blurbStyle: React.CSSProperties = {
  marginTop: 2,
  color: "#8b93a7",
  fontSize: 11,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "60vw",
};

const switcher: React.CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const select: React.CSSProperties = {
  background: "#0a0c0f",
  color: "#e8ecf4",
  border: "1px solid #374057",
  borderRadius: 4,
  padding: "5px 8px",
  font: "12px/1.4 system-ui, sans-serif",
  cursor: "pointer",
};

const content: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  position: "relative",
  overflow: "hidden",
};

export default AppShell;
