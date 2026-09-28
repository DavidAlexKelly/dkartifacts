/**
 * Example: an event monitor over the Foundry basemap and elevation.
 *
 * The "events" half of a world-monitor style dashboard: incidents on a globe,
 * grouped into clusters when zoomed out and split apart as you zoom in, with
 * a feed, filters and a details panel.
 *
 * Events come from mock data (./mockEvents), from Foundry sources, or both:
 *
 *   datasets     a table read once — ACLED-style exports, incident logs
 *   media sets   a GeoJSON, JSON or CSV item — zones, curated incident files
 *   streams      read on open, then polled — a live feed
 *
 * Each source's columns are unknown in advance, so ./sources/interpret.ts
 * decides what they mean (location, title, category, severity, time, …) and
 * the sources panel shows what it decided. Records located by a point become
 * events; records located by a shape become areas, drawn under the events.
 * Sources come from the URL (`?dataset=…&mediaset=rid::path&stream=…`) or
 * from the panel, which this browser remembers.
 *
 * Three extensions on one stock basemap:
 *
 *   elevation()         terrain and hillshade; the same DEM answers "how
 *                       high is it here" in the details panel.
 *   areasExtension()    shapes from the sources, under the labels.
 *   eventsExtension()   a clustered GeoJSON source on top of everything.
 *
 * Interaction:
 *
 *   - click a cluster  → zoom to the level where it splits
 *   - hover a cluster  → what is in it, by category
 *   - click an event   → details; "Zoom to event" flies in with pitch
 *   - click an area    → its fields
 *   - click the map    → clear the selection
 *
 * Filters replace the sources' data rather than hiding layers, so clusters
 * re-form from what is left. The terrain and globe switches rebuild the map
 * (a MapLibre style is assembled once); the current view is carried across.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import { describeBasemapError } from "@acc/decho-basemap";
import { DechoBasemap } from "@acc/decho-basemap/react";
import { elevation } from "@acc/decho-elevation/extension";
import type { DemSourceHandle } from "@acc/decho-elevation";
import {
  panelCheckbox,
  panelFigures,
  panelHeading,
  panelMuted,
  panelSeparator,
  panelToggle,
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
  AREA_LAYERS,
  areaSelectionFilter,
  areasExtension,
  setAreaData,
} from "./areasLayer";
import {
  SEVERITIES,
  generateEvents,
  sortNewestFirst,
  type EventCategory,
  type MonitorEvent,
  type Severity,
} from "./mockEvents";
import { capitalise, relativeTime } from "./format";
import { AreaDetails, EventDetails } from "./Details";
import { SourcesSection } from "./SourcesSection";
import {
  dedupe,
  loadSavedSources,
  saveSources,
  sourceKey,
  sourcesFromSearch,
  type SourceConfig,
} from "./sources/config";
import { boundsOf, shapeBounds, type Bounds } from "./sources/geo";
import type { MonitorArea } from "./sources/interpret";
import { useEventSources } from "./sources/useEventSources";
import {
  actionButton,
  dot,
  errorStyle,
  feed,
  feedRow,
  feedTitle,
  hoverCard,
  legend,
  legendItem,
  liveBadge,
  mockBadge,
  sectionLabel,
  segment,
  segmented,
  sidePanel,
  sidePanelContent,
} from "./styles";

const BASEMAP_RID = "ri.foundry.main.dataset.c7e99de1-90a4-4e22-bd26-b42316d70fe4";
const ASSETS_RID = "ri.foundry.main.dataset.8637f7a1-7503-459c-82c9-78e6ffa94e6e";

/** Europe and the Middle East in view, the rest of the globe a drag away. */
const SPAWN = { lat: 38, lon: 25, zoom: 2.3 };

const DAY = 24 * 60 * 60 * 1000;

