/**
 * The details panel: one for an event, one for an area.
 *
 * Both end with the record exactly as its source had it, collapsed by
 * default. The interpreted view above it is a guess about unknown columns,
 * and the raw fields are how someone checks the guess.
 */

import React from "react";
import { panelFigures, panelMuted, panelSeparator, panelVar, surface } from "@/components/mapPanel";
import { SEVERITY_COLOURS } from "./eventsLayer";
import { categoryMeta, type CategoryRegistry } from "./categories";
import { MediaPreview } from "./MediaPreview";
import type { MonitorEvent } from "./mockEvents";
import type { MonitorArea } from "./sources/interpret";
import type { MediaRef } from "./sources/media";
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
  select,
} from "./styles";

/** What the category picker needs: the choices, and what "Automatic" would give. */
export interface CategoryChoice {
  registry: CategoryRegistry;
  /** The category chosen for this item by hand, if any. */
  chosen: string | undefined;
  /** The category it gets without that choice: the data's, or a source setting's. */
  automatic: string;
  onChange: (category: string | undefined) => void;
  /** False: the category is shown, not chosen. */
  editable?: boolean;
}

export function EventDetails({
  event,
  now,
  groundHeight,
  demReady,
  categoryChoice,
  onZoom,
  onClose,
}: {
  event: MonitorEvent;
  now: number;
  groundHeight: number | null | "loading";
  demReady: boolean;
  categoryChoice: CategoryChoice;
  onZoom: () => void;
  onClose: () => void;
}): React.ReactElement {
  const category = categoryMeta(categoryChoice.registry, event.category);
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

      <div style={{ font: `600 15px/1.35 ${panelVar.font}`, marginTop: 6 }}>{event.title}</div>
      <div style={panelMuted}>
        {capitalise(relativeTime(event.time, now))}
        {event.time != null && ` · ${absoluteTime(event.time)}`}
      </div>

      {event.summary && <p style={{ margin: "8px 0 4px", lineHeight: 1.5 }}>{event.summary}</p>}

      {event.media && event.media.length > 0 && <MediaSection media={event.media} />}

      {event.metrics.length > 0 && (
        <div style={{ ...metricsGrid, marginTop: 6 }}>
          {event.metrics.map((metric) => (
            <div key={metric.label} style={metricTile}>
              <div style={panelMuted}>{metric.label}</div>
              <div style={{ font: `600 14px/1.3 ${panelVar.font}` }}>{metric.value}</div>
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
        <dt style={panelMuted}>Category</dt>
        <dd style={factValue}>
          <CategoryPicker choice={categoryChoice} />
        </dd>
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
  categoryChoice,
  onZoom,
  onClose,
}: {
  area: MonitorArea;
  categoryChoice: CategoryChoice;
  onZoom: () => void;
  onClose: () => void;
}): React.ReactElement {
  const category = categoryMeta(categoryChoice.registry, area.category);
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
      <div style={{ font: `600 15px/1.35 ${panelVar.font}`, marginTop: 6 }}>{area.name}</div>
      <div style={panelMuted}>Area · {area.source}</div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
        <span style={panelMuted}>Category</span>
        <CategoryPicker choice={categoryChoice} />
      </label>
      {area.media && area.media.length > 0 && <MediaSection media={area.media} />}
      <RawFields fields={area.fields} open />
      <button type="button" style={{ ...actionButton, marginTop: 8 }} onClick={onZoom}>
        Zoom to area
      </button>
    </div>
  );
}

/** Every media item the record references. */
function MediaSection({ media }: { media: MediaRef[] }): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      {media.map((item) => (
        <MediaPreview key={`${item.field}:${item.mediaItemRid}`} media={item} />
      ))}
    </div>
  );
}

/** "Automatic (what it would be)", then every category. */
function CategoryPicker({ choice }: { choice: CategoryChoice }): React.ReactElement {
  const { registry, chosen, automatic, onChange, editable = true } = choice;
  if (!editable) {return <span>{categoryMeta(registry, chosen ?? automatic).label}</span>;}
  return (
    <select
      value={chosen ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
      style={{ ...select, width: "100%" }}
      aria-label="Category"
    >
      <option value="">Automatic ({categoryMeta(registry, automatic).label})</option>
      {registry.order.map((id) => (
        <option key={id} value={id}>
          {registry.byId[id].label}
        </option>
      ))}
    </select>
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
