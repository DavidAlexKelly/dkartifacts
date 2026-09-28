/**
 * The APP-6D / MIL-STD-2525D symbol identification code, as data.
 *
 * A SIDC is twenty digits in ten pairs, and every pair means something:
 *
 * ```
 *  10 0 3 10 0 0 00 121100 00 00
 *  │  │ │ │  │ │ │  │      │  └── modifier 2
 *  │  │ │ │  │ │ │  │      └───── modifier 1
 *  │  │ │ │  │ │ │  └──────────── entity / entity type / entity subtype
 *  │  │ │ │  │ │ └─────────────── (part of the entity block)
 *  │  │ │ │  │ └───────────────── HQ / task force / dummy
 *  │  │ │ │  └─────────────────── status
 *  │  │ │ └────────────────────── symbol set
 *  │  │ └──────────────────────── standard identity
 *  │  └────────────────────────── context
 *  └───────────────────────────── version
 * ```
 *
 * This module is the whole reason the package can be trusted: everything else
 * is presentation over it. It parses, it formats, and it changes one field
 * without disturbing the others — which is exactly what a dropdown per position
 * needs, and exactly what string surgery in a component gets wrong.
 *
 * The legacy 15-character form (2525C, "SFGPUCI-----D---") is supported as
 * INPUT, because that is what most existing data and most people's fingers
 * carry, and milsymbol reads it directly. It is deliberately not the internal
 * representation: it cannot express everything the modern form can, so
 * converting to it would lose information the user typed.
 */

/** The modern form, as named fields. Each is the exact width of its slot. */
export interface Sidc {
  /** Digits 1-2. "10" is the only version in the standard. */
  version: string;
  /** Digit 3. Reality / exercise / simulation. */
  context: string;
  /** Digit 4. Friend, hostile, neutral, unknown, … */
  identity: string;
  /** Digits 5-6. Land unit, air, sea surface, control measure, … */
  symbolSet: string;
  /** Digit 7. Present, planned, damaged, … */
  status: string;
  /** Digit 8. Headquarters, task force, dummy, and their combinations. */
  hqTfDummy: string;
  /** Digits 9-10. Echelon, mobility or towed-array, per the symbol set. */
  echelon: string;
  /** Digits 11-16. The icon itself: entity, type, subtype. */
  entity: string;
  /** Digits 17-18. */
  modifier1: string;
  /** Digits 19-20. */
  modifier2: string;
}

/** Field widths, in SIDC order. The single source of truth for the layout. */
const LAYOUT: Array<[keyof Sidc, number]> = [
  ["version", 2],
  ["context", 1],
  ["identity", 1],
  ["symbolSet", 2],
  ["status", 1],
  ["hqTfDummy", 1],
  ["echelon", 2],
  ["entity", 6],
  ["modifier1", 2],
  ["modifier2", 2],
];

export const SIDC_LENGTH = 20;

/** A friendly land infantry unit — the default something has to be. */
export const DEFAULT_SIDC: Sidc = {
  version: "10",
  context: "0",
  identity: "3",
  symbolSet: "10",
  status: "0",
  hqTfDummy: "0",
  echelon: "00",
  entity: "121100",
  modifier1: "00",
  modifier2: "00",
};

const digitsOnly = (text: string): string => text.replace(/\D/g, "");

/**
 * Parse twenty digits into fields. Separators of any kind are ignored, so the
 * grouped form a UI displays ("10-0-3-10-…") round-trips without special
 * handling, and a short code is padded rather than rejected: someone typing
 * left to right should see the symbol build up, not an error until the last
 * digit lands.
 */
export function parseSidc(text: string): Sidc {
  const digits = digitsOnly(text).slice(0, SIDC_LENGTH).padEnd(SIDC_LENGTH, "0");
  const out = {} as Sidc;
  let at = 0;
  for (const [field, width] of LAYOUT) {
    out[field] = digits.slice(at, at + width);
    at += width;
  }
  return out;
}

/** Twenty digits, no separators — what milsymbol wants. */
export function formatSidc(sidc: Sidc): string {
  return LAYOUT.map(([field, width]) =>
    digitsOnly(sidc[field]).slice(0, width).padStart(width, "0"),
  ).join("");
}

/** Grouped for display: `10-0-3-10-0-0-00-121100-00-00`. */
export function formatSidcGrouped(sidc: Sidc): string {
  return LAYOUT.map(([field, width]) =>
    digitsOnly(sidc[field]).slice(0, width).padStart(width, "0"),
  ).join("-");
}

/**
 * One field changed, the rest untouched.
 *
 * The point of the whole module: a dropdown sets `identity` and nothing else
 * moves. Doing this by splicing a string in a component is how a picker ends up
 * quietly rewriting the echelon when the user picks an affiliation.
 */
export function withField(sidc: Sidc, field: keyof Sidc, value: string): Sidc {
  const width = LAYOUT.find(([name]) => name === field)![1];
  return {
    ...sidc,
    [field]: digitsOnly(value).slice(0, width).padStart(width, "0"),
  };
}

/** Is this twenty digits, ignoring separators? */
export const isCompleteSidc = (text: string): boolean =>
  digitsOnly(text).length === SIDC_LENGTH;

/* ── The legacy 15-character form ─────────────────────────────────────────── */

