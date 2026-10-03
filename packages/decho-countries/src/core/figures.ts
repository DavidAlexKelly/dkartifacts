/**
 * Naming, deriving and summing figures, and a country's flag.
 */

import type { CountryRecord, Figure, Region } from "./types.js";

/**
 * The figures this package knows by name, in the order a card shows them.
 * A dataset may carry others; they are shown after these, under their key.
 */
export const FIGURE_LABELS: Record<string, { label: string; unit?: string }> = {
  population: { label: "Population" },
  landAreaKm2: { label: "Land area", unit: "km²" },
  totalAreaKm2: { label: "Total area", unit: "km²" },
  densityPerKm2: { label: "Population density", unit: "per km²" },
  gdpUsd: { label: "GDP", unit: "US$" },
  gdpPerCapitaUsd: { label: "GDP per person", unit: "US$" },
};

/** Figures that add up across a region. Per-person ones and densities do not. */
const ADDITIVE = new Set(["population", "landAreaKm2", "totalAreaKm2", "gdpUsd"]);

/**
 * The record's figures plus the ones derivable from them: density from
 * population and land area (total area when there is no land area), and GDP
 * per person from GDP and population when the data has no figure of its own.
 */
export function figuresOf(record: Pick<CountryRecord, "figures">): Record<string, Figure> {
  const out: Record<string, Figure> = { ...record.figures };
  const population = out.population;
  const area = out.landAreaKm2 ?? out.totalAreaKm2;
  if (!out.densityPerKm2 && population && area && area.value > 0) {
    out.densityPerKm2 = {
      value: population.value / area.value,
      ...(population.year ? { year: population.year } : {}),
      note: `derived: population ÷ ${out.landAreaKm2 ? "land" : "total"} area`,
    };
  }
  if (!out.gdpPerCapitaUsd && out.gdpUsd && population && population.value > 0) {
    out.gdpPerCapitaUsd = {
      value: out.gdpUsd.value / population.value,
      ...(out.gdpUsd.year ? { year: out.gdpUsd.year } : {}),
      note: "derived: GDP ÷ population",
    };
  }
  return out;
}

/** Figure keys in display order: the named ones first, then the rest. */
export function orderedFigureKeys(figures: Record<string, Figure>): string[] {
  const named = Object.keys(FIGURE_LABELS).filter((key) => key in figures);
  const others = Object.keys(figures).filter((key) => !(key in FIGURE_LABELS)).sort();
  return [...named, ...others];
}

/** Sum the additive figures over a region's members. */
export function sumFigures(records: Array<Pick<CountryRecord, "figures">>): Region["figures"] {
  const out: Region["figures"] = {};
  for (const record of records) {
    for (const [key, figure] of Object.entries(record.figures)) {
      if (!ADDITIVE.has(key) || !Number.isFinite(figure.value)) {continue;}
      const sum = out[key];
      if (sum) {
        sum.value += figure.value;
        sum.members += 1;
        // The span of years, kept as the latest: a region figure is as fresh as its newest member.
        if (figure.year && (!sum.year || figure.year > sum.year)) {sum.year = figure.year;}
      } else {
        out[key] = { value: figure.value, members: 1, ...(figure.year ? { year: figure.year } : {}) };
      }
    }
  }
  const density = out.population && (out.landAreaKm2 ?? out.totalAreaKm2);
  if (density && density.value > 0) {
    out.densityPerKm2 = { value: out.population.value / density.value, members: out.population.members };
  }
  return out;
}

/** The flag emoji for a two-letter ISO code, built from regional indicator letters. */
export function flagEmoji(iso2: string | undefined): string {
  if (!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) {return "";}
  const base = 0x1f1e6;
  const upper = iso2.toUpperCase();
  return String.fromCodePoint(base + upper.charCodeAt(0) - 65, base + upper.charCodeAt(1) - 65);
}

/** "67.4 million", "551,500 km²", "$2.9 trillion": short, for cards and tooltips. */
export function formatFigure(key: string, figure: Figure, locale = "en-GB"): string {
  const { value } = figure;
  const unit = FIGURE_LABELS[key]?.unit;
  const compact = (n: number) =>
    new Intl.NumberFormat(locale, { notation: "compact", maximumSignificantDigits: 3 }).format(n);
  const plain = (n: number, digits = 0) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);
  if (unit === "US$") {return `$${value >= 1e6 ? compact(value) : plain(value)}`;}
  if (key === "population") {return value >= 1e6 ? compact(value) : plain(value);}
  if (unit) {return `${plain(value, value < 10 ? 1 : 0)} ${unit}`;}
  return plain(value, 2);
}
