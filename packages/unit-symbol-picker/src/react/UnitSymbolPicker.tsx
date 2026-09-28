/**
 * A compact unit-symbol picker: the symbol in the middle, the code above it,
 * one dropdown per SIDC position below.
 *
 * Three ways to say the same thing, all editable, all in sync because they are
 * all views of one `Sidc` value rather than three strings kept in step by hand:
 *
 *  - the twenty-digit modern code, typed or pasted, separators optional;
 *  - the legacy fifteen-character code, for the data and the fingers that still
 *    carry it — converted as far as it honestly can be, with what it could not
 *    convert stated rather than hidden;
 *  - a dropdown per position, which is the same `withField` call each time.
 *
 * The main icon is the exception, and deliberately: the entity block is a tree
 * of two thousand rows, so it gets one control per level of that tree rather
 * than one list of everything. See ../core/iconLevels.
 *
 * milsymbol is a peer dependency and is asked for the icon directly. If it
 * cannot draw the code — a half-typed entity, an implausible combination — the
 * frame stays and the space where the symbol goes says so, because a blank box
 * looks like a broken component and an error message looks like a wrong code.
 *
 * Everything is inline-styled and inherits its colours. A published component
 * that shipped a stylesheet would need a build step to copy it and a consumer
 * willing to import it; one that hard-coded its palette would look wrong on
 * half the pages it lands on. Set `color-scheme` on an ancestor and the native
 * dropdown lists follow the host's theme too.
 */

import React, { useMemo, useState } from "react";
import ms from "milsymbol";

import {
  DEFAULT_SIDC,
  formatSidc,
  formatSidcGrouped,
  legacyToSidc,
  parseSidc,
  withField,
  type LegacyLookup,
  type Sidc,
} from "../core/sidc";
import {
  COMMON_LAND_ICONS,
  CONTEXTS,
  ECHELONS,
  ECHELON_SYMBOL_SETS,
  HQ_TF_DUMMY,
  IDENTITIES,
  MOBILITIES,
  STATUSES,
  SYMBOL_SETS,
} from "../core/fields";
import { iconLevels, type HierarchicalSidcOption } from "../core/iconLevels";

export interface UnitSymbolPickerProps {
  /** Controlled value. Omit for uncontrolled use. */
  value?: Sidc;
  onChange?: (sidc: Sidc, code: string) => void;
  /**
   * The icon options for the main-icon control, per symbol set.
   *
   * Options carrying a `path` (or a label spelled "Entity : Type : Subtype")
   * are shown as one control per level. A flat list is shown as one control, so
   * a short curated list still behaves the way it reads.
   *
   * There is no built-in table beyond a handful of land units, on purpose: the
   * entity block is thousands of published rows and a partial list typed from
   * memory is a dropdown that looks authoritative and is wrong where nobody
   * checks. Import the generated tables from
   * "@acc/unit-symbol-picker/tables", or supply your own; without either, the
   * main icon is a plain six-digit field, which is always honest.
   */
  icons?: Record<string, HierarchicalSidcOption[]>;
  /**
   * The 2525C function-id table, for the legacy input.
   *
   * Without one the legacy box converts the affiliation, dimension and status
   * and says plainly that it left the icon alone. With one it converts the
   * icon too. Pass `lookupLegacy` from "@acc/unit-symbol-picker/tables"; it is
   * a prop rather than a built-in for the same reason `icons` is — ~1900 rows
   * that an app which never types a legacy code should not carry.
   */
  legacyLookup?: LegacyLookup;
  /** Symbol size in px. Default 60 — this is meant to be compact. */
  size?: number;
  /** Extra milsymbol options: fill, colours, text amplifiers. */
  symbolOptions?: Record<string, unknown>;
}

