/**
 * Harness route for @acc/unit-symbol-picker.
 *
 * Like its neighbours, this imports the package by its PUBLISHED specifiers,
 * which the aliases resolve to source — so editing the picker shows up here
 * immediately, and this page compiles against the same surface a consumer gets.
 *
 * What it demonstrates beyond "the component renders": the picker's output is
 * a value, not a string it owns. The panel on the right shows the SIDC and its
 * fields as the picker changes them, which is what a host would persist, and
 * the row of presets below sets that value from the outside — the case a
 * controlled component has to get right and usually does not.
 */
import React, { useMemo, useState } from "react";
import {
  DEFAULT_SIDC,
  type Sidc,
  formatSidc,
  formatSidcGrouped,
  parseSidc,
} from "@acc/unit-symbol-picker";
import { UnitSymbolPicker } from "@acc/unit-symbol-picker/react";
import {
  SYMBOL_SET_TABLES,
  lookupLegacy,
  pickerIcons,
} from "@acc/unit-symbol-picker/tables";

/** Codes worth having one click away, and each makes a different point. */
const PRESETS: Array<{ label: string; code: string; why: string }> = [
  {
    label: "Friendly infantry platoon",
    code: "10031000141211000000",
    why: "the default case: identity, echelon and icon all set",
  },
  {
    label: "Hostile armour battalion",
    code: "10061000161213000000",
    why: "identity 6 flips the frame; echelon 16 adds the battalion bar",
  },
  {
    label: "Planned friendly HQ",
    code: "10031012181211000000",
    why: "status 1 dashes the frame, HQ/TF/dummy 2 adds the staff",
  },
  {
    label: "Neutral engineer company",
    code: "10041000151606000000",
    why: "a symbol set's icon table is what makes this one different",
  },
];

/**
 * Legacy codes worth pasting into the picker's second box.
 *
 * These are the unit templates the /mil harness ships, so they are the closest
 * thing here to real data. Before the tables existed every one of them
 * converted its affiliation and left the icon alone.
 */
const LEGACY_EXAMPLES = [
  "SFGPUCI-----D---",
  "SHGPUCA-----E---",
  "SFGPUCF-----D---",
  "SNGPUCE-----D---",
];

