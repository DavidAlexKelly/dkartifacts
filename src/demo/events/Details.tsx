/**
 * The right-hand details panel: one for an event, one for an area.
 *
 * Both end with the record exactly as its source had it, collapsed by
 * default. The interpreted view above it is a guess about unknown columns,
 * and the raw fields are how someone checks the guess.
 */

import React from "react";
import { panelFigures, panelMuted, panelSeparator, surface } from "@/components/mapPanel";
import { CATEGORIES, SEVERITY_COLOURS } from "./eventsLayer";
import type { MonitorEvent } from "./mockEvents";
import type { MonitorArea } from "./sources/interpret";
import { absoluteTime, capitalise, displayValue, relativeTime } from "./format";
import {
  actionButton,
  chip,
  closeButton,
  detailsPanel,
  detailsStripe,
  factValue,
  facts,
  fieldKey,
  fieldValue,
  fieldsTable,
  liveBadge,
  metricTile,
  metricsGrid,
} from "./styles";

export function EventDetails({
  event,
  now,
  groundHeight,
  demReady,
  onZoom,
  onClose,
}: {
  event: MonitorEvent;
  now: number;
  groundHeight: number | null | "loading";
  demReady: boolean;
  onZoom: () => void;
  onClose: () => void;
}): React.ReactElement {
  const category = CATEGORIES[event.category];
  const location = [event.place, event.country].filter(Boolean).join(", ");
  return (
    <div style={detailsPanel} role="dialog" aria-label={event.title}>
      <div style={{ ...detailsStripe, background: category.colour }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={chip(category.colour)}>{category.label}</span>
        <span style={chip(SEVERITY_COLOURS[event.severity])}>{capitalise(event.severity)}</span>
        {event.live && <span style={liveBadge}>LIVE</span>}
        <button type="button" style={closeButton} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div style={{ font: "600 15px/1.35 sans-serif", marginTop: 6 }}>{event.title}</div>
      <div style={panelMuted}>
        {capitalise(relativeTime(event.time, now))}
        {event.time != null && ` · ${absoluteTime(event.time)}`}
      </div>

      {event.summary && <p style={{ margin: "8px 0 4px", lineHeight: 1.5 }}>{event.summary}</p>}

      {event.metrics.length > 0 && (
        <div style={{ ...metricsGrid, marginTop: 6 }}>
          {event.metrics.map((metric) => (
            <div key={metric.label} style={metricTile}>
              <div style={panelMuted}>{metric.label}</div>
              <div style={{ font: "600 14px/1.3 sans-serif" }}>{metric.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={panelSeparator} />

      <dl style={facts}>
        {location && (
          <>
            <dt style={panelMuted}>Location</dt>
            <dd style={factValue}>{location}</dd>
          </>
        )}
        <dt style={panelMuted}>Coordinates</dt>
        <dd style={{ ...factValue, ...panelFigures, color: surface.text }}>
          {event.lat.toFixed(4)}, {event.lon.toFixed(4)}
        </dd>
        <dt style={panelMuted}>Ground elevation</dt>
        <dd style={factValue}>
          {!demReady
            ? "—"
            : groundHeight === "loading"
              ? "Reading the DEM…"
              : groundHeight == null
                ? "No DEM coverage here"
                : `${Math.round(groundHeight).toLocaleString("en-GB")} m`}
        </dd>
        <dt style={panelMuted}>Source</dt>
        <dd style={factValue}>{event.source}</dd>
        <dt style={panelMuted}>Event id</dt>
        <dd style={{ ...factValue, ...panelFigures, wordBreak: "break-all" }}>{event.id}</dd>
      </dl>

      {event.fields && <RawFields fields={event.fields} />}

      <button type="button" style={{ ...actionButton, marginTop: 8 }} onClick={onZoom}>
        Zoom to event
      </button>
    </div>
  );
}

export function AreaDetails({
  area,
  onZoom,
  onClose,
}: {
  area: MonitorArea;
  onZoom: () => void;
  onClose: () => void;
}): React.ReactElement {
  const category = CATEGORIES[area.category];
  return (
    <div style={detailsPanel} role="dialog" aria-label={area.name}>
      <div style={{ ...detailsStripe, background: category.colour }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={chip(category.colour)}>{category.label}</span>
        <span style={chip(surface.muted)}>{area.geometry.type}</span>
        <button type="button" style={closeButton} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div style={{ font: "600 15px/1.35 sans-serif", marginTop: 6 }}>{area.name}</div>
      <div style={panelMuted}>Area · {area.source}</div>
      <RawFields fields={area.fields} open />
      <button type="button" style={{ ...actionButton, marginTop: 8 }} onClick={onZoom}>
        Zoom to area
      </button>
    </div>
  );
}

function RawFields({
  fields,
  open = false,
}: {
  fields: Record<string, unknown>;
  open?: boolean;
}): React.ReactElement {
  // The GeoJSON geometry column is the map, not a field worth reading.
  const entries = Object.entries(fields).filter(([key]) => !key.startsWith("__"));
  return (
    <details open={open} style={{ marginTop: 8 }}>
      <summary style={{ ...panelMuted, cursor: "pointer" }}>All fields ({entries.length})</summary>
      <table style={{ ...fieldsTable, marginTop: 4 }}>
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key}>
              <td style={fieldKey}>{key}</td>
              <td style={fieldValue}>{displayValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
