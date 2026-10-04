/**
 * Example: country outlines and facts as an add-on to the basemap.
 *
 * `countries()` is an EXTENSION, like elevation: the basemap is stock, and the
 * country layer slots in under its labels. The panel drives the extension's
 * controller — border view, region scheme, what a click picks, how the fill is
 * coloured — none of which rebuilds the map.
 *
 * DATA
 * ----
 * COUNTRIES_DATASET_RID below is the `countries_map` dataset built by
 * packages/decho-countries/foundry/countries_transform.py. Fill it in and add
 * the dataset as a Resource on the app in Developer Console; every view the
 * dataset carries then appears in the panel. Left empty, the page shows the
 * plain basemap and says so — the package carries no data of its own.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { describeBasemapError } from "@acc/decho-basemap";
import { DechoBasemap } from "@acc/decho-basemap/react";
import {
  FIGURE_LABELS,
  figuresOf,
  flagEmoji,
  formatFigure,
  orderedFigureKeys,
  type CountriesStore,
  type CountryRecord,
  type Figure,
  type SourceInfo,
} from "@acc/decho-countries";
import {
  countries,
  type CountriesController,
  type CountriesMode,
  type CountrySelection,
  type FillMode,
} from "@acc/decho-countries/extension";
import {
  errorPanel,
  mapPanel,
  panelFigures,
  panelHeading,
  panelMuted,
  panelSeparator,
  surface,
} from "@/components/mapPanel";

/** The `countries_map` dataset built by the package's Foundry transform. */
const COUNTRIES_DATASET_RID = "";

const STORE: CountriesStore | null = COUNTRIES_DATASET_RID
  ? { kind: "dataset", datasetRid: COUNTRIES_DATASET_RID }
  : null;

const SPAWN = { lat: 25, lon: 15, zoom: 1.6 };

const MODES: Array<{ id: CountriesMode; label: string }> = [
  { id: "countries", label: "Countries" },
  { id: "regions", label: "Regions" },
  { id: "auto", label: "Auto" },
];

/** Population per km², banded, as an example of a function fill. */
function densityFill(country: CountryRecord): string | null {
  const population = country.figures.population?.value;
  const area = (country.figures.landAreaKm2 ?? country.figures.totalAreaKm2)?.value;
  if (!population || !area) {return null;}
  const density = population / area;
  return density > 300 ? "#7f1d1d" : density > 100 ? "#c2410c" : density > 30 ? "#f59e0b" : density > 10 ? "#fde68a" : "#fef9c3";
}

const FILLS: Array<{ id: string; label: string; fill: FillMode }> = [
  { id: "region", label: "By region", fill: "region" },
  { id: "country", label: "By country", fill: "country" },
  { id: "density", label: "By population density", fill: densityFill },
  { id: "none", label: "Borders only", fill: "none" },
];

const select: React.CSSProperties = {
  width: "100%",
  padding: "4px 6px",
  borderRadius: 4,
  border: `1px solid ${surface.border}`,
  background: "rgba(255,255,255,0.08)",
  color: surface.text,
  font: "12px/1.4 sans-serif",
};

/**
 * The facts about a selection, in this page's own style. Written here rather
 * than taken from the package: the package supplies the data and the helpers
 * (derived figures, labels, formatting, flags), and how a card looks is the
 * app's call. Two things any version should keep: each figure's year — they
 * differ by country and by figure — and the sources line, since the World
 * Bank's licence (CC BY 4.0) asks for credit wherever its figures are shown.
 */
