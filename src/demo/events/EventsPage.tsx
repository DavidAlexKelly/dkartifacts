/**
 * Example: an event monitor over the Foundry basemap and elevation.
 *
 * The "events" half of a world-monitor style dashboard: incidents on a globe,
 * grouped into clusters when zoomed out and split apart as you zoom in, with
 * a feed, filters and a details panel. The data is mock (./mockEvents); the
 * map is not — basemap tiles and DEM come from Foundry exactly as on the
 * other pages.
 *
 * Two extensions on one stock basemap:
 *
 *   elevation()        terrain and hillshade, so zooming into an event in
 *                      mountains shows the ground it happened on, and the
 *                      same DEM answers "how high is it here" in the panel.
 *   eventsExtension()  a clustered GeoJSON source and its layers (./eventsLayer).
 *
 * Interaction:
 *
 *   - click a cluster  → zoom to the level where it splits
 *   - hover a cluster  → what is in it, by category
 *   - click an event   → details panel; "Zoom to event" flies in with pitch
 *   - click the map    → clear the selection
 *
 * Filters replace the source's data rather than hiding layers, so clusters
 * re-form from what is left (see eventsLayer.ts). The terrain and globe
 * switches rebuild the map — a MapLibre style is assembled once — and the
 * current view is carried across so the rebuild does not throw you back to
 * the spawn point.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import { describeBasemapError } from "@acc/decho-basemap";
import { DechoBasemap } from "@acc/decho-basemap/react";
import { elevation } from "@acc/decho-elevation/extension";
import type { DemSourceHandle } from "@acc/decho-elevation";
import {
  errorPanel,
  mapPanel,
  panelCheckbox,
  panelFigures,
  panelHeading,
  panelMuted,
  panelSeparator,
  panelToggle,
  surface,
} from "@/components/mapPanel";
import {
  CATEGORIES,
  CATEGORY_ORDER,
  CLUSTER_STEPS,
  EVENT_LAYERS,
  EVENTS_SOURCE,
  SEVERITY_COLOURS,
  clusterBreakdown,
  eventsExtension,
  filterEvents,
  selectionFilter,
  setEventData,
  type EventsSource,
} from "./eventsLayer";
import {
  SEVERITIES,
  generateEvents,
  type EventCategory,
  type MonitorEvent,
  type Severity,
} from "./mockEvents";
import { capitalise, relativeTime } from "./format";

const BASEMAP_RID = "ri.foundry.main.dataset.c7e99de1-90a4-4e22-bd26-b42316d70fe4";
const ASSETS_RID = "ri.foundry.main.dataset.8637f7a1-7503-459c-82c9-78e6ffa94e6e";

/** Europe and the Middle East in view, the rest of the globe a drag away. */
const SPAWN = { lat: 38, lon: 25, zoom: 2.3 };

const DAY = 24 * 60 * 60 * 1000;

const WINDOWS: Array<{ label: string; ms: number | null }> = [
  { label: "24 h", ms: DAY },
  { label: "7 d", ms: 7 * DAY },
  { label: "30 d", ms: null },
];

/** How far "Zoom to event" goes: past the cluster limit, into the relief. */
const EVENT_ZOOM = 12;

interface View {
  lat: number;
  lon: number;
  zoom: number;
}

interface ClusterHover {
  x: number;
  y: number;
  count: number;
  breakdown: Array<{ category: EventCategory; count: number }>;
}

