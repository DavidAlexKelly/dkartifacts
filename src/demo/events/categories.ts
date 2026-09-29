/**
 * The categories events are sorted into: the built-in nine plus "other", and
 * any a Workshop module adds through the `event-monitor-categories` variable.
 *
 * A custom category is written as one string:
 *
 *   Border incidents                            label only; a colour is picked
 *   Border incidents|#ff8800                    label and colour
 *   Border incidents|#ff8800|crossing, incursion*   … and keywords
 *
 * Keywords sort records into the category automatically, the same way the
 * built-ins' do: a keyword is a word or phrase matched against whole words of
 * a record's category, title and summary, case-insensitively, with a trailing
 * `*` for "starting with" (`incursion*` matches "incursions"). Anything can
 * also be put into a category by hand — see categoryOverrides.ts.
 *
 * Matching is word lists, not regular expressions: keywords arrive as text
 * from a Workshop variable, and data is matched against them.
 */

export type BuiltinCategory =
  | "conflict"
  | "military"
  | "protest"
  | "earthquake"
  | "wildfire"
  | "weather"
  | "outbreak"
  | "cyber"
  | "infrastructure"
  | "other";

export interface CategoryDef {
  id: string;
  label: string;
  colour: string;
  /** Words and phrases that put a record in this category. */
  keywords: string[];
  custom: boolean;
}

export interface CategoryRegistry {
  /** Display order: built-ins, then custom ones, then "other". */
  order: string[];
  byId: Record<string, CategoryDef>;
}

const BUILTINS: Array<Omit<CategoryDef, "custom">> = [
  {
    id: "conflict",
    label: "Armed conflict",
    colour: "#e5484d",
    keywords: ["battle*", "clash*", "attack*", "armed", "violence", "explosion*", "shelling", "airstrike*", "air strike*", "drone strike*", "bombing*", "conflict*", "war", "fighting", "ambush*", "terror*", "shooting*", "killing*", "abduction*"],
  },
  {
    id: "military",
    label: "Military activity",
    colour: "#b38cf2",
    keywords: ["military", "naval", "navy", "army", "exercise*", "troop*", "deployment*", "patrol*", "warship*", "carrier*", "missile test*", "strategic development*", "air defence", "air defense", "isr"],
  },
  {
    id: "protest",
    label: "Protests & unrest",
    colour: "#f59e3d",
    keywords: ["protest*", "riot*", "demonstration*", "strike", "strikes", "unrest", "rally", "rallies", "march", "marches", "civil disorder"],
  },
  {
    id: "earthquake",
    label: "Earthquakes",
    colour: "#c9a26b",
    keywords: ["earthquake*", "quake*", "seismic", "tremor*", "tsunami*"],
  },
  {
    id: "wildfire",
    label: "Wildfires",
    colour: "#ff6b3d",
    keywords: ["wildfire*", "wild fire*", "bushfire*", "bush fire*", "forest fire*", "fire", "fires", "blaze*", "burning", "burned", "burnt", "thermal anomal*"],
  },
  {
    id: "weather",
    label: "Severe weather",
    colour: "#4fa3f7",
    keywords: ["flood*", "storm*", "cyclone*", "hurricane*", "typhoon*", "tornado*", "landslide*", "avalanche*", "drought*", "heatwave*", "heat wave*", "weather", "volcan*", "blizzard*"],
  },
  {
    id: "outbreak",
    label: "Disease outbreaks",
    colour: "#5fd08a",
    keywords: ["outbreak*", "disease*", "epidemic*", "pandemic*", "cholera", "ebola", "measles", "mpox", "dengue", "virus*", "covid*", "health emergenc*"],
  },
  {
    id: "cyber",
    label: "Cyber incidents",
    colour: "#38d6d6",
    keywords: ["cyber*", "ransomware", "ddos", "malware", "phishing", "data breach*", "breach*", "hack", "hacked", "hacking", "hacks"],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    colour: "#e6d84a",
    keywords: ["outage*", "power cut*", "blackout*", "cable*", "pipeline*", "port", "ports", "rail*", "bridge*", "infrastructure", "grid", "telecom*", "disruption*"],
  },
];

const OTHER: CategoryDef = {
  id: "other",
  label: "Other",
  colour: "#9aa5b1",
  keywords: [],
  custom: false,
};

/**
 * The order keywords are tried in when sorting a record. Not display order:
 * "airstrike" and "drone strike" must reach conflict before a bare "strike"
 * reaches protest, and hazards are more specific than infrastructure.
 */
const BUILTIN_MATCH_ORDER = ["earthquake", "wildfire", "weather", "outbreak", "cyber", "conflict", "protest", "infrastructure", "military"];

/** Colours for custom categories that do not name one, clear of the built-ins. */
const CUSTOM_PALETTE = ["#ff8fb1", "#8fd3ff", "#c3e88d", "#ffcb6b", "#f78c6c", "#82aaff", "#c792ea", "#89ddff", "#addb67", "#ff5370"];