function SelectionFacts({
  selection,
  sources,
  onClose,
}: {
  selection: CountrySelection;
  sources: SourceInfo[];
  onClose: () => void;
}): React.ReactElement {
  const country = selection.kind === "country" ? selection.country : null;
  const figures: Record<string, Figure> = country ? figuresOf(country) : selection.kind === "region" ? selection.region.figures : {};
  const title = country ? `${flagEmoji(country.iso2)} ${country.name}`.trim() : selection.kind === "region" ? selection.region.id : "";
  const subtitle = country
    ? [country.longName, selection.kind === "country" ? selection.region?.id : undefined, country.kind].filter(Boolean).join(" · ")
    : selection.kind === "region"
      ? `${selection.scheme.label} · ${selection.region.countries.length} countries`
      : "";
  const facts: Array<[string, string]> = [];
  if (country?.capital) {facts.push(["Capital", country.capital.name]);}
  const codes = country ? [country.iso2, country.iso3, country.isoNumeric].filter(Boolean).join(" / ") : "";
  if (codes) {facts.push(["ISO codes", codes]);}
  for (const key of orderedFigureKeys(figures)) {
    const figure = figures[key];
    facts.push([FIGURE_LABELS[key]?.label ?? key, `${formatFigure(key, figure)}${figure.year ? ` (${figure.year})` : ""}`]);
  }
  return (
    <div aria-label={title}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 15px/1.35 sans-serif" }}>{title}</div>
          {subtitle && <div style={panelMuted}>{subtitle}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", font: "16px/1 sans-serif" }}
        >
          ×
        </button>
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 12px", margin: "8px 0 0" }}>
        {facts.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt style={panelMuted}>{label}</dt>
            <dd style={{ margin: 0 }}>{value}</dd>
          </React.Fragment>
        ))}
      </dl>
      {sources.length > 0 && (
        <div style={{ ...panelMuted, marginTop: 8, fontSize: 11 }}>
          Sources: {sources.map((s) => (s.licence ? `${s.name} (${s.licence})` : s.name)).join(", ")}
        </div>
      )}
    </div>
  );
}

