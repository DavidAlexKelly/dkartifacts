/**
 * `decho doctor` — why isn't it working?
 *
 * WHY THIS EXISTS
 * ---------------
 * Three adoptions produced three distribution failures, and not one of them
 * said what was actually wrong:
 *
 *   404 from npm            the project has not imported the Artifacts
 *                           repository. Says nothing about project imports.
 *   403 from npm            imported, but the repository cannot read it. Looks
 *                           identical to a typo in the package name.
 *   PostCSS "Missing        npm resolved a stale packument and installed an
 *   ./compat specifier"     older version whose exports map lacks the entry.
 *                           Reads like a bug in the package.
 *
 * Each cost a round trip to diagnose. This checks the four things that are
 * actually ever wrong and prints the command that fixes them.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PASS = "  ok   ";
const FAIL = "  FAIL ";
const WARN = "  warn ";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Does an installed version satisfy a `^x.y.z` range? 0.x pins the minor. */
export function satisfiesCaret(range, version) {
  const clean = range.replace(/^[\^~]/, "");
  const [rMajor, rMinor, rPatch] = clean.split(".").map(Number);
  const [vMajor, vMinor, vPatch] = version.split(".").map(Number);
  if ([rMajor, rMinor, rPatch, vMajor, vMinor, vPatch].some(Number.isNaN)) return null;
  if (!range.startsWith("^")) return clean === version;
  if (vMajor !== rMajor) return false;
  // On 0.x a caret pins the minor — the trap that keeps a consumer a version
  // behind while its package.json claims otherwise.
  if (rMajor === 0) return vMinor === rMinor && vPatch >= rPatch;
  return vMinor > rMinor || (vMinor === rMinor && vPatch >= rPatch);
}

/** Shallow scan for a theme class or attribute, so we can say "none found". */
function findsThemeSelector(dir, depth = 0) {
  if (depth > 3) return false;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (["node_modules", "dist", ".git", "build", "coverage"].includes(entry)) continue;
    const path = join(dir, entry);
    let info;
    try {
      info = statSync(path);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      if (findsThemeSelector(path, depth + 1)) return true;
    } else if (/\.(html|tsx|jsx|ts|js)$/.test(entry)) {
      try {
        const text = readFileSync(path, "utf8");
        if (text.includes("decho-root") || text.includes("data-decho-theme")) return true;
        if (text.includes("<DechoSurface") || text.includes("<AppShell")) return true;
      } catch {
        // unreadable file: not evidence either way
      }
    }
  }
  return false;
}

export async function doctor(_args, pkg) {
  const cwd = process.cwd();
  const lines = [];
  let failed = false;

  const manifest = readJson(join(cwd, "package.json"));
  if (manifest == null) {
    console.error("decho doctor: no package.json here. Run it in a repository root.");
    process.exitCode = 1;
    return;
  }

  // 1. Declared ----------------------------------------------------------
  const declared =
    manifest.dependencies?.["@acc/decho-styling"] ??
    manifest.devDependencies?.["@acc/decho-styling"];
  if (declared == null) {
    failed = true;
    lines.push(`${FAIL} @acc/decho-styling is not in package.json`);
    lines.push(`       → npm install @acc/decho-styling`);
  } else {
    lines.push(`${PASS} declared: ${declared}`);
  }

  // 2. Installed, and matching ------------------------------------------
  const installedPath = join(cwd, "node_modules", "@acc", "decho-styling", "package.json");
  const installed = readJson(installedPath);
  if (installed == null) {
    failed = true;
    lines.push(`${FAIL} not installed in node_modules`);
    lines.push(`       → npm install`);
  } else if (declared != null) {
    const ok = satisfiesCaret(declared, installed.version);
    if (ok === false) {
      failed = true;
      lines.push(`${FAIL} installed ${installed.version}, but package.json wants ${declared}`);
      lines.push(`       This is usually npm serving a cached packument from before the`);
      lines.push(`       version was published. It surfaces as a PostCSS "missing`);
      lines.push(`       specifier" error, which looks like a bug in the package.`);
      lines.push(`       → npm cache clean --force && npm install --prefer-online`);
    } else {
      lines.push(`${PASS} installed: ${installed.version}`);
    }
  }

  // 3. The entry points the installed copy actually has -------------------
  if (installed != null) {
    const expected = ["./styles.css", "./react", "./compat/military.css", "./blueprint.css"];
    const missing = expected.filter((entry) => installed.exports?.[entry] == null);
    if (missing.length > 0) {
      failed = true;
      lines.push(`${FAIL} installed copy has no ${missing.join(", ")}`);
      lines.push(`       → an older version is on disk; see the fix above`);
    } else {
      lines.push(`${PASS} entry points present (styles.css, react, compat, blueprint)`);
    }
  }

  // 4. Can the registry even see it? -------------------------------------
  const npmrc = ["\.npmrc", ".npmrc"]
    .map((name) => join(cwd, name))
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  if (npmrc.includes("@acc:registry") || npmrc.includes("artifacts/api/repositories")) {
    lines.push(`${PASS} .npmrc points at an Artifacts registry`);
  } else {
    lines.push(`${WARN} no @acc registry found in .npmrc`);
    lines.push(`       A Foundry code repository usually has one already. If install`);
    lines.push(`       returns 404, the project has not imported the Artifacts`);
    lines.push(`       repository; if it returns 403, it has, but cannot read it —`);
    lines.push(`       add it under Code repository → Settings → Libraries.`);
  }

  // 5. Is a theme actually selected? -------------------------------------
  if (findsThemeSelector(join(cwd, "src")) || findsThemeSelector(cwd, 3)) {
    lines.push(`${PASS} a theme is selected somewhere (decho-root / DechoSurface)`);
  } else {
    lines.push(`${WARN} no decho-root, data-decho-theme, DechoSurface or AppShell found`);
    lines.push(`       Without one the tokens are never declared, so every component`);
    lines.push(`       falls back to classic and the CSS classes style nothing.`);
    lines.push(`       → <html class="decho-root decho-modern">`);
  }

  console.log(`\ndecho doctor — @acc/decho-styling ${pkg.version ?? ""}\n`);
  console.log(lines.join("\n"));
  console.log(
    failed
      ? "\nOne or more checks failed; the fixes are above.\n"
      : "\nNothing obviously wrong.\n",
  );
  if (failed) process.exitCode = 1;
}