export function buildRegistry(custom: CategoryDef[] = []): CategoryRegistry {
  const byId: Record<string, CategoryDef> = {};
  for (const def of BUILTINS) {byId[def.id] = { ...def, custom: false };}
  const customIds: string[] = [];
  for (const def of custom) {
    if (byId[def.id] || def.id === OTHER.id) {continue;}
    byId[def.id] = def;
    customIds.push(def.id);
  }
  byId[OTHER.id] = OTHER;
  return { order: [...BUILTINS.map((d) => d.id), ...customIds, OTHER.id], byId };
}

export const BUILTIN_REGISTRY = buildRegistry();

/** A category's definition, or a neutral stand-in for an id nobody defines. */
export function categoryMeta(registry: CategoryRegistry, id: string): CategoryDef {
  return registry.byId[id] ?? { id, label: id, colour: OTHER.colour, keywords: [], custom: true };
}

// ── Custom categories from text ─────────────────────────────────────────────

/** "Border incidents" → "custom:border-incidents": stable across colour edits. */
export function customCategoryId(label: string): string {
  let slug = "";
  let dash = false;
  for (const ch of label.toLowerCase()) {
    const word = (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9");
    if (word) {
      slug += ch;
      dash = false;
    } else if (!dash && slug !== "") {
      slug += "-";
      dash = true;
    }
  }
  if (slug.endsWith("-")) {slug = slug.slice(0, -1);}
  return `custom:${slug}`;
}

function isHexColour(text: string): boolean {
  if (!text.startsWith("#") || (text.length !== 4 && text.length !== 7)) {return false;}
  for (const ch of text.slice(1).toLowerCase()) {
    if (!((ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f"))) {return false;}
  }
  return true;
}

export type ParsedCategory = { ok: true; def: CategoryDef } | { ok: false; error: string };

/** One entry of the Workshop variable. `index` picks a default colour. */
export function parseCustomCategory(entry: string, index = 0): ParsedCategory {
  const [rawLabel = "", rawColour = "", rawKeywords = ""] = entry.split("|");
  const label = rawLabel.trim();
  if (label === "") {return { ok: false, error: "Needs a label before any |." };}
  const id = customCategoryId(label);
  if (id === "custom:") {return { ok: false, error: "The label needs at least one letter or digit." };}
  const colour = rawColour.trim();
  if (colour !== "" && !isHexColour(colour)) {
    return { ok: false, error: `"${colour}" is not a colour — use #rgb or #rrggbb.` };
  }
  const keywords = rawKeywords
    .split(",")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
  return {
    ok: true,
    def: {
      id,
      label,
      colour: colour || CUSTOM_PALETTE[index % CUSTOM_PALETTE.length],
      // Its own label always sorts a record into it, like the built-ins'.
      keywords: [label.toLowerCase(), ...keywords],
      custom: true,
    },
  };
}

// ── Matching ────────────────────────────────────────────────────────────────

/** Lower-case words of letters and digits: "Explosions/Remote violence" → [explosions, remote, violence]. */
export function words(text: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const ch of text.toLowerCase()) {
    const letter = (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch > "\u007f";
    if (letter) {current += ch;}
    else if (current) {
      out.push(current);
      current = "";
    }
  }
  if (current) {out.push(current);}
  return out;
}

/** Whether `keyword` (a word or phrase, `*` = prefix on its last word) occurs in `haystack`. */
export function matchesKeyword(haystack: string[], keyword: string): boolean {
  const prefix = keyword.endsWith("*");
  const needle = words(prefix ? keyword.slice(0, -1) : keyword);
  if (needle.length === 0 || needle.length > haystack.length) {return false;}
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      const word = haystack[start + j];
      const last = j === needle.length - 1;
      if (last && prefix ? !word.startsWith(needle[j]) : word !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {return true;}
  }
  return false;
}

/**
 * The category a text names: an exact id or label first, then keywords —
 * custom categories' before the built-ins', since a module that defines
 * "Frontline" with keyword "battle*" means it to win over "Armed conflict".
 */
export function matchCategory(registry: CategoryRegistry, text: unknown): string | null {
  if (text == null || text === "") {return null;}
  const raw = String(text).trim();
  const lower = raw.toLowerCase();
  for (const id of registry.order) {
    const def = registry.byId[id];
    if (lower === id || lower === def.label.toLowerCase()) {return id;}
  }
  const haystack = words(raw);
  if (haystack.length === 0) {return null;}
  const customs = registry.order.filter((id) => registry.byId[id].custom);
  for (const id of [...customs, ...BUILTIN_MATCH_ORDER]) {
    const def = registry.byId[id];
    if (def && def.keywords.some((keyword) => matchesKeyword(haystack, keyword))) {return id;}
  }
  return null;
}
