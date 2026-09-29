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
 * Sources come from Workshop's string-list variables when embedded (see
 * src/workshopConfig.ts), the URL (`?dataset=…&mediaset=rid::path&stream=…`),
 * or the panel.
 *
 * Categories are the built-ins plus any a module adds through the
 * event-monitor-categories variable (./categories.ts), and anything can be
 * put into any of them by hand — a whole source, one value of its category
 * column, or a single event (./categoryOverrides.ts). A column of media item
 * references is previewed in the details panel (./MediaPreview.tsx).
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
import maplibregl from "maplibre-gl";
import { describeBasemapError } from "@acc/decho-basemap";
import { DechoBasemap } from "@acc/decho-basemap/react";
import { elevation } from "@acc/decho-elevation/extension";
import type { DemSourceHandle } from "@acc/decho-elevation";
import { isInsideIframe } from "@osdk/workshop-iframe-custom-widget";
import {
  panelCheckbox,
  panelFigures,
  panelHeading,
  panelMuted,
  panelSeparator,
  panelToggle,
} from "@/components/mapPanel";
import {
  CLUSTER_STEPS,
  EVENT_LAYERS,
  EVENTS_SOURCE,
  SEVERITY_COLOURS,
  clusterBreakdown,
  eventsExtension,
  filterEvents,
  selectionFilter,
  setCategoryColours,
  setEventData,
  type EventsSource,
} from "./eventsLayer";
import { buildRegistry, categoryMeta } from "./categories";
import {
  NO_OVERRIDES,
  applyOverrides,
  loadOverrides,
  overriddenCategory,
  saveOverrides,
  withOverride,
  type CategoryOverrides,
} from "./categoryOverrides";
import {
  AREA_LAYERS,
  areaSelectionFilter,
  areasExtension,
  setAreaCategoryColours,
  setAreaData,
} from "./areasLayer";
import {
  SEVERITIES,
  generateEvents,
  primaryKey,
  severityRank,
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
  loadSavedTitles,
  saveSources,
  saveTitles,
  sourceKey,
  sourcesFromSearch,
  type SourceConfig,
} from "./sources/config";
import { boundsOf, shapeBounds, type Bounds } from "./sources/geo";
import type { MonitorArea } from "./sources/interpret";
import { useEventSources } from "./sources/useEventSources";
import {
  useWorkshopEventAppearance,
  useWorkshopEventCategories,
  useWorkshopEventSources,
  useWorkshopSelectedEvent,
} from "@/workshopConfig";
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
  settingsButton,
  settingsPanel,
  sidePanelContent,
  statusChip,
  toolbar,
} from "./styles";

const BASEMAP_RID = "ri.foundry.main.dataset.c7e99de1-90a4-4e22-bd26-b42316d70fe4";
const ASSETS_RID = "ri.foundry.main.dataset.8637f7a1-7503-459c-82c9-78e6ffa94e6e";

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
  /** Null while the cluster's events are being fetched. */
  breakdown: Array<{ category: EventCategory; count: number }> | null;
}

/** How many of a cluster's events the hover card counts by category. */
const HOVER_LEAF_LIMIT = 2000;

type Selection = { kind: "event"; id: string } | { kind: "area"; id: string } | null;