function UnitSymbolPickerPage(): React.ReactElement {
  const [sidc, setSidc] = useState<Sidc>(DEFAULT_SIDC);

  // The published icon tables, hierarchy intact, so the picker can offer one
  // control per level instead of one list of two thousand rows. Built once.
  const icons = useMemo(() => pickerIcons(), []);
  const iconCount = useMemo(
    () => Object.values(icons).reduce((total, list) => total + list.length, 0),
    [icons],
  );
  const currentSet = SYMBOL_SET_TABLES[sidc.symbolSet];

  return (
    <div style={page}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>@acc/unit-symbol-picker</h1>
        <p style={{ margin: "4px 0 0", color: "#5a6178", fontSize: 12, maxWidth: 620 }}>
          The symbol in the middle, the SIDC above it, a dropdown per position below. Type either
          form of the code, pick from any dropdown, or load a preset — all three are views of one
          value.
        </p>
      </header>

      <div style={columns}>
        <section style={card}>
          <h2 style={cardTitle}>Picker</h2>
          <UnitSymbolPicker
            value={sidc}
            onChange={(next) => setSidc(next)}
            size={72}
            icons={icons}
            legacyLookup={lookupLegacy}
          />
        </section>

        <section style={card}>
          <h2 style={cardTitle}>What the host gets</h2>
          <div style={{ font: "12px/1.6 ui-monospace, monospace" }}>
            <div>{formatSidc(sidc)}</div>
            <div style={{ color: "#8b93a7" }}>{formatSidcGrouped(sidc)}</div>
          </div>
          <table style={table}>
            <tbody>
              {(Object.keys(sidc) as Array<keyof Sidc>).map((field) => (
                <tr key={field}>
                  <td style={fieldName}>{field}</td>
                  <td style={fieldValue}>{sidc[field]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={cardTitle}>Presets — setting the value from outside</h2>
        <div style={presetRow}>
          {PRESETS.map((preset) => (
            <button
              key={preset.code}
              type="button"
              style={presetButton}
              title={preset.why}
              onClick={() => setSidc(parseSidc(preset.code))}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p style={{ margin: "8px 0 0", color: "#5a6178", fontSize: 11 }}>
          Hover for what each one exercises.
        </p>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={cardTitle}>Legacy codes — paste one into the second box</h2>
        <div style={presetRow}>
          {LEGACY_EXAMPLES.map((code) => (
            <code key={code} style={legacyChip}>
              {code}
            </code>
          ))}
        </div>
        <p style={{ margin: "8px 0 0", color: "#5a6178", fontSize: 11 }}>
          The picker is given <code>lookupLegacy</code>, so these convert completely — icon included
          — and it reports nothing as approximated. Without the table it would set the affiliation
          and say plainly that it had left the icon alone, which is what it did before this data
          existed.
        </p>
      </section>

      <section style={{ ...card, marginTop: 12 }}>
        <h2 style={cardTitle}>Where the dropdowns come from</h2>
        <p style={{ margin: 0, color: "#8b93a7", fontSize: 12 }}>
          The main-icon list is the published entity table, generated from the symbology XML in the
          package&apos;s own <code>schemas/</code>: <strong>{iconCount.toLocaleString()}</strong>{" "}
          icons across <strong>{Object.keys(SYMBOL_SET_TABLES).length}</strong> symbol sets.
          {currentSet
            ? ` ${currentSet.label} alone has ${currentSet.icons.length}, with ${currentSet.sectorOneModifiers.length} sector-one and ${currentSet.sectorTwoModifiers.length} sector-two modifiers.`
            : ` Symbol set ${sidc.symbolSet} has no table in this release of the data, so the main icon falls back to a six-digit field.`}
        </p>
        <p style={{ margin: "8px 0 0", color: "#5a6178", fontSize: 11 }}>
          The main icon is one control per level of the hierarchy — entity, type,
          subtype — rather than one list of everything. Categories that draw
          nothing of their own are marked with an ellipsis: pick one and the next
          control appears. This page calls <code>pickerIcons()</code>, which
          pulls all 24 sets in; an application that offers one should import it
          directly — <code>@acc/unit-symbol-picker/tables/landUnit</code> — and
          carry only that.
        </p>
      </section>
    </div>
  );
}

const page: React.CSSProperties = {
  padding: 24,
  font: "13px/1.5 system-ui, sans-serif",
  color: "#e8ecf4",
  background: "#0a0c0f",
  // The picker inherits its colours and styles its own controls, but the list a
  // native <select> opens is drawn by the OS and cannot be styled. Declaring the
  // scheme is how a dark host gets a dark dropdown instead of the white panel
  // this page used to show — the library stays theme-agnostic, the app decides.
  colorScheme: "dark",
  height: "100%",
  width: "100%",
  boxSizing: "border-box",
  overflowY: "auto",
};

const columns: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
  alignItems: "start",
};

const card: React.CSSProperties = {
  background: "#111318",
  border: "1px solid #23293a",
  borderRadius: 4,
  padding: 12,
};

const cardTitle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "#8b93a7",
};

const table: React.CSSProperties = {
  marginTop: 10,
  borderCollapse: "collapse",
  font: "11px/1.5 ui-monospace, monospace",
};

const fieldName: React.CSSProperties = { color: "#8b93a7", paddingRight: 12 };
const fieldValue: React.CSSProperties = { color: "#e8ecf4" };

const presetRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };

const legacyChip: React.CSSProperties = {
  background: "#171a21",
  border: "1px solid #374057",
  borderRadius: 3,
  color: "#c9d1d9",
  padding: "4px 8px",
  font: "12px/1.3 ui-monospace, monospace",
};

const presetButton: React.CSSProperties = {
  background: "#171a21",
  border: "1px solid #374057",
  borderRadius: 3,
  color: "#e8ecf4",
  padding: "5px 9px",
  font: "12px/1.3 system-ui, sans-serif",
  cursor: "pointer",
};

export default UnitSymbolPickerPage;
