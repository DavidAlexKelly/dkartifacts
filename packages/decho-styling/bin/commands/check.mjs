/**
 * `decho check` — find the theming mistakes that nothing else catches.
 *
 *     npx decho check                 # scans ./src
 *     npx decho check --dir app/src
 *     npx decho check --theme accenture-sap
 *
 * WHY A COMMAND AND NOT A LINT RULE
 * ---------------------------------
 * Two of the four checks are not about code shape, they are about the *repo*:
 * whether a widget entry point applies a theme at all, and whether the token
 * paths a file uses exist in the theme it claims to use. ESLint has no opinion
 * on either, and both were the difference between "this widget looks right" and
 * "this widget is black" in five widget sets.
 *
 * WHAT IT CHECKS
 * --------------
 *   1. Token paths resolve.  `theme.color.surfce` is `undefined`, React drops
 *      the declaration, and the element renders unpainted.
 *   2. No one-letter token alias. `import { t }` is shadowed by every
 *      `items.map((t) => …)` in the file, silently.
 *   3. No translucent wash used as a background — the opaque `*Tint` tokens
 *      exist for that.
 *   4. In a widget-set repo, every entry point calls `applyTheme`. Without it
 *      the CSS classes resolve against the base theme, which is dark, because
 *      the host provides the document and the class in your HTML never ships.
 *
 * Exit code 1 if anything is wrong, so it can sit in front of a build.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The package's own API, resolved at call time rather than imported at the top.
 *
 * `dist/` exists for a consumer (it is what they install) and does not exist in
 * this repo's CI, which runs the tests before anything is built. The other
 * commands take their API by injection for the same reason; the tests pass the
 * TypeScript source straight in.
 */
async function resolveApi(injected) {
  if (injected != null) return injected;
  return import("../../dist/index.js");
}

const TOKEN_PATH = /\b(?:theme|tokens|t)\.([A-Za-z]+)(?:\.([A-Za-z0-9]+)|\[(\d+)\])/g;
const ALIAS = /\bt\.(color|status|chart|space|radius|fontSize|fontFamily|gradient|shadow|effect)\b/;
const WASH = /background(?:Color)?\s*:\s*[^,;\n]*\.(?:accent|info|success|warning|danger|neutral)Soft\b/g;

/** Comments are prose; a file explaining this bug will quote it. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

function sourceFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(tsx?|jsx?)$/.test(path) && !/\.test\./.test(path)) out.push(path);
  }
  return out;
}

/** A widget-set repo, per the CLI's own config file. */
function widgetEntryPoints(cwd) {
  const config = join(cwd, "foundry.config.json");
  if (!existsSync(config)) return [];
  try {
    const parsed = JSON.parse(readFileSync(config, "utf8"));
    if (parsed.widgetSet == null) return [];
  } catch {
    return [];
  }
  // Entry points are the files that mount React — that is where a theme has to
  // be applied, because it has to happen before the first render.
  return sourceFiles(join(cwd, "src")).filter((path) =>
    /createRoot\s*\(|ReactDOM\.render\s*\(/.test(readFileSync(path, "utf8")),
  );
}

export async function check({
  dir = "src",
  theme = "accenture-sap",
  cwd = process.cwd(),
  api,
} = {}) {
  const { DECHO_THEMES, isTheme, tokensFor, isTranslucent } = await resolveApi(api);

  if (!isTheme(theme)) {
    return {
      ok: false,
      problems: [
        `--theme ${JSON.stringify(theme)} is not a theme. Available: ${DECHO_THEMES.join(", ")}.`,
      ],
    };
  }

  const tokens = tokensFor(theme);
  const problems = [];
  const files = sourceFiles(join(cwd, dir));

  for (const path of files) {
    const source = stripComments(readFileSync(path, "utf8"));

    for (const match of source.matchAll(TOKEN_PATH)) {
      const [whole, group, key, index] = match;
      const groupValue = tokens[group];
      if (groupValue == null) continue; // not our object — `props.color.x` etc.
      if (groupValue[key ?? index] == null) {
        problems.push(`${path}:${lineOf(source, match.index)}  ${whole} is not a token in \`${group}\``);
      }
    }

    const alias = ALIAS.exec(source);
    if (alias != null) {
      problems.push(
        `${path}:${lineOf(source, alias.index)}  tokens read through \`t\`, which every \`.map((t) => …)\` shadows — rename the import to \`theme\``,
      );
    }

    for (const match of source.matchAll(WASH)) {
      problems.push(
        `${path}:${lineOf(source, match.index)}  ${match[0].trim()} — a translucent wash as a background; use the matching \`*Tint\` token (or tintsFor(${JSON.stringify(theme)}) for a value)`,
      );
    }
  }

  for (const entry of widgetEntryPoints(cwd)) {
    const source = readFileSync(entry, "utf8");
    if (!/applyTheme\s*\(/.test(source)) {
      problems.push(
        `${entry}  mounts React without calling applyTheme(). In a widget the host provides the document, so a theme class in your HTML never reaches the browser and every variable falls back to the base theme — which is dark.`,
      );
    }
  }

  // A sanity check on the theme itself, cheap and occasionally revealing.
  for (const [name, value] of Object.entries(tokens.color)) {
    if (/^(bg|surface|surfaceRaised)$/.test(name) && isTranslucent(value)) {
      problems.push(
        `theme ${theme}: color.${name} is translucent (${value}), so anything painted with it shows the host through. That is deliberate in the glass themes; make sure it is deliberate here.`,
      );
    }
  }

  return { ok: problems.length === 0, problems, filesChecked: files.length };
}

export async function runCheck(argv) {
  const dir = argv.dir ?? "src";
  const theme = argv.theme ?? "accenture-sap";
  const result = await check({ dir, theme });

  if (!result.ok) {
    console.error(`\ndecho check: ${result.problems.length} problem(s)\n`);
    for (const problem of result.problems) console.error(`  ${problem}`);
    console.error("");
    process.exitCode = 1;
    return result;
  }

  console.log(`decho check: ${result.filesChecked} files, no problems (${theme})`);
  return result;
}