function EventsPage(): React.ReactElement {
  // One timestamp for the page's life: the mock data is placed relative to it
  // and "3 h ago" is measured from it, so the two cannot disagree.
  const [now] = useState(() => Date.now());
  const mockEvents = useMemo(() => generateEvents({ now }), [now]);

  // ── Look and feel ──────────────────────────────────────────────────────────
  //
  // The module's defaults (appearance.ts). The map is not drawn until an
  // embedding Workshop has answered, so it never opens in the wrong style or
  // place and then rebuilds.
  const appearanceState = useWorkshopEventAppearance();
  const look = appearanceState.appearance;
  const lookReady = appearanceState.status === "ready";

  // ── Sources ────────────────────────────────────────────────────────────────
  //
  // Workshop's variables (pinned), then the URL's or this browser's saved
  // list (editable here), then chosen title columns over the lot. See
  // sources/config.ts for which of these are remembered, and where.
  const workshop = useWorkshopEventSources();
  const workshopKey = JSON.stringify(workshop.sources);
  // Keyed on content: the context hands back a fresh array every render, and
  // a new array here would restart every source.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pinned = useMemo(() => workshop.sources, [workshopKey]);
  const pinnedKeys = useMemo(() => new Set(pinned.map(sourceKey)), [pinned]);

  const [urlSources] = useState(() => sourcesFromSearch(window.location.search));
  const [embedded] = useState(() => isInsideIframe());
  const sessionOnly: "url" | "workshop" | null =
    urlSources.length > 0 ? "url" : embedded ? "workshop" : null;
  const [savedSources] = useState(() => (sessionOnly ? [] : loadSavedSources()));
  const [local, setLocal] = useState<SourceConfig[]>(() =>
    urlSources.length > 0 ? urlSources : savedSources,
  );
  useEffect(() => {
    if (!sessionOnly) {saveSources(local);}
  }, [local, sessionOnly]);

  const [titles, setTitles] = useState<Record<string, string>>(() => loadSavedTitles(savedSources));
  useEffect(() => saveTitles(titles), [titles]);

  const configs = useMemo(
    () =>
      // Locked, sources added on the page — this browser's saved ones
      // included — are left out; a URL's still count, as the page's config.
      dedupe([...pinned, ...(look.allowSourceEditing ? local : urlSources)]).map((config) => {
        const titleField = titles[sourceKey(config)];
        const { titleField: _saved, ...rest } = config;
        return titleField ? { ...rest, titleField } : rest;
      }),
    [pinned, local, urlSources, titles, look.allowSourceEditing],
  );
  const hasSources = configs.length > 0;

  // Mock data unless something real is configured — and not while Workshop
  // has yet to say whether it is, so embedded pages never flash it.
  const [mockChoice, setMockChoice] = useState<boolean | null>(null);
  const mock =
    (look.allowSourceEditing ? mockChoice : null) ?? (!hasSources && workshop.status === "ready");
  // ── Categories ─────────────────────────────────────────────────────────────
  //
  // The built-ins plus any the Workshop variable adds, and what has been put
  // into which by hand (categoryOverrides.ts). Keyed on content, like the
  // sources: a new registry re-reads every loaded source.
  const workshopCategories = useWorkshopEventCategories();
  const categoriesKey = JSON.stringify(workshopCategories.categories);
  const registry = useMemo(
    () => buildRegistry(workshopCategories.categories),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoriesKey],
  );
  const [savedOverrides, setOverrides] = useState<CategoryOverrides>(loadOverrides);
  useEffect(() => saveOverrides(savedOverrides), [savedOverrides]);
  // Locked, categories are as detected: what was chosen here before is kept
  // for when editing is allowed again, but not applied.
  const overrides = look.allowCategoryEditing ? savedOverrides : NO_OVERRIDES;

  const { states, reload } = useEventSources(configs, now, registry);

  // As interpreted, before anything was put into a category by hand.
  const rawEvents = useMemo(
    () => sortNewestFirst([...(mock ? mockEvents : []), ...states.flatMap((s) => s.events)]),
    [mock, mockEvents, states],
  );
  const rawAreas = useMemo(() => states.flatMap((s) => s.areas), [states]);
  const events = useMemo(
    () => applyOverrides(rawEvents, overrides, registry),
    [rawEvents, overrides, registry],
  );
  const areas = useMemo(
    () => applyOverrides(rawAreas, overrides, registry),
    [rawAreas, overrides, registry],
  );
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const areasById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const rawById = useMemo(
    () => new Map<string, { id: string; category: string; sourceKey?: string; categoryValue?: string }>(
      [...rawEvents, ...rawAreas].map((item) => [item.id, item]),
    ),
    [rawEvents, rawAreas],
  );

  /** The picker for one event or area: its own choice, and what it gets without one. */
  const categoryChoiceFor = (id: string) => {
    const raw = rawById.get(id);
    const withoutOwn = raw
      ? overriddenCategory(raw, { ...overrides, events: {} }, registry) ?? raw.category
      : "other";
    const chosen = overrides.events[id];
    return {
      registry,
      chosen: chosen && registry.byId[chosen] ? chosen : undefined,
      automatic: withoutOwn,
      onChange: (category: string | undefined) =>
        setOverrides((previous) => withOverride(previous, { kind: "event", id }, category)),
      editable: look.allowCategoryEditing,
    };
  };

  // ── Filters ────────────────────────────────────────────────────────────────
  const [hidden, setHidden] = useState<Set<EventCategory>>(() => new Set());
  const [minSeverity, setMinSeverity] = useState<Severity>("low");
  // Real data is rarely all from the last week; mock data is. Until someone
  // picks a window, it follows whether there are real sources.
  const [windowChoice, setWindowMs] = useState<number | null | undefined>(undefined);
  const windowMs = windowChoice !== undefined ? windowChoice : hasSources ? null : 7 * DAY;

  // What the user picked in settings, over the module's default; a new
  // default from Workshop replaces the pick.
  const [terrainChoice, setTerrain] = useState<boolean | null>(null);
  const [globeChoice, setGlobe] = useState<boolean | null>(null);
  useEffect(() => setTerrain(null), [look.terrain]);
  useEffect(() => setGlobe(null), [look.globe]);
  const terrain = terrainChoice ?? look.terrain;
  const globe = globeChoice ?? look.globe;

  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [dem, setDem] = useState<DemSourceHandle | null>(null);
  const [zoom, setZoom] = useState(look.startView.zoom);
  const [selection, setSelection] = useState<Selection>(null);
  const [hover, setHover] = useState<ClusterHover | null>(null);
  const [groundHeight, setGroundHeight] = useState<number | null | "loading">(null);

  const visible = useMemo(
    () => filterEvents(events, { hidden, minSeverity, windowMs, now }),
    [events, hidden, minSeverity, windowMs, now],
  );
  const visibleAreas = useMemo(
    () => areas.filter((area) => !hidden.has(area.category)),
    [areas, hidden],
  );
  // Counts beside each category ignore the category filter itself, so turning
  // a category off does not make its own count read zero.
  const categoryCounts = useMemo(() => {
    const counts = new Map<EventCategory, number>();
    for (const event of filterEvents(events, {
      hidden: new Set(),
      minSeverity,
      windowMs,
      now,
    })) {
      counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
    }
    return counts;
  }, [events, minSeverity, windowMs, now]);
  // Custom categories always show — a module defined them for a reason —
  // and "Other" once something has landed in it.
  const shownCategories = registry.order.filter(
    (category) => category !== "other" || (categoryCounts.get("other") ?? 0) > 0 || areas.some((a) => a.category === "other"),
  );

  const selectedEvent = selection?.kind === "event" ? eventsById.get(selection.id) ?? null : null;
  const selectedArea = selection?.kind === "area" ? areasById.get(selection.id) ?? null : null;
  const selectedPk = selectedEvent
    ? primaryKey(selectedEvent)
    : selectedArea
      ? primaryKey(selectedArea)
      : undefined;

  // Events (then areas) by the key the selected-event variable holds. The
  // first wins where two sources share a key.
  const byPk = useMemo(() => {
    const map = new Map<string, { kind: "event"; item: MonitorEvent } | { kind: "area"; item: MonitorArea }>();
    for (const item of events) {
      if (!map.has(primaryKey(item))) {map.set(primaryKey(item), { kind: "event", item });}
    }
    for (const item of areas) {
      if (!map.has(primaryKey(item))) {map.set(primaryKey(item), { kind: "area", item });}
    }
    return map;
  }, [events, areas]);

  // Read at the moment a map is (re)built: the extensions are seeded with the
  // current data and the camera with the current view.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const areasRef = useRef(visibleAreas);
  areasRef.current = visibleAreas;
  const registryRef = useRef(registry);
  registryRef.current = registry;
  // Null until the camera first moves: a map built before then opens on the
  // start view, one rebuilt later (terrain toggled, say) where it was.
  const viewRef = useRef<View | null>(null);

  const signature = [terrain, globe, look.spritePath, look.clustering, look.clusterRadius].join("|");
  const extensions = useMemo(
    () => [
      elevation({
        terrain: terrain ? { exaggeration: 1.5 } : false,
        hillshade: true,
        sky: terrain,
        onReady: setDem,
      }),
      areasExtension(areasRef.current, registryRef.current),
      eventsExtension(visibleRef.current, registryRef.current, {
        cluster: look.clustering,
        clusterRadius: look.clusterRadius,
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const spawn = useMemo(() => viewRef.current ?? look.startView, [signature, lookReady]);

  const onMapReady = (instance: maplibregl.Map) => {
    // The top-right corner is the settings button's, so zoom and compass
    // sit above the scale bar instead.
    instance.addControl(new maplibregl.NavigationControl(), "bottom-right");
    setMap(instance);
    setZoom(instance.getZoom());
  };

  // A rebuilt map means a new DEM source; the old one is disposed with it.
  useEffect(() => {
    setDem(null);
    setMap(null);
    setHover(null);
  }, [signature]);

  // Categories → colours, without rebuilding the map.
  useEffect(() => {
    if (map) {
      setCategoryColours(map, registry);
      setAreaCategoryColours(map, registry);
    }
  }, [map, registry]);

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

    // The cluster under the pointer, so moving within one only moves the
    // card, and a late answer for a cluster already left is dropped.
    let hoverCluster: number | null = null;
    const onClusterMove = (event: maplibregl.MapLayerMouseEvent) => {
      const properties = event.features?.[0]?.properties;
      if (!properties) {return;}
      const { x, y } = event.point;
      const clusterId = Number(properties.cluster_id);
      if (clusterId === hoverCluster) {
        setHover((previous) => (previous ? { ...previous, x, y } : previous));
        return;
      }
      hoverCluster = clusterId;
      setHover({ x, y, count: Number(properties.point_count), breakdown: null });
      const source = map.getSource(EVENTS_SOURCE) as unknown as EventsSource | undefined;
      void source
        ?.getClusterLeaves(clusterId, HOVER_LEAF_LIMIT, 0)
        .then((leaves) => {
          if (hoverCluster !== clusterId) {return;}
          setHover((previous) => (previous ? { ...previous, breakdown: clusterBreakdown(leaves) } : previous));
        })
        .catch(() => undefined);
    };
    const onClusterLeave = () => {
      hoverCluster = null;
      setHover(null);
    };

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
    const onMoveStart = () => {
      hoverCluster = null;
      setHover(null);
    };

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
    // Room on the left for the details panel.
    if (bounds) {map?.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 360, right: 60 }, maxZoom, duration: 1400 });}
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
      center: [look.startView.lon, look.startView.lat],
      zoom: look.startView.zoom,
      pitch: 0,
      bearing: 0,
      duration: 1600,
    });
  };

  // A start view changed from Workshop once the map is up: go there.
  const startKey = `${look.startView.lat},${look.startView.lon},${look.startView.zoom}`;
  const shownStart = useRef<string | null>(null);
  useEffect(() => {
    if (!map) {return;}
    if (shownStart.current != null && shownStart.current !== startKey) {
      map.flyTo({ center: [look.startView.lon, look.startView.lat], zoom: look.startView.zoom, duration: 1400 });
    }
    shownStart.current = startKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, startKey]);

  // Frame the data once, when it has all arrived — unless something has been
  // selected meanwhile (from Workshop, say), which has its own camera move.
  const fittedOnLoad = useRef(false);
  const sourcesLoading = workshop.status !== "ready" || states.some((state) => state.status === "loading");
  useEffect(() => {
    if (!map || !look.fitToDataOnLoad || fittedOnLoad.current || sourcesLoading) {return;}
    if (visible.length + visibleAreas.length === 0) {return;}
    fittedOnLoad.current = true;
    if (selection == null) {fitToData();}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, look.fitToDataOnLoad, sourcesLoading, visible, visibleAreas]);

  // ── The selected-event Workshop variable ─────────────────────────────────
  //
  // Both ways: a selection made here is written to it; a value set from the
  // module selects that event. Our own writes come back as value changes, so
  // a value is only acted on when it is new, and one we sent a moment ago
  // (overtaken by a later selection) is ignored. A key whose event has not
  // loaded yet waits for it.
  const workshopSelection = useWorkshopSelectedEvent();
  const lastSeenValue = useRef<string | undefined | null>(null);
  const pendingPk = useRef<string | undefined>(undefined);
  const recentlySent = useRef<Array<{ value: string | undefined; at: number }>>([]);

  /** Filters that hide an event are relaxed, so a selection from outside shows. */
  const reveal = (event: MonitorEvent) => {
    setHidden((previous) => {
      if (!previous.has(event.category)) {return previous;}
      const next = new Set(previous);
      next.delete(event.category);
      return next;
    });
    if (severityRank(event.severity) < severityRank(minSeverity)) {setMinSeverity("low");}
    if (windowMs != null && event.time != null && event.time < now - windowMs) {setWindowMs(null);}
  };

  // Incoming: declared before the outgoing effect, so a value waiting for
  // its event is marked pending before anything could write over it.
  useEffect(() => {
    if (workshopSelection.status !== "ready") {return;}
    const wanted = workshopSelection.value;
    const isNew = wanted !== lastSeenValue.current;
    lastSeenValue.current = wanted;
    if (!isNew && pendingPk.current == null) {return;}
    const echo = recentlySent.current.some(
      (sent) => sent.value === wanted && Date.now() - sent.at < 3000,
    );
    if (wanted === selectedPk || (isNew && echo && wanted !== recentlySent.current.at(-1)?.value)) {
      pendingPk.current = undefined;
      return;
    }
    if (wanted == null) {
      pendingPk.current = undefined;
      setSelection(null);
      return;
    }
    const target = byPk.get(wanted);
    if (!target) {
      pendingPk.current = wanted;
      return;
    }
    pendingPk.current = undefined;
    if (target.kind === "event") {
      reveal(target.item);
      flyTo(target.item);
    } else {
      setSelection({ kind: "area", id: target.item.id });
      zoomToArea(target.item);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshopSelection.status, workshopSelection.value, byPk]);

  // Outgoing.
  useEffect(() => {
    if (workshopSelection.status !== "ready" || pendingPk.current != null) {return;}
    if (selectedPk === workshopSelection.value) {return;}
    recentlySent.current = [...recentlySent.current.slice(-4), { value: selectedPk, at: Date.now() }];
    lastSeenValue.current = selectedPk;
    workshopSelection.set(selectedPk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPk, workshopSelection.status]);

  // Settings live in a drop-down behind the top-right button; a click
  // anywhere else, or Escape, puts them away.
  const [settingsChoice, setSettingsOpen] = useState(false);
  const settingsOpen = look.showSettings && settingsChoice;
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsToggleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!settingsOpen) {return;}
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (settingsRef.current?.contains(target) || settingsToggleRef.current?.contains(target)) {return;}
      setSettingsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {setSettingsOpen(false);}
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [settingsOpen]);

  const toggleCategory = (category: EventCategory) => {
    setHidden((previous) => {
      const next = new Set(previous);
      if (next.has(category)) {next.delete(category);}
      else {next.add(category);}
      return next;
    });
  };

  const addSource = (config: SourceConfig) => {
    setLocal((previous) => dedupe([...previous, config]));
    // Real data is rarely inside the mock's week.
    setWindowMs(null);
  };
  // Pinned (Workshop) sources have no remove button; this only ever edits
  // the local list.
  const removeSource = (key: string) =>
    setLocal((previous) => previous.filter((config) => sourceKey(config) !== key));
  const setTitleField = (key: string, titleField: string | undefined) =>
    setTitles((previous) => {
      const next = { ...previous };
      if (titleField) {next[key] = titleField;}
      else {delete next[key];}
      return next;
    });

  const critical = visible.filter((event) => event.severity === "critical").length;

  return (
    <div style={{ position: "relative", height: "100%" }}>
      {lookReady && (
        <DechoBasemap
          key={signature}
          rid={BASEMAP_RID}
          assetsRid={ASSETS_RID}
          spritePath={look.spritePath}
          spawnLat={spawn.lat}
          spawnLong={spawn.lon}
          spawnZoom={spawn.zoom}
          globe={globe}
          navigationControl={false}
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
      )}

      {/* ── Status and the settings button ───────────────────────────────── */}
      <div style={toolbar} ref={settingsToggleRef}>
        <div style={statusChip}>
          <span style={panelHeading}>Event monitor</span>
          {mock && <span style={mockBadge}>MOCK DATA</span>}
          <span style={panelFigures}>
            {visible.length.toLocaleString("en-GB")} of {events.length.toLocaleString("en-GB")} events
            {visibleAreas.length > 0 && ` · ${visibleAreas.length} areas`}
            {critical > 0 && (
              <span style={{ color: SEVERITY_COLOURS.critical }}> · {critical} critical</span>
            )}
          </span>
        </div>
        {look.showSettings && (
        <button
          type="button"
          style={settingsButton(settingsOpen)}
          aria-expanded={settingsOpen}
          aria-controls="event-monitor-settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>⚙</span>
          Settings
        </button>
        )}
      </div>

      {/* ── Settings: sources, filters and feed ──────────────────────────── */}
      {settingsOpen && (
        <div
          style={settingsPanel}
          ref={settingsRef}
          id="event-monitor-settings"
          role="dialog"
          aria-label="Settings"
        >
          <div style={sidePanelContent}>
            <SourcesSection
              states={states}
              mock={mock}
              onMockChange={setMockChoice}
              onAdd={addSource}
              onRemove={removeSource}
              onReload={reload}
              onTitleChange={setTitleField}
              sessionOnly={sessionOnly}
              pinnedKeys={pinnedKeys}
              workshopProblems={[...workshop.invalid, ...workshopCategories.invalid, ...appearanceState.invalid]}
              registry={registry}
              overrides={overrides}
              onSourceCategory={(key, category) =>
                setOverrides((previous) => withOverride(previous, { kind: "source", sourceKey: key }, category))
              }
              onValueCategory={(key, value, category) =>
                setOverrides((previous) =>
                  withOverride(previous, { kind: "value", sourceKey: key, value }, category),
                )
              }
              waitingForWorkshop={workshop.status === "pending"}
            allowSourceEditing={look.allowSourceEditing}
            allowCategoryEditing={look.allowCategoryEditing}
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
                    checked={!hidden.has(category)}
                    onChange={() => toggleCategory(category)}
                    style={panelCheckbox}
                  />
                  <span style={dot(categoryMeta(registry, category).colour)} />
                  {categoryMeta(registry, category).label}
                </span>
                <span style={panelFigures}>{categoryCounts.get(category) ?? 0}</span>
              </label>
            ))}

            {look.feedLength > 0 && (
              <>
              <div style={panelSeparator} />

              <div style={sectionLabel}>Latest</div>
              <div style={feed}>
                {visible.length === 0 && <div style={panelMuted}>Nothing matches the filters.</div>}
                {visible.slice(0, look.feedLength).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    style={feedRow(selection?.kind === "event" && event.id === selection.id)}
                    onClick={() => flyTo(event)}
                    title={event.title}
                  >
                    <span style={{ ...dot(categoryMeta(registry, event.category).colour), marginTop: 5 }} />
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
              </>
            )}

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
      )}

      {/* ── Cluster hover ────────────────────────────────────────────────── */}
      {hover && (
        <div style={{ ...hoverCard, left: hover.x + 16, top: hover.y + 16 }}>
          <div style={panelHeading}>{hover.count} events — click to expand</div>
          {hover.breakdown == null && <div style={panelMuted}>Counting…</div>}
          {hover.breakdown?.map(({ category, count }) => (
            <div key={category} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={dot(categoryMeta(registry, category).colour)} />
              <span style={{ flex: 1 }}>{categoryMeta(registry, category).label}</span>
              <span style={panelFigures}>{count}</span>
            </div>
          ))}
          {hover.breakdown && hover.count > HOVER_LEAF_LIMIT && (
            <div style={panelMuted}>Counted from the first {HOVER_LEAF_LIMIT.toLocaleString("en-GB")}.</div>
          )}
        </div>
      )}

      {/* ── Details ──────────────────────────────────────────────────────── */}
      {selectedEvent && (
        <EventDetails
          event={selectedEvent}
          now={now}
          groundHeight={groundHeight}
          demReady={dem != null}
          categoryChoice={categoryChoiceFor(selectedEvent.id)}
          onZoom={() => flyTo(selectedEvent)}
          onClose={() => setSelection(null)}
        />
      )}
      {selectedArea && (
        <AreaDetails
          area={selectedArea}
          categoryChoice={categoryChoiceFor(selectedArea.id)}
          onZoom={() => zoomToArea(selectedArea)}
          onClose={() => setSelection(null)}
        />
      )}

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div style={{ ...legend, left: selectedEvent || selectedArea ? 354 : 12 }}>
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