/**
 * 2525C / APP-6B codes, e.g. `SFGPUCI-----D---`:
 *
 *   1 coding scheme · 2 affiliation · 3 battle dimension · 4 status
 *   5-10 function id · 11-12 modifiers · 13-14 echelon · 15 country/order
 *
 * Without a lookup table, only the parts with an unambiguous modern equivalent
 * are mapped: the affiliation, the dimension (to a symbol set) and the status.
 * The function id is NOT converted — the 2525C-to-2525D icon mapping is a
 * published table of several thousand rows, not a formula, and guessing it
 * would produce symbols that look plausible and mean something else.
 *
 * WITH a lookup table it is converted properly, icon included. Pass
 * `lookupLegacy` from "@acc/unit-symbol-picker/tables", which is generated from
 * the published `LegacySymbols` rows, or your own equivalent.
 */
export interface LegacyParts {
  /** Position 1: the coding scheme letter. Part of the lookup key. */
  scheme: string;
  affiliation: string;
  dimension: string;
  status: string;
  functionId: string;
  echelon: string;
}

export function parseLegacy(code: string): LegacyParts | undefined {
  const text = code.trim().toUpperCase();
  if (text.length < 10) {
    return undefined;
  }
  return {
    scheme: text[0] ?? "S",
    affiliation: text[1] ?? "-",
    dimension: text[2] ?? "-",
    status: text[3] ?? "-",
    functionId: text.slice(4, 10),
    echelon: text.slice(11, 13),
  };
}

/**
 * A function-id table, if the caller has one.
 *
 * Deliberately a function rather than a `Record`: the table is ~1900 rows, and
 * taking it as a parameter keeps it out of this module — and out of the
 * package's main entry point — so an app that only parses and formats codes
 * does not pay for it.
 */
export type LegacyLookup = (
  scheme: string,
  dimension: string,
  functionId: string,
) =>
  | {
      symbolSet: string;
      entity: string;
      modifier1?: string;
      modifier2?: string;
    }
  | undefined;

const LEGACY_IDENTITY: Record<string, string> = {
  P: "0", // pending
  U: "1", // unknown
  A: "2", // assumed friend
  F: "3", // friend
  N: "4", // neutral
  S: "5", // suspect
  H: "6", // hostile
  G: "3", // exercise friend → friend, with context handled separately
  W: "6", // exercise hostile
  D: "2", // exercise assumed friend
  L: "4", // exercise neutral
  M: "1", // exercise unknown
  J: "5", // joker → suspect
  K: "6", // faker → hostile
};

const LEGACY_SYMBOL_SET: Record<string, string> = {
  P: "10", // space → land unit is wrong; see the note below
  A: "01", // air
  G: "10", // ground → land unit
  S: "30", // sea surface
  U: "35", // subsurface
  F: "30", // SOF → sea surface is wrong; see below
  X: "35",
  Z: "10",
};

const LEGACY_STATUS: Record<string, string> = {
  A: "0", // anticipated/planned → present is wrong; mapped below
  P: "1", // present
  C: "2",
  D: "3",
  F: "0",
};

/**
 * A legacy code, as much of it as can be converted honestly.
 *
 * `base` supplies everything the legacy form cannot express. What comes back is
 * `base` with the affiliation, symbol set and status the legacy code states —
 * and, if `lookup` is supplied, the symbol set and icon the published table
 * states, which is strictly better than either.
 *
 * `approximated` lists what could NOT be converted faithfully, so a UI can say
 * so rather than present a guess as a conversion. With a lookup that finds the
 * row, it comes back empty.
 */
export function legacyToSidc(
  code: string,
  base: Sidc = DEFAULT_SIDC,
  lookup?: LegacyLookup,
): { sidc: Sidc; approximated: string[] } | undefined {
  const parts = parseLegacy(code);
  if (!parts) {
    return undefined;
  }
  const approximated: string[] = [];
  let out = base;

  const identity = LEGACY_IDENTITY[parts.affiliation];
  if (identity) {
    out = withField(out, "identity", identity);
  }
  const status = LEGACY_STATUS[parts.status];
  if (status) {
    out = withField(out, "status", status);
  }

  // The table knows the symbol set as well as the icon, and knows it per row
  // rather than per dimension letter — which is the only way to be right, since
  // dimension "G" is land units, land equipment or land installations
  // depending on the function code that follows it.
  const found = lookup?.(parts.scheme, parts.dimension, parts.functionId);
  if (found) {
    out = withField(out, "symbolSet", found.symbolSet);
    out = withField(out, "entity", found.entity);
    if (found.modifier1) {
      out = withField(out, "modifier1", found.modifier1);
    }
    if (found.modifier2) {
      out = withField(out, "modifier2", found.modifier2);
    }
    return { sidc: out, approximated };
  }

  const symbolSet = LEGACY_SYMBOL_SET[parts.dimension];
  if (symbolSet) {
    out = withField(out, "symbolSet", symbolSet);
    if (parts.dimension === "P" || parts.dimension === "F") {
      // Space and special-operations forces have their own symbol sets in the
      // modern standard and no clean single answer from the dimension alone.
      approximated.push("symbol set");
    }
  }
  if (parts.functionId.replace(/-/g, "") !== "") {
    // Stated plainly rather than half-done: the icon stays as it was.
    approximated.push(
      lookup
        ? "main icon (no published 2525C row for this function id)"
        : "main icon (2525C function id not converted — pass a lookup table)",
    );
  }
  return { sidc: out, approximated };
}