function EventsPage(): React.ReactElement {
  // One timestamp for the page's life: the mock data is placed relative to it
  // and "3 h ago" is measured from it, so the two cannot disagree.
  const [now] = useState(() => Date.now());
  const events = useMemo(() => generateEvents({ now }), [now]);
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const [categories, setCategories] = useState<Set<EventCategory>>(
    () => new Set(CATEGORY_ORDER),
  );
  const [minSeverity, setMinSeverity] = useState<Severity>("low");
  const [windowMs, setWindowMs] = useState<number | null>(7 * DAY);

  const [terrain, setTerrain] = useState(true);
  const [globe, setGlobe] = useState(true);

  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [dem, setDem] = useState<DemSourceHandle | null>(null);
  const [zoom, setZoom] = useState(SPAWN.zoom);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<ClusterHover | null>(null);
  const [groundHeight, setGroundHeight] = useState<number | null | "loading">(null);

  const visible = useMemo(
    () => filterEvents(events, { categories, minSeverity, windowMs, now }),
    [events, categories, minSeverity, windowMs, now],
  );
  // Counts beside each category ignore the category filter itself, so turning
  // a category off does not make its own count read zero.
  const categoryCounts = useMemo(() => {
    const counts = new Map<EventCategory, number>();
    for (const event of filterEvents(events, {
      categories: new Set(CATEGORY_ORDER),
      minSeverity,
      windowMs,
      now,
    })) {
      counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
    }
    return counts;
  }, [events, minSeverity, windowMs, now]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  // Read at the moment a map is (re)built: the extension is seeded with the
  // current filter and the camera with the current view.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const viewRef = useRef<View>(SPAWN);

  const signature = `${terrain}-${globe}`;
  const extensions = useMemo(
    () => [
      elevation({
        terrain: terrain ? { exaggeration: 1.5 } : false,
        hillshade: true,
        sky: terrain,
        onReady: setDem,
      }),
      eventsExtension(visibleRef.current),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const spawn = useMemo(() => viewRef.current, [signature]);

  const onMapReady = (instance: maplibregl.Map) => {
    setMap(instance);
    setZoom(instance.getZoom());
  };

  // A rebuilt map means a new DEM source; the old one is disposed with it.
  useEffect(() => {
    setDem(null);
    setMap(null);
    setHover(null);
  }, [signature]);

  // Filters → data.
  useEffect(() => {
    if (map) {setEventData(map, visible);}
  }, [map, visible]);

  // Selection → ring.
  useEffect(() => {
    if (map?.getLayer(EVENT_LAYERS.selected)) {
      map.setFilter(
        EVENT_LAYERS.selected,
        selectionFilter(selectedId) as maplibregl.FilterSpecification,
      );
    }
  }, [map, selectedId]);

  // A selection that the filters have since hidden is dropped, not left
  // pointing at an event the map no longer shows.
  useEffect(() => {
    if (selectedId && !visible.some((event) => event.id === selectedId)) {
      setSelectedId(null);
    }
  }, [visible, selectedId]);

  // Ground height under the selected event, from the same DEM as the relief.
  useEffect(() => {
    if (!selected || !dem) {
      setGroundHeight(null);
      return;
    }
    let cancelled = false;
    setGroundHeight("loading");
    dem
      .heightAt(selected.lon, selected.lat)
      .then((height) => {
        if (!cancelled) {setGroundHeight(Number.isFinite(height) ? height : null);}
      })
      .catch(() => {
        if (!cancelled) {setGroundHeight(null);}
      });
    return () => {
      cancelled = true;
    };
  }, [selected, dem]);

  // Map interaction. Registered per map instance and removed with it.
  useEffect(() => {
    if (!map) {return;}
    const clickable = [EVENT_LAYERS.cluster, EVENT_LAYERS.point];

    const onClusterClick = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") {return;}
      const clusterId = Number(feature.properties?.cluster_id);
      const center = feature.geometry.coordinates as [number, number];
      const source = map.getSource(EVENTS_SOURCE) as unknown as EventsSource | undefined;
      void source
        ?.getClusterExpansionZoom(clusterId)
        .then((expansion) => {
          // A little past the split, so the children land clear of each other.
          map.easeTo({ center, zoom: Math.min(expansion + 0.3, 18), duration: 700 });
        })
        .catch(() => undefined);
    };

    const onPointClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === "string") {setSelectedId(id);}
    };

    const onMapClick = (event: maplibregl.MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(event.point, { layers: clickable });
      if (hits.length === 0) {setSelectedId(null);}
    };

    const onClusterMove = (event: maplibregl.MapLayerMouseEvent) => {
      const properties = event.features?.[0]?.properties;
      if (!properties) {return;}
      setHover({
        x: event.point.x,
        y: event.point.y,
        count: Number(properties.point_count),
        breakdown: clusterBreakdown(properties),
      });
    };
    const onClusterLeave = () => setHover(null);

    const pointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const unpointer = () => {
      map.getCanvas().style.cursor = "";
    };

    const onMoveEnd = () => {
      const center = map.getCenter();
      viewRef.current = { lat: center.lat, lon: center.lng, zoom: map.getZoom() };
      setZoom(map.getZoom());
    };
    // The hover card is positioned in screen space; any camera move makes it
    // point at the wrong place.
    const onMoveStart = () => setHover(null);

    map.on("click", EVENT_LAYERS.cluster, onClusterClick);
    map.on("click", EVENT_LAYERS.point, onPointClick);
    map.on("click", onMapClick);
    map.on("mousemove", EVENT_LAYERS.cluster, onClusterMove);
    map.on("mouseleave", EVENT_LAYERS.cluster, onClusterLeave);
    for (const layer of clickable) {
      map.on("mouseenter", layer, pointer);
      map.on("mouseleave", layer, unpointer);
    }
    map.on("movestart", onMoveStart);
    map.on("moveend", onMoveEnd);

    return () => {
      map.off("click", EVENT_LAYERS.cluster, onClusterClick);
      map.off("click", EVENT_LAYERS.point, onPointClick);
      map.off("click", onMapClick);
      map.off("mousemove", EVENT_LAYERS.cluster, onClusterMove);
      map.off("mouseleave", EVENT_LAYERS.cluster, onClusterLeave);
      for (const layer of clickable) {
        map.off("mouseenter", layer, pointer);
        map.off("mouseleave", layer, unpointer);
      }
      map.off("movestart", onMoveStart);
      map.off("moveend", onMoveEnd);
    };
  }, [map]);

  const flyTo = (event: MonitorEvent) => {
    setSelectedId(event.id);
    map?.flyTo({
      center: [event.lon, event.lat],
      zoom: EVENT_ZOOM,
      pitch: terrain ? 55 : 0,
      bearing: 0,
      duration: 2200,
      essential: true,
    });
  };

  const resetView = () => {
    setSelectedId(null);
    map?.flyTo({
      center: [SPAWN.lon, SPAWN.lat],
      zoom: SPAWN.zoom,
      pitch: 0,
      bearing: 0,
      duration: 1600,
    });
  };

  const toggleCategory = (category: EventCategory) => {
    setCategories((previous) => {
      const next = new Set(previous);
      if (next.has(category)) {next.delete(category);}
      else {next.add(category);}
      return next;
    });
  };

  const critical = visible.filter((event) => event.severity === "critical").length;

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <DechoBasemap
        key={signature}
        rid={BASEMAP_RID}
        assetsRid={ASSETS_RID}
        spritePath="sprites/light"
        spawnLat={spawn.lat}
        spawnLong={spawn.lon}
        spawnZoom={spawn.zoom}
        globe={globe}
        extensions={extensions}
        onMapReady={onMapReady}
        style={{ height: "100%" }}
        renderError={(err) => {
          const { title, detail, remediation, rid, path } = describeBasemapError(err);
          return (
            <div style={errorStyle}>
              <strong>{title}</strong>
              <div>{detail}</div>
              {remediation && <div style={{ marginTop: 8 }}>{remediation}</div>}
              {rid && (
                <div style={{ marginTop: 8, opacity: 0.75 }}>
                  {rid}
                  {path ? ` · ${path}` : ""}
                </div>
              )}
            </div>
          );
        }}
      />

      {/* ── Filters and feed ─────────────────────────────────────────────── */}
      <div style={sidePanel}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={panelHeading}>Event monitor</span>
          <span style={mockBadge}>MOCK DATA</span>
        </div>
        <div style={panelFigures}>
          {visible.length} of {events.length} events
          {critical > 0 && (
            <span style={{ color: SEVERITY_COLOURS.critical }}> · {critical} critical</span>
          )}
        </div>

        <div style={panelSeparator} />

        <div style={sectionLabel}>Time window</div>
        <div style={segmented}>
          {WINDOWS.map((option) => (
            <button
              key={option.label}
              type="button"
              style={segment(windowMs === option.ms)}
              aria-pressed={windowMs === option.ms}
              onClick={() => setWindowMs(option.ms)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div style={sectionLabel}>Minimum severity</div>
        <div style={segmented}>
          {SEVERITIES.map((severity) => (
            <button
              key={severity}
              type="button"
              style={segment(minSeverity === severity, SEVERITY_COLOURS[severity])}
              aria-pressed={minSeverity === severity}
              onClick={() => setMinSeverity(severity)}
            >
              {capitalise(severity)}
            </button>
          ))}
        </div>

        <div style={sectionLabel}>Categories</div>
        {CATEGORY_ORDER.map((category) => (
          <label key={category} style={{ ...panelToggle, justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={categories.has(category)}
                onChange={() => toggleCategory(category)}
                style={panelCheckbox}
              />
              <span style={dot(CATEGORIES[category].colour)} />
              {CATEGORIES[category].label}
            </span>
            <span style={panelFigures}>{categoryCounts.get(category) ?? 0}</span>
          </label>
        ))}

        <div style={panelSeparator} />

        <div style={sectionLabel}>Latest</div>
        <div style={feed}>
          {visible.length === 0 && <div style={panelMuted}>Nothing matches the filters.</div>}
          {visible.slice(0, 40).map((event) => (
            <button
              key={event.id}
              type="button"
              style={feedRow(event.id === selectedId)}
              onClick={() => flyTo(event)}
              title={event.title}
            >
              <span style={{ ...dot(CATEGORIES[event.category].colour), marginTop: 5 }} />
              <span style={{ minWidth: 0 }}>
                <span style={feedTitle}>{event.title}</span>
                <span style={panelMuted}>
                  {event.country} · {relativeTime(event.time, now)}
                  {event.severity === "critical" || event.severity === "high" ? (
                    <span style={{ color: SEVERITY_COLOURS[event.severity] }}>
                      {" "}
                      · {event.severity}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div style={panelSeparator} />

        <Toggle label="3D terrain" value={terrain} onChange={setTerrain} />
        <Toggle label="Globe" value={globe} onChange={setGlobe} />
        <div style={panelMuted}>
          {dem && zoom < dem.minZoom
            ? `Relief from z${dem.minZoom} · now z${zoom.toFixed(1)}`
            : `z${zoom.toFixed(1)}`}
        </div>
        <button type="button" style={{ ...actionButton, marginTop: 4 }} onClick={resetView}>
          Reset view
        </button>
      </div>

      {/* ── Cluster hover ────────────────────────────────────────────────── */}
      {hover && (
        <div style={{ ...hoverCard, left: hover.x + 16, top: hover.y + 16 }}>
          <div style={panelHeading}>
            {hover.count} events — click to expand
          </div>
          {hover.breakdown.map(({ category, count }) => (
            <div key={category} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={dot(CATEGORIES[category].colour)} />
              <span style={{ flex: 1 }}>{CATEGORIES[category].label}</span>
              <span style={panelFigures}>{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Details ──────────────────────────────────────────────────────── */}
      {selected && (
        <EventDetails
          event={selected}
          now={now}
          groundHeight={groundHeight}
          demReady={dem != null}
          onZoom={() => flyTo(selected)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div style={legend}>
        <span style={panelMuted}>Clusters</span>
        {CLUSTER_STEPS.map((step, index) => {
          const next = CLUSTER_STEPS[index + 1];
          return (
            <span key={step.from} style={legendItem}>
              <span style={dot(step.colour, 10)} />
              {next ? `${Math.max(2, step.from)}–${next.from - 1}` : `${step.from}+`}
            </span>
          );
        })}
        <span style={legendItem}>
          <span style={{ ...dot("transparent", 10), boxShadow: `0 0 0 2px ${SEVERITY_COLOURS.critical}` }} />
          contains critical
        </span>
        <span style={panelMuted}>· Events: colour = category, size = severity</span>
      </div>
    </div>
  );
}

function EventDetails({
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
  return (
    <div style={detailsPanel} role="dialog" aria-label={event.title}>
      <div style={{ ...detailsStripe, background: category.colour }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={chip(category.colour)}>{category.label}</span>
        <span style={chip(SEVERITY_COLOURS[event.severity])}>{capitalise(event.severity)}</span>
        <button type="button" style={closeButton} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div style={{ font: "600 15px/1.35 sans-serif", marginTop: 6 }}>{event.title}</div>
      <div style={panelMuted}>
        {relativeTime(event.time, now)} · {new Date(event.time).toUTCString().slice(5, 22)} UTC
      </div>

      <p style={{ margin: "8px 0 4px", lineHeight: 1.5 }}>{event.summary}</p>

      <div style={metricsGrid}>
        {event.metrics.map((metric) => (
          <div key={metric.label} style={metricTile}>
            <div style={panelMuted}>{metric.label}</div>
            <div style={{ font: "600 14px/1.3 sans-serif" }}>{metric.value}</div>
          </div>
        ))}
      </div>

      <div style={panelSeparator} />

      <dl style={facts}>
        <dt style={panelMuted}>Location</dt>
        <dd style={factValue}>
          {event.place}, {event.country}
        </dd>
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
        <dd style={{ ...factValue, ...panelFigures }}>{event.id}</dd>
      </dl>

      <button type="button" style={{ ...actionButton, marginTop: 8 }} onClick={onZoom}>
        Zoom to event
      </button>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}): React.ReactElement {
  return (
    <label style={panelToggle}>
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        style={panelCheckbox}
      />
      {label}
    </label>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const sidePanel: React.CSSProperties = {
  ...mapPanel,
  top: 12,
  left: 12,
  bottom: 12,
  width: 280,
  overflowY: "auto",
};

const sectionLabel: React.CSSProperties = {
  ...panelMuted,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  fontSize: 10,
  marginTop: 6,
};

const mockBadge: React.CSSProperties = {
  font: "600 9px/1 sans-serif",
  letterSpacing: 0.6,
  padding: "3px 5px",
  borderRadius: 4,
  border: `1px solid ${surface.border}`,
  color: surface.muted,
};

const segmented: React.CSSProperties = {
  display: "flex",
  gap: 4,
};

function segment(active: boolean, colour?: string): React.CSSProperties {
  return {
    flex: 1,
    padding: "4px 0",
    borderRadius: 5,
    border: `1px solid ${active ? colour ?? surface.accent : surface.border}`,
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    color: active ? surface.text : surface.muted,
    font: "11px/1.4 sans-serif",
    cursor: "pointer",
  };
}

function dot(colour: string, size = 8): React.CSSProperties {
  return {
    display: "inline-block",
    flex: "none",
    width: size,
    height: size,
    borderRadius: "50%",
    background: colour,
    boxShadow: "0 0 0 1px rgba(255,255,255,0.5)",
  };
}

const feed: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  maxHeight: 260,
  overflowY: "auto",
  margin: "0 -6px",
};

function feedRow(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    textAlign: "left",
    padding: "5px 6px",
    borderRadius: 5,
    border: "none",
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    color: surface.text,
    cursor: "pointer",
    font: "12px/1.4 sans-serif",
  };
}

const feedTitle: React.CSSProperties = {
  display: "block",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const actionButton: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: `1px solid ${surface.border}`,
  background: "rgba(255,255,255,0.08)",
  color: surface.text,
  font: "12px/1.4 sans-serif",
  cursor: "pointer",
};

const hoverCard: React.CSSProperties = {
  ...mapPanel,
  pointerEvents: "none",
  minWidth: 200,
  zIndex: 3,
};

const detailsPanel: React.CSSProperties = {
  ...mapPanel,
  top: 12,
  right: 12,
  width: 330,
  maxHeight: "calc(100% - 24px)",
  overflowY: "auto",
  paddingTop: 14,
};

const detailsStripe: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: 4,
  borderRadius: "8px 8px 0 0",
};

function chip(colour: string): React.CSSProperties {
  return {
    padding: "2px 7px",
    borderRadius: 10,
    border: `1px solid ${colour}`,
    color: colour,
    font: "600 10px/1.5 sans-serif",
    letterSpacing: 0.3,
  };
}

const closeButton: React.CSSProperties = {
  marginLeft: "auto",
  border: "none",
  background: "transparent",
  color: surface.muted,
  font: "18px/1 sans-serif",
  cursor: "pointer",
  padding: 2,
};

const metricsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 6,
};

const metricTile: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  background: "rgba(255,255,255,0.06)",
};

const facts: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  columnGap: 12,
  rowGap: 3,
  margin: 0,
};

const factValue: React.CSSProperties = { margin: 0 };

const legend: React.CSSProperties = {
  ...mapPanel,
  bottom: 12,
  left: 304,
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
  padding: "6px 10px",
};

const legendItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
};

const errorStyle: React.CSSProperties = {
  ...errorPanel,
  top: 12,
  left: 304,
  zIndex: 3,
};

export default EventsPage;