const WINDOWS: Array<{ label: string; ms: number | null }> = [
  { label: "24 h", ms: DAY },
  { label: "7 d", ms: 7 * DAY },
  { label: "30 d", ms: 30 * DAY },
  { label: "All", ms: null },
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

type Selection = { kind: "event"; id: string } | { kind: "area"; id: string } | null;

function EventsPage(): React.ReactElement {
  // One timestamp for the page's life: the mock data is placed relative to it
  // and "3 h ago" is measured from it, so the two cannot disagree.
  const [now] = useState(() => Date.now());
  const mockEvents = useMemo(() => generateEvents({ now }), [now]);

  // ── Sources ────────────────────────────────────────────────────────────────
  const [urlSources] = useState(() => sourcesFromSearch(window.location.search));
  const fromUrl = urlSources.length > 0;
  const [configs, setConfigs] = useState<SourceConfig[]>(() =>
    fromUrl ? urlSources : loadSavedSources(),
  );
  useEffect(() => {
    if (!fromUrl) {saveSources(configs);}
  }, [configs, fromUrl]);
  // Mock data by default only when there is nothing real to show.
  const [mock, setMock] = useState(() => configs.length === 0);
  const { states, reload } = useEventSources(configs, now);

  const events = useMemo(
    () => sortNewestFirst([...(mock ? mockEvents : []), ...states.flatMap((s) => s.events)]),
    [mock, mockEvents, states],
  );
  const areas = useMemo(() => states.flatMap((s) => s.areas), [states]);
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const areasById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<Set<EventCategory>>(
    () => new Set(CATEGORY_ORDER),
  );
  const [minSeverity, setMinSeverity] = useState<Severity>("low");
  // Real data is rarely all from the last week; mock data is.
  const [windowMs, setWindowMs] = useState<number | null>(() =>
    configs.length > 0 ? null : 7 * DAY,
  );

  const [terrain, setTerrain] = useState(true);
  const [globe, setGlobe] = useState(true);

  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [dem, setDem] = useState<DemSourceHandle | null>(null);
  const [zoom, setZoom] = useState(SPAWN.zoom);
  const [selection, setSelection] = useState<Selection>(null);
  const [hover, setHover] = useState<ClusterHover | null>(null);
  const [groundHeight, setGroundHeight] = useState<number | null | "loading">(null);

  const visible = useMemo(
    () => filterEvents(events, { categories, minSeverity, windowMs, now }),
    [events, categories, minSeverity, windowMs, now],
  );
  const visibleAreas = useMemo(
    () => areas.filter((area) => categories.has(area.category)),
    [areas, categories],
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
  // "Other" only appears once a source has produced some.
  const shownCategories = CATEGORY_ORDER.filter(
    (category) => category !== "other" || (categoryCounts.get("other") ?? 0) > 0 || areas.some((a) => a.category === "other"),
  );

  const selectedEvent = selection?.kind === "event" ? eventsById.get(selection.id) ?? null : null;
  const selectedArea = selection?.kind === "area" ? areasById.get(selection.id) ?? null : null;

  // Read at the moment a map is (re)built: the extensions are seeded with the
  // current data and the camera with the current view.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const areasRef = useRef(visibleAreas);
  areasRef.current = visibleAreas;
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
      areasExtension(areasRef.current),
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

  // Data → map.
  useEffect(() => {
    if (map) {setEventData(map, visible);}
  }, [map, visible]);
  useEffect(() => {
    if (map) {setAreaData(map, visibleAreas);}
  }, [map, visibleAreas]);

  // Selection → rings.
  useEffect(() => {
    if (!map) {return;}
    const eventId = selection?.kind === "event" ? selection.id : null;
    const areaId = selection?.kind === "area" ? selection.id : null;
    if (map.getLayer(EVENT_LAYERS.selected)) {
      map.setFilter(EVENT_LAYERS.selected, selectionFilter(eventId) as maplibregl.FilterSpecification);
    }
    if (map.getLayer(AREA_LAYERS.selected)) {
      map.setFilter(AREA_LAYERS.selected, areaSelectionFilter(areaId) as maplibregl.FilterSpecification);
    }
  }, [map, selection]);

  // A selection the filters (or a removed source) have since hidden is
  // dropped, not left pointing at something the map no longer shows.
  useEffect(() => {
    if (selection?.kind === "event" && !visible.some((event) => event.id === selection.id)) {
      setSelection(null);
    }
    if (selection?.kind === "area" && !visibleAreas.some((area) => area.id === selection.id)) {
      setSelection(null);
    }
  }, [visible, visibleAreas, selection]);

  // Ground height under the selected event, from the same DEM as the relief.
  useEffect(() => {
    if (!selectedEvent || !dem) {
      setGroundHeight(null);
      return;
    }
    let cancelled = false;
    setGroundHeight("loading");
    dem
      .heightAt(selectedEvent.lon, selectedEvent.lat)
      .then((height) => {
        if (!cancelled) {setGroundHeight(Number.isFinite(height) ? height : null);}
      })
      .catch(() => {
        if (!cancelled) {setGroundHeight(null);}
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEvent, dem]);

  // Map interaction. Registered per map instance and removed with it.
  useEffect(() => {
    if (!map) {return;}
    const eventLayers = [EVENT_LAYERS.cluster, EVENT_LAYERS.point];
    const areaLayers = [AREA_LAYERS.fill, AREA_LAYERS.line];

    // One handler rather than one per layer, so an event drawn over an area
    // wins the click instead of both firing.
    const onClick = (event: maplibregl.MapMouseEvent) => {
      const [hit] = map.queryRenderedFeatures(event.point, { layers: eventLayers });
      if (hit?.layer.id === EVENT_LAYERS.cluster && hit.geometry.type === "Point") {
        const center = hit.geometry.coordinates as [number, number];
        const source = map.getSource(EVENTS_SOURCE) as unknown as EventsSource | undefined;
        void source
          ?.getClusterExpansionZoom(Number(hit.properties?.cluster_id))
          .then((expansion) => {
            // A little past the split, so the children land clear of each other.
            map.easeTo({ center, zoom: Math.min(expansion + 0.3, 18), duration: 700 });
          })
          .catch(() => undefined);
        return;
      }
      if (hit?.layer.id === EVENT_LAYERS.point && typeof hit.properties?.id === "string") {
        setSelection({ kind: "event", id: hit.properties.id });
        return;
      }
      const [area] = map.queryRenderedFeatures(event.point, { layers: areaLayers });
      if (area && typeof area.properties?.id === "string") {
        setSelection({ kind: "area", id: area.properties.id });
        return;
      }
      setSelection(null);
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

    const onMouseMove = (event: maplibregl.MapMouseEvent) => {
      const interactive = map.queryRenderedFeatures(event.point, {
        layers: [...eventLayers, ...areaLayers],
      });
      map.getCanvas().style.cursor = interactive.length > 0 ? "pointer" : "";
    };

    const onMoveEnd = () => {
      const center = map.getCenter();
      viewRef.current = { lat: center.lat, lon: center.lng, zoom: map.getZoom() };
      setZoom(map.getZoom());
    };
    // The hover card is positioned in screen space; any camera move makes it
    // point at the wrong place.
    const onMoveStart = () => setHover(null);

    map.on("click", onClick);
    map.on("mousemove", onMouseMove);
    map.on("mousemove", EVENT_LAYERS.cluster, onClusterMove);
    map.on("mouseleave", EVENT_LAYERS.cluster, onClusterLeave);
    map.on("movestart", onMoveStart);
    map.on("moveend", onMoveEnd);

    return () => {
      map.off("click", onClick);
      map.off("mousemove", onMouseMove);
      map.off("mousemove", EVENT_LAYERS.cluster, onClusterMove);
      map.off("mouseleave", EVENT_LAYERS.cluster, onClusterLeave);
      map.off("movestart", onMoveStart);
      map.off("moveend", onMoveEnd);
    };
  }, [map]);

  const flyTo = (event: MonitorEvent) => {
    setSelection({ kind: "event", id: event.id });
    map?.flyTo({
      center: [event.lon, event.lat],
      zoom: EVENT_ZOOM,
      pitch: terrain ? 55 : 0,
      bearing: 0,
      duration: 2200,
      essential: true,
    });
  };

  const fit = (bounds: Bounds | null, maxZoom = 13) => {
    if (bounds) {map?.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 320, right: 360 }, maxZoom, duration: 1400 });}
  };

  const zoomToArea = (area: MonitorArea) => fit(shapeBounds(area.geometry));

  const fitToData = () => {
    const points: Array<[number, number]> = visible.map((e) => [e.lon, e.lat]);
    for (const area of visibleAreas) {
      const bounds = shapeBounds(area.geometry);
      if (bounds) {points.push(...bounds);}
    }
    fit(boundsOf(points), 10);
  };

  const resetView = () => {
    setSelection(null);
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

  const addSource = (config: SourceConfig) => {
    setConfigs((previous) => dedupe([...previous, config]));
    // Real data is rarely inside the mock's week.
    setWindowMs(null);
  };
  const removeSource = (key: string) =>
    setConfigs((previous) => previous.filter((config) => sourceKey(config) !== key));
  const setTitleField = (key: string, titleField: string | undefined) =>
    setConfigs((previous) =>
      previous.map((config) =>
        sourceKey(config) === key ? { ...config, titleField } : config,
      ),
    );

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

      {/* ── Filters, sources and feed ────────────────────────────────────── */}
      <div style={sidePanel}>
        <div style={sidePanelContent}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={panelHeading}>Event monitor</span>
            {mock && <span style={mockBadge}>MOCK DATA</span>}
          </div>
          <div style={panelFigures}>
            {visible.length.toLocaleString("en-GB")} of {events.length.toLocaleString("en-GB")} events
            {visibleAreas.length > 0 && ` · ${visibleAreas.length} areas`}
            {critical > 0 && (
              <span style={{ color: SEVERITY_COLOURS.critical }}> · {critical} critical</span>
            )}
          </div>

          <div style={panelSeparator} />

          <SourcesSection
            states={states}
            mock={mock}
            onMockChange={setMock}
            onAdd={addSource}
            onRemove={removeSource}
            onReload={reload}
          onTitleChange={setTitleField}
            fromUrl={fromUrl}
          />

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
          {shownCategories.map((category) => (
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
                style={feedRow(selection?.kind === "event" && event.id === selection.id)}
                onClick={() => flyTo(event)}
                title={event.title}
              >
                <span style={{ ...dot(CATEGORIES[event.category].colour), marginTop: 5 }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={feedTitle}>{event.title}</span>
                  <span style={panelMuted}>
                    {event.country || event.place || event.source} · {relativeTime(event.time, now)}
                    {event.severity === "critical" || event.severity === "high" ? (
                      <span style={{ color: SEVERITY_COLOURS[event.severity] }}>
                        {" "}
                        · {event.severity}
                      </span>
                    ) : null}
                  </span>
                </span>
                {event.live && <span style={{ ...liveBadge, marginTop: 3 }}>LIVE</span>}
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
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button type="button" style={{ ...actionButton, flex: 1 }} onClick={fitToData}>
              Fit to data
            </button>
            <button type="button" style={{ ...actionButton, flex: 1 }} onClick={resetView}>
              Reset view
            </button>
          </div>
        </div>
      </div>

      {/* ── Cluster hover ────────────────────────────────────────────────── */}
      {hover && (
        <div style={{ ...hoverCard, left: hover.x + 16, top: hover.y + 16 }}>
          <div style={panelHeading}>{hover.count} events — click to expand</div>
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
      {selectedEvent && (
        <EventDetails
          event={selectedEvent}
          now={now}
          groundHeight={groundHeight}
          demReady={dem != null}
          onZoom={() => flyTo(selectedEvent)}
          onClose={() => setSelection(null)}
        />
      )}
      {selectedArea && (
        <AreaDetails
          area={selectedArea}
          onZoom={() => zoomToArea(selectedArea)}
          onClose={() => setSelection(null)}
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

export default EventsPage;
