/**
 * `decho check`, against fixtures of the four mistakes it exists to catch.
 *
 * Each one of these shipped to production in at least one widget set, and each
 * one was invisible to tsc, eslint and the build.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { check as checkWith } from "./check.mjs";
// The source, not dist: CI runs the tests before anything is built, and the
// command takes its API by injection precisely so this works.
import * as api from "../../src/index.js";

const check = (options) => checkWith({ ...options, api });

let root;

function repo(files, { widgetSet = false } = {}) {
  root = mkdtempSync(join(tmpdir(), "decho-check-"));
  mkdirSync(join(root, "src"), { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    const path = join(root, "src", name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, contents);
  }
  if (widgetSet) {
    writeFileSync(
      join(root, "foundry.config.json"),
      JSON.stringify({ widgetSet: { rid: "ri.widgetregistry..widget-set.x" } }),
    );
  }
  return root;
}

afterEach(() => {
  if (root != null) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe("decho check", async () => {
  it("passes a repo that does it right", async () => {
    const cwd = repo({
      "theme.ts": `export const theme = tokensFor("accenture-sap");`,
      "Card.tsx": `const s = { background: theme.color.surface, color: theme.color.text };`,
    });
    expect(await check({ cwd })).toMatchObject({ ok: true });
  });

  it("catches a token path that does not exist", async () => {
    const cwd = repo({ "Card.tsx": `const s = { color: theme.color.textFiant };` });
    const { ok, problems } = await check({ cwd });
    expect(ok).toBe(false);
    expect(problems[0]).toContain("theme.color.textFiant is not a token");
  });

  it("catches tokens imported as `t`, which map callbacks shadow", async () => {
    const cwd = repo({
      "List.tsx": `import { t } from "./theme.js";
export const rows = items.map((t) => ({ background: t.color.surface }));`,
    });
    const { ok, problems } = await check({ cwd });
    expect(ok).toBe(false);
    expect(problems[0]).toContain("shadows");
  });

  it("catches a translucent wash used as a background", async () => {
    const cwd = repo({
      "Row.tsx": `const s = { background: selected ? theme.color.accentSoft : theme.color.surface };`,
    });
    const { ok, problems } = await check({ cwd });
    expect(ok).toBe(false);
    expect(problems[0]).toContain("translucent wash as a background");
  });

  it("catches a widget entry that mounts React without applying a theme", async () => {
    const cwd = repo(
      {
        "main.tsx": `import ReactDOM from "react-dom/client";
ReactDOM.createRoot(document.getElementById("root")).render(<App />);`,
      },
      { widgetSet: true },
    );
    const { ok, problems } = await check({ cwd });
    expect(ok).toBe(false);
    expect(problems[0]).toContain("without calling applyTheme()");
  });

  it("accepts an entry that does apply one", async () => {
    const cwd = repo(
      {
        "main.tsx": `import { applyTheme } from "@acc/decho-styling";
import ReactDOM from "react-dom/client";
applyTheme("accenture-sap");
ReactDOM.createRoot(document.getElementById("root")).render(<App />);`,
      },
      { widgetSet: true },
    );
    expect(await check({ cwd })).toMatchObject({ ok: true });
  });

  it("does not ask for applyTheme in a repo that is not a widget set", async () => {
    const cwd = repo({
      "main.tsx": `ReactDOM.createRoot(document.getElementById("root")).render(<App />);`,
    });
    expect(await check({ cwd })).toMatchObject({ ok: true });
  });

  it("ignores the patterns when they appear in comments", async () => {
    const cwd = repo({
      "notes.ts": `/* We used to write background: theme.color.accentSoft here, and t.color.surface. */
export const fine = theme.color.surface;`,
    });
    expect(await check({ cwd })).toMatchObject({ ok: true });
  });

  it("rejects an unknown theme by name", async () => {
    const cwd = repo({ "a.ts": "export const x = 1;" });
    const { ok, problems } = await check({ cwd, theme: "accenture-SAP" });
    expect(ok).toBe(false);
    expect(problems[0]).toContain("is not a theme");
  });
});