export function UnitSymbolPicker({
  value,
  onChange,
  icons,
  legacyLookup,
  size = 60,
  symbolOptions,
}: UnitSymbolPickerProps): React.ReactElement {
  const [internal, setInternal] = useState<Sidc>(value ?? DEFAULT_SIDC);
  const sidc = value ?? internal;
  const code = formatSidc(sidc);

  // What the user is typing, kept separately from the parsed value: rewriting
  // the field on every keystroke fights the caret and makes deletion feel
  // broken.
  const [typed, setTyped] = useState<string | null>(null);
  const [legacy, setLegacy] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const set = (next: Sidc) => {
    setInternal(next);
    setTyped(null);
    onChange?.(next, formatSidc(next));
  };

  const svg = useMemo(() => {
    try {
      const symbol = new ms.Symbol(code, { size, ...symbolOptions });
      // milsymbol answers with an empty icon rather than throwing for a code it
      // cannot place, so ask its own validity check too.
      return symbol.isValid() ? symbol.asSVG() : null;
    } catch {
      return null;
    }
  }, [code, size, symbolOptions]);

  const positional = ECHELON_SYMBOL_SETS.has(sidc.symbolSet) ? ECHELONS : MOBILITIES;
  const iconOptions =
    icons?.[sidc.symbolSet] ?? (sidc.symbolSet === "10" ? COMMON_LAND_ICONS : undefined);

  // Recomputed only when the table or the entity changes: the tables are large
  // and this walks them.
  const levels = useMemo(
    () => (iconOptions ? iconLevels(iconOptions, sidc.entity) : []),
    [iconOptions, sidc.entity],
  );

  return (
    <div style={wrap}>
      <div style={row}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <input
            aria-label="SIDC"
            value={typed ?? formatSidcGrouped(sidc)}
            onChange={(e) => {
              setTyped(e.target.value);
              const next = parseSidc(e.target.value);
              setInternal(next);
              onChange?.(next, formatSidc(next));
            }}
            onBlur={() => setTyped(null)}
            style={codeInput}
            spellCheck={false}
          />
          <input
            aria-label="Legacy SIDC"
            placeholder="legacy e.g. SFGPUCI-----D---"
            value={legacy}
            onChange={(e) => setLegacy(e.target.value)}
            onBlur={() => {
              if (legacy.trim() === "") {
                setNote(null);
                return;
              }
              const converted = legacyToSidc(legacy, sidc, legacyLookup);
              if (!converted) {
                setNote("not a 15-character legacy code");
                return;
              }
              set(converted.sidc);
              setNote(
                converted.approximated.length > 0
                  ? `kept as-is: ${converted.approximated.join(", ")}`
                  : null,
              );
            }}
            style={legacyInput}
            spellCheck={false}
          />
        </div>
        <div style={{ ...symbolBox, width: size + 16, height: size + 16 }}>
          {svg ? (
            <SymbolSvg svg={svg} />
          ) : (
            <span style={invalid}>no symbol for this code</span>
          )}
        </div>
      </div>
      {note && <div style={noteStyle}>{note}</div>}

      <div style={grid}>
        <Select label="Context" options={CONTEXTS} value={sidc.context}
          onPick={(v) => set(withField(sidc, "context", v))} />
        <Select label="Identity" options={IDENTITIES} value={sidc.identity}
          onPick={(v) => set(withField(sidc, "identity", v))} />
        <Select label="Symbol set" options={SYMBOL_SETS} value={sidc.symbolSet}
          onPick={(v) => set(withField(sidc, "symbolSet", v))} />
        <Select label="Status" options={STATUSES} value={sidc.status}
          onPick={(v) => set(withField(sidc, "status", v))} />
        <Select label="HQ / TF / dummy" options={HQ_TF_DUMMY} value={sidc.hqTfDummy}
          onPick={(v) => set(withField(sidc, "hqTfDummy", v))} />
        <Select
          label={ECHELON_SYMBOL_SETS.has(sidc.symbolSet) ? "Echelon" : "Mobility"}
          options={positional}
          value={sidc.echelon}
          onPick={(v) => set(withField(sidc, "echelon", v))}
        />
      </div>

      {levels.length > 0 ? (
        <div style={grid}>
          {levels.map((level, depth) => (
            <Select
              key={level.label}
              label={level.label}
              options={level.options}
              value={level.value}
              // Only the levels below the first can be cleared, and clearing
              // means "the parent, unqualified" rather than "nothing".
              resetTo={level.resetTo}
              placeholder={depth === 0 ? "Choose…" : "Any"}
              onPick={(v) => set(withField(sidc, "entity", v))}
            />
          ))}
        </div>
      ) : (
        <label style={field}>
          <span style={labelStyle}>Main icon</span>
          <input
            value={sidc.entity}
            onChange={(e) => set(withField(sidc, "entity", e.target.value))}
            style={codeInput}
            spellCheck={false}
          />
        </label>
      )}
    </div>
  );
}