function CountriesPage(): React.ReactElement {
  const [controller, setController] = useState<CountriesController | null>(null);
  const [selection, setSelection] = useState<CountrySelection | null>(null);
  const [hover, setHover] = useState<CountrySelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fillId, setFillId] = useState("region");
  const [query, setQuery] = useState("");
  // The controller's state is not React state; this re-renders the panel when it changes.
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);

  // A fill is part of the style, so changing it builds a new extension — and
  // with it a new map. Everything else goes through the controller.
  const fill = FILLS.find((option) => option.id === fillId)?.fill ?? "region";
  const handlers = useRef({ setSelection, setHover, setController, setError });
  const extensions = useMemo(
    () => !STORE ? [] : [
      countries({
        store: STORE,
        fill,
        fillOpacity: fillId === "density" ? 0.55 : undefined,
        onSelect: (s) => handlers.current.setSelection(s),
        onHover: (s) => handlers.current.setHover(s),
        onReady: (c) => handlers.current.setController(c),
        onError: (e) => handlers.current.setError(e instanceof Error ? e.message : String(e)),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fillId],
  );
  // A new extension starts from its own defaults: nothing selected or hovered.
  useEffect(() => {
    setSelection(null);
    setHover(null);
  }, [fillId]);

  const matches = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!controller || text.length < 2) {return [];}
    return controller.data.records
      .filter((record) => record.name.toLowerCase().includes(text) || record.iso3?.toLowerCase() === text)
      .slice(0, 8);
  }, [controller, query]);

  const choose = (id: string) => {
    controller?.select({ kind: "country", id });
    controller?.fitTo({ kind: "country", id });
    setQuery("");
  };

  const views = controller?.data.manifest.views ?? [];
  const schemes = controller?.data.manifest.regionSchemes ?? [];

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <DechoBasemap
        key={fillId}
        rid="ri.foundry.main.dataset.c7e99de1-90a4-4e22-bd26-b42316d70fe4"
        assetsRid="ri.foundry.main.dataset.8637f7a1-7503-459c-82c9-78e6ffa94e6e"
        spritePath="sprites/light"
        spawnLat={SPAWN.lat}
        spawnLong={SPAWN.lon}
        spawnZoom={SPAWN.zoom}
        globe
        extensions={extensions}
        style={{ height: "100%" }}
        renderError={(err) => {
          const { title, detail } = describeBasemapError(err);
          return (
            <div style={{ ...errorPanel, top: 12, left: 12 }}>
              <strong>{title}</strong>
              <div>{detail}</div>
            </div>
          );
        }}
      />

      <div style={{ ...mapPanel, display: "block", top: 12, left: 12, width: 290, maxHeight: "calc(100% - 24px)", overflowY: "auto" }}>
        <div style={panelHeading}>Countries</div>
        <div style={panelMuted}>
          {STORE
            ? "From the countries dataset"
            : "No countries dataset set. Put the countries_map dataset's RID in COUNTRIES_DATASET_RID (src/PackageApps/dechoCountries/CountriesPage.tsx)."}
          {controller && ` · ${controller.data.records.length} countries`}
        </div>
        {error && <div style={{ color: "#ff9a92", marginTop: 6 }}>{error}</div>}

        <div style={{ ...panelSeparator, margin: "8px 0" }} />

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a country…"
          aria-label="Find a country"
          style={select}
        />
        {matches.map((record) => (
          <button
            key={record.id}
            type="button"
            onClick={() => choose(record.id)}
            style={{ ...select, display: "block", textAlign: "left", marginTop: 2, cursor: "pointer", border: 0 }}
          >
            {flagEmoji(record.iso2)} {record.name}
          </button>
        ))}

        <label style={{ display: "block", marginTop: 8 }}>
          <span style={panelMuted}>Borders</span>
          <select
            style={select}
            value={controller?.view.id ?? ""}
            disabled={views.length < 2}
            onChange={(event) => void controller?.setView(event.target.value).then(refresh)}
          >
            {views.map((view) => (
              <option key={view.id} value={view.id}>{view.label}</option>
            ))}
          </select>
        </label>
        {controller?.view.description && <div style={{ ...panelMuted, fontSize: 11 }}>{controller.view.description}</div>}

        <label style={{ display: "block", marginTop: 8 }}>
          <span style={panelMuted}>Regions</span>
          <select
            style={select}
            value={controller?.regionScheme?.id ?? ""}
            onChange={(event) => {
              controller?.setRegionScheme(event.target.value);
              refresh();
            }}
          >
            {schemes.map((scheme) => (
              <option key={scheme.id} value={scheme.id}>{scheme.label}</option>
            ))}
          </select>
        </label>

        <div style={{ marginTop: 8 }}>
          <span style={panelMuted}>Click picks</span>
          <div style={{ display: "flex", gap: 4 }}>
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                aria-pressed={controller?.mode === mode.id}
                onClick={() => {
                  controller?.setMode(mode.id);
                  refresh();
                }}
                style={{
                  ...select,
                  flex: 1,
                  cursor: "pointer",
                  background: controller?.mode === mode.id ? surface.accent : "rgba(255,255,255,0.08)",
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: "block", marginTop: 8 }}>
          <span style={panelMuted}>Fill</span>
          <select style={select} value={fillId} onChange={(event) => setFillId(event.target.value)}>
            {FILLS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>

        <div style={{ ...panelFigures, marginTop: 8, minHeight: 18 }}>
          {hover?.kind === "country" ? `${flagEmoji(hover.country.iso2)} ${hover.country.name}` : hover?.kind === "region" ? hover.region.id : "Hover a country"}
        </div>

        {selection && (
          <>
            <div style={{ ...panelSeparator, margin: "8px 0" }} />
            <SelectionFacts
              selection={selection}
              sources={controller?.data.manifest.sources ?? []}
              onClose={() => controller?.select(null)}
            />
            <button
              type="button"
              style={{ ...select, marginTop: 8, cursor: "pointer" }}
              onClick={() =>
                controller?.fitTo(
                  selection.kind === "country"
                    ? { kind: "country", id: selection.country.id }
                    : { kind: "region", id: selection.region.id },
                )
              }
            >
              Zoom to {selection.kind === "country" ? selection.country.name : selection.region.id}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default CountriesPage;