/**
 * milsymbol hands back SVG markup as a string, and this repo's CI blocks
 * dangerouslySetInnerHTML outright — rightly, whatever the provenance. An
 * <img> with a data URL renders the same markup without ever giving it to the
 * DOM parser as HTML.
 */
function SymbolSvg({ svg }: { svg: string }): React.ReactElement {
  const src = useMemo(
    () => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    [svg],
  );
  return <img src={src} alt="unit symbol" style={{ maxWidth: "100%", maxHeight: "100%" }} />;
}

function Select({
  label,
  options,
  value,
  onPick,
  resetTo,
  placeholder,
}: {
  label: string;
  options: HierarchicalSidcOption[];
  value: string;
  onPick: (code: string) => void;
  /** Offered as "Any": the parent code, for a level that can be un-narrowed. */
  resetTo?: string;
  /** Shown when nothing is selected yet. */
  placeholder?: string;
}): React.ReactElement {
  // A code the caller's data uses but this list does not name still has to be
  // visible and selectable, or opening the picker would silently change the
  // symbol.
  const known = options.some((option) => option.code === value);
  return (
    <label style={field}>
      <span style={labelStyle}>{label}</span>
      <select
        value={value}
        onChange={(event) => onPick(event.target.value)}
        style={selectStyle}
      >
        {value === "" && <option value="">{placeholder ?? "—"}</option>}
        {value !== "" && !known && (
          <option value={value}>{value} (not in list)</option>
        )}
        {resetTo !== undefined && <option value={resetTo}>Any</option>}
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {/* A category that draws nothing of its own says so, rather than
                leaving the user to wonder why the frame came up empty. */}
            {option.abstract === true ? `${option.label} …` : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A chevron, so the controls read as dropdowns once the native one is off. */
const CARET =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";

const wrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  font: "12px/1.4 system-ui, sans-serif",
  minWidth: 260,
};

const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "flex-start" };

/** Shared metrics, so the inputs and the dropdowns sit on the same grid. */
const control: React.CSSProperties = {
  font: "12px/1.4 system-ui, sans-serif",
  color: "inherit",
  backgroundColor: "transparent",
  border: "1px solid rgba(128, 128, 128, 0.4)",
  borderRadius: 4,
  padding: "5px 8px",
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...control,
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  backgroundImage: CARET,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 7px center",
  paddingRight: 24,
  cursor: "pointer",
  textOverflow: "ellipsis",
};

const codeInput: React.CSSProperties = {
  ...control,
  font: "12px/1.4 ui-monospace, monospace",
};

const legacyInput: React.CSSProperties = { ...codeInput, opacity: 0.85 };

const symbolBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  border: "1px solid rgba(128,128,128,0.35)",
  borderRadius: 4,
};

const invalid: React.CSSProperties = {
  fontSize: 9,
  opacity: 0.6,
  textAlign: "center",
  padding: 2,
};

const noteStyle: React.CSSProperties = { fontSize: 11, opacity: 0.7 };

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "6px 8px",
};

const field: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
};

const labelStyle: React.CSSProperties = { fontSize: 10, opacity: 0.7 };
