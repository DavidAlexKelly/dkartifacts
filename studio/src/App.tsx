import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type { LngLatBoundsLike, Map as MlMap, MapGeoJSONFeature } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { elevationAt, profile as sampleProfile, type ProfilePoint } from "./data/elevation";
import { Library, type CatalogEntry, type Connection } from "./data/library";
import type { LayerManifest } from "./data/manifest";
import { hasAssets, registerProtocols, setProtocolLibrary } from "./data/protocols";
import { configuredCatalogRid, foundry } from "./foundry/auth";
import { download, importFile, safeName, toCsv, toGeoJson, toKml } from "./formats/vector";
import { renderLayout } from "./formats/print";
import { bbox, lengthM, midpoints, polygonAreaM2, vertices } from "./map/geometry";
import { MapView } from "./map/MapView";
import { OVERLAY, buildStyle, catalogKind, layerIdOf } from "./map/style";
import { SKETCH_TOOLS, attachTools, type Draft, type Tool, type ToolContext } from "./map/tools";
import { autosave, clearAutosave, loadAutosave, parseProject, serializeProject } from "./project/io";
import { fieldsOf, historyReducer, type Action, type History } from "./project/reducer";
import {
  defaultVectorStyle,
  newId,
  newProject,
  type CatalogLayerNode,
  type LayerNode,
  type StudioFeature,
  type VectorLayerNode,
} from "./project/types";
import { AttributeTable } from "./ui/AttributeTable";
import { BrowserPanel } from "./ui/BrowserPanel";
import { LayersPanel } from "./ui/LayersPanel";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { ResultsPanel, type IdentifyResult, type Measurement } from "./ui/ResultsPanel";
import { StatusBar } from "./ui/StatusBar";
import { Toolbar } from "./ui/Toolbar";

registerProtocols();

/** Where the catalog is, when the project does not say: URL, then build config, then the dev folder. */
function defaultConnection(): Connection | null {
  const params = new URLSearchParams(window.location.search);
  const data = params.get("data");
  const rid = params.get("catalog");
  if (rid) {return { kind: "foundry", catalogRid: rid };}
  if (data) {return { kind: "http", baseUrl: data };}
  if (configuredCatalogRid && foundry) {return { kind: "foundry", catalogRid: configuredCatalogRid };}
  return foundry ? null : { kind: "http", baseUrl: "/data/" };
}

function initHistory(): History {
  const params = new URLSearchParams(window.location.search);
  const saved = params.has("fresh") ? null : loadAutosave();
  const project = saved ?? newProject(defaultConnection());
  if (!project.connection) {project.connection = defaultConnection();}
  return { past: [], present: project, future: [] };
}

function catalogNode(entry: CatalogEntry): CatalogLayerNode {
  const kind = catalogKind(entry);
  return {
    kind: "catalog",
    id: newId("cat"),
    catalogId: entry.id,
    title: entry.title,
    visible: true,
    opacity: 1,
    options:
      kind === "basemap" ? { flavor: "light", labels: true }
        : kind === "raster-dem" ? { hillshade: true, terrain3d: false, exaggeration: 1.5 }
          : kind === "contours" ? { color: "#8a5a2b", width: 1, labels: true }
            : {},
  };
}

/** Draw basemap at the bottom, then terrain shading, then contours: the order a map is usually read in. */
const ADD_ORDER = ["basemap", "raster-dem", "raster", "contours", "vector-tiles", "dem-cells"];

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, initHistory);
  const project = history.present;
  const [library, setLibrary] = useState<Library | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [manifests, setManifests] = useState<Map<string, LayerManifest>>(new Map());
  const [manifestErrors, setManifestErrors] = useState<Map<string, string>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tool, setToolState] = useState<Tool>("pan");
  const [sketch, setSketch] = useState<Position[]>([]);
  const [cursor, setCursor] = useState<{ lngLat: Position; snapped: boolean } | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ layerId: string; featureIds: string[] } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [identify, setIdentify] = useState<IdentifyResult | null>(null);
  const [measured, setMeasured] = useState<{ kind: "distance" | "area" | "profile"; coords: Position[] } | null>(null);
  const [profilePoints, setProfilePoints] = useState<ProfilePoint[] | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "info" | "error" } | null>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [snapping, setSnapping] = useState(true);
  const [tableOpen, setTableOpen] = useState(false);
  const [zoom, setZoom] = useState(project.view.zoom);
  const initialView = useRef(project.view);

  const say = useCallback((text: string, kind: "info" | "error" = "info") => setMessage({ text, kind }), []);

  // ── Catalog ────────────────────────────────────────────────────────────
  const connectionKey = JSON.stringify(project.connection);
  useEffect(() => {
    const connection = project.connection;
    if (!connection) {
      setLibrary(null);
      return;
    }
    let cancelled = false;
    setLibraryLoading(true);
    setLibraryError(null);
    Library.open(connection, foundry)
      .then((lib) => {
        if (cancelled) {return;}
        setProtocolLibrary(lib);
        setManifests(new Map());
        setManifestErrors(new Map());
        setLibrary(lib);
      })
      .catch((err: unknown) => !cancelled && setLibraryError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLibraryLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionKey]);

  // A fresh project on a fresh catalog starts with the obvious layers.
  const seeded = useRef(false);
  useEffect(() => {
    if (!library || seeded.current || project.layers.length > 0) {return;}
    seeded.current = true;
    const entries = library.catalog.layers
      .filter((e) => !library.unavailable(e) && ["basemap", "raster-dem", "contours"].includes(catalogKind(e)))
      .sort((a, b) => ADD_ORDER.indexOf(catalogKind(a)) - ADD_ORDER.indexOf(catalogKind(b)));
    for (const e of entries) {dispatch({ type: "addLayer", layer: catalogNode(e) });}
    const bounds = library.catalog.layers.find((e) => e.bounds)?.bounds;
    if (bounds && map) {map.fitBounds(bounds as LngLatBoundsLike, { padding: 40, duration: 0 });}
  }, [library, project.layers.length, map]);

  // Manifests for every catalog layer on the map.
  useEffect(() => {
    if (!library) {return;}
    for (const node of project.layers) {
      if (node.kind !== "catalog" || manifests.has(node.catalogId) || manifestErrors.has(node.catalogId)) {continue;}
      library
        .manifest(node.catalogId)
        .then((m) => setManifests((prev) => new Map(prev).set(node.catalogId, m)))
        .catch((err: unknown) => setManifestErrors((prev) => new Map(prev).set(node.catalogId, err instanceof Error ? err.message : String(err))));
    }
  }, [library, project.layers, manifests, manifestErrors]);

  const entries = useMemo(() => new Map((library?.catalog.layers ?? []).map((e) => [e.id, e])), [library]);
  const terrainId = useMemo(() => library?.catalog.layers.find((e) => e.kind === "raster-dem" && !library.unavailable(e))?.id ?? null, [library]);
  const glyphs = !!library && hasAssets();

  // ── Project state ──────────────────────────────────────────────────────
  useEffect(() => autosave(project), [project]);

  const activeNode = project.layers.find((l) => l.id === activeId) ?? null;
  const activeVector = activeNode?.kind === "vector" ? activeNode : null;

  // Selection follows the data: drop ids that no longer exist (undo, delete).
  useEffect(() => {
    if (!selection) {return;}
    const layer = project.layers.find((l) => l.id === selection.layerId);
    if (!layer || layer.kind !== "vector") {
      setSelection(null);
      return;
    }
    const ids = new Set(layer.data.features.map((f) => f.id));
    const kept = selection.featureIds.filter((id) => ids.has(id));
    if (kept.length !== selection.featureIds.length) {setSelection(kept.length ? { ...selection, featureIds: kept } : null);}
  }, [project.layers, selection]);

  const setTool = (t: Tool) => {
    setToolState(t);
    setSketch([]);
    setMeasured(null);
    setProfilePoints(null);
    setIdentify(null);
    if (map) {
      if (SKETCH_TOOLS.has(t)) {map.doubleClickZoom.disable();}
      else {map.doubleClickZoom.enable();}
      map.getCanvas().style.cursor = t === "pan" ? "" : "crosshair";
    }
  };

  /** The active vector layer, or a new "Drawings" layer if there is none to draw into. */
  const ensureVectorLayer = (): string => {
    if (activeVector) {return activeVector.id;}
    const layer: VectorLayerNode = {
      kind: "vector",
      id: newId("vec"),
      title: "Drawings",
      visible: true,
      opacity: 1,
      style: defaultVectorStyle(project.layers.filter((l) => l.kind === "vector").length),
      data: { type: "FeatureCollection", features: [] },
      fields: ["name"],
    };
    dispatch({ type: "addLayer", layer });
    setActiveId(layer.id);
    return layer.id;
  };

  const blankProps = (layerId: string): Record<string, unknown> => {
    const layer = project.layers.find((l) => l.id === layerId);
    return layer?.kind === "vector" ? Object.fromEntries(fieldsOf(layer).map((f) => [f, null])) : { name: null };
  };

  const addFeature = (geometry: Geometry) => {
    const layerId = ensureVectorLayer();
    const feature: StudioFeature = { type: "Feature", id: newId("f"), geometry, properties: blankProps(layerId) };
    dispatch({ type: "addFeature", layerId, feature });
    setSelection({ layerId, featureIds: [feature.id] });
  };

  // ── Tools ──────────────────────────────────────────────────────────────
  const toolCtx = useRef<ToolContext | null>(null);
  toolCtx.current = {
    tool,
    activeVector,
    selection,
    sketch,
    snapping,
    setSketch,
    setCursor,
    setDraft,
    select: (sel) => {
      setSelection(sel);
      if (sel && sel.layerId !== activeId) {setActiveId(sel.layerId);}
    },
    addPoint: (at) => addFeature({ type: "Point", coordinates: at }),
    finishSketch: (coords) => {
      setSketch([]);
      if (tool === "line" && coords.length >= 2) {addFeature({ type: "LineString", coordinates: coords });}
      else if (tool === "polygon" && coords.length >= 3) {addFeature({ type: "Polygon", coordinates: [[...coords, coords[0]]] });}
      else if (tool === "measure-line" && coords.length >= 2) {setMeasured({ kind: "distance", coords });}
      else if (tool === "measure-area" && coords.length >= 3) {setMeasured({ kind: "area", coords });}
      else if (tool === "profile" && coords.length >= 2) {
        if (!library || !terrainId) {
          say("An elevation profile needs a terrain layer (raster-dem) in the catalog.", "error");
          return;
        }
        setMeasured({ kind: "profile", coords });
        setProfileBusy(true);
        setProfilePoints(null);
        sampleProfile(library, terrainId, coords as Array<[number, number]>)
          .then(setProfilePoints)
          .catch((e: unknown) => say(`Profile failed: ${String(e)}`, "error"))
          .finally(() => setProfileBusy(false));
      }
    },
    commitGeometry: (d) => dispatch({ type: "setGeometry", layerId: d.layerId, featureId: d.featureId, geometry: d.geometry }),
    deleteSelected: () => {
      if (selection) {dispatch({ type: "deleteFeatures", layerId: selection.layerId, ids: selection.featureIds });}
      setSelection(null);
    },
    identify: (features: MapGeoJSONFeature[], at: Position) => {
      const seen = new Set<string>();
      const hits = features.flatMap((f) => {
        const nodeId = layerIdOf(f.layer.id);
        const node = project.layers.find((l) => l.id === nodeId);
        const key = `${nodeId}|${f.properties?.__fid ?? f.id ?? JSON.stringify(f.properties)}|${f.sourceLayer ?? ""}`;
        if (!node || seen.has(key)) {return [];}
        seen.add(key);
        return [{ layer: node.title, detail: f.sourceLayer, properties: f.properties as Record<string, unknown> }];
      });
      setIdentify({ at, elevation: null, hits });
      if (library && terrainId) {
        void elevationAt(library, terrainId, at[0], at[1]).then((e) => setIdentify((prev) => (prev && prev.at === at ? { ...prev, elevation: e } : prev)));
      }
    },
  };

  useEffect(() => {
    if (!map) {return;}
    return attachTools(map, () => toolCtx.current!);
  }, [map]);

  // Cursor elevation, throttled: one lookup in flight at a time.
  const elevBusy = useRef(false);
  useEffect(() => {
    if (!cursor || !library || !terrainId || elevBusy.current) {return;}
    elevBusy.current = true;
    void elevationAt(library, terrainId, cursor.lngLat[0], cursor.lngLat[1])
      .then(setElevation)
      .catch(() => setElevation(null))
      .finally(() => {
        elevBusy.current = false;
      });
  }, [cursor, library, terrainId]);

  // ── Map style and overlay ──────────────────────────────────────────────
  const background = useMemo(() => {
    const base = project.layers.find((l) => l.kind === "catalog" && l.visible && catalogKind(entries.get(l.catalogId)) === "basemap") as CatalogLayerNode | undefined;
    const flavor = base?.options.flavor ?? "light";
    return { light: "#e9e4dc", white: "#ffffff", grayscale: "#e4e4e4", dark: "#2b2b2b", black: "#111111" }[flavor] ?? "#e9e4dc";
  }, [project.layers, entries]);

  const style = useMemo(
    () => buildStyle(project, { entries, manifests, glyphs, overlay: { type: "FeatureCollection", features: [] }, selection, background }),
    // view changes do not change the style
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.layers, project.globe, entries, manifests, glyphs, selection, background],
  );

  const overlay = useMemo((): FeatureCollection => {
    const out: Feature[] = [];
    const pt = (c: Position, role: string, extra: Record<string, unknown> = {}): Feature => ({ type: "Feature", properties: { role, ...extra }, geometry: { type: "Point", coordinates: c } });
    if (SKETCH_TOOLS.has(tool)) {
      const coords = cursor ? [...sketch, cursor.lngLat] : sketch;
      const closed = tool === "polygon" || tool === "measure-area";
      if (coords.length >= 2) {
        out.push({
          type: "Feature",
          properties: { role: "sketch" },
          geometry: closed && coords.length >= 3 ? { type: "Polygon", coordinates: [[...coords, coords[0]]] } : { type: "LineString", coordinates: coords },
        });
      }
      sketch.forEach((c) => out.push(pt(c, "vertex")));
    }
    if (measured) {
      const c = measured.coords;
      out.push({ type: "Feature", properties: { role: "sketch" }, geometry: measured.kind === "area" ? { type: "Polygon", coordinates: [[...c, c[0]]] } : { type: "LineString", coordinates: c } });
      c.forEach((v) => out.push(pt(v, "vertex")));
    }
    if (tool === "edit" && activeVector && selection?.layerId === activeVector.id && selection.featureIds.length === 1) {
      const f = activeVector.data.features.find((x) => x.id === selection.featureIds[0]);
      const g = draft && f && draft.featureId === f.id ? draft.geometry : f?.geometry;
      if (g) {
        if (g.type !== "Point") {out.push({ type: "Feature", properties: { role: "sketch" }, geometry: g });}
        midpoints(g).forEach((v) => out.push(pt(v.coord, "mid", { path: JSON.stringify(v.path) })));
        vertices(g).forEach((v) => out.push(pt(v.coord, "handle", { path: JSON.stringify(v.path) })));
      }
    }
    if (identify) {out.push(pt(identify.at, "vertex"));}
    if (cursor?.snapped) {out.push(pt(cursor.lngLat, "snap"));}
    return { type: "FeatureCollection", features: out };
  }, [tool, sketch, cursor, measured, activeVector, selection, draft, identify]);

  // The overlay changes on every mouse move, so it bypasses the style diff
  // and is pushed straight into its source.
  useEffect(() => {
    if (!map) {return;}
    const push = () => {
      const src = map.getSource(OVERLAY) as { setData?(d: FeatureCollection): void } | undefined;
      src?.setData?.(overlay);
    };
    push();
    map.on("styledata", push);
    return () => {
      map.off("styledata", push);
    };
  }, [map, overlay]);

  const liveMeasurement = useMemo((): Measurement | null => {
    const coords = measured && measured.kind !== "profile" ? measured.coords : tool === "measure-line" || tool === "measure-area" ? (cursor ? [...sketch, cursor.lngLat] : sketch) : null;
    if (!coords || coords.length < 2) {return null;}
    const kind = (measured?.kind ?? (tool === "measure-area" ? "area" : "distance")) as "distance" | "area";
    return { kind, value: kind === "area" ? polygonAreaM2([[...coords, coords[0]]]) : lengthM(coords), vertices: coords.length };
  }, [measured, tool, sketch, cursor]);

  // ── Commands ───────────────────────────────────────────────────────────
  const zoomToBounds = (b: [number, number, number, number] | null | undefined) => {
    if (!map || !b) {return;}
    if (b[0] === b[2] && b[1] === b[3]) {map.flyTo({ center: [b[0], b[1]], zoom: Math.max(map.getZoom(), 14) });}
    else {map.fitBounds(b as LngLatBoundsLike, { padding: 60, maxZoom: 16 });}
  };

  const zoomToLayer = (node: LayerNode) => {
    if (node.kind === "vector") {zoomToBounds(bbox(node.data.features.map((f) => f.geometry)));}
    else {zoomToBounds((manifests.get(node.catalogId)?.bounds ?? entries.get(node.catalogId)?.bounds) as [number, number, number, number] | undefined);}
  };

  const addCatalogLayer = (entry: CatalogEntry) => {
    const node = catalogNode(entry);
    // A basemap goes under everything; anything else on top.
    const at = catalogKind(entry) === "basemap" ? 0 : undefined;
    dispatch({ type: "addLayer", layer: node, at });
    setActiveId(node.id);
  };

  const importFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      try {
        const imported = importFile(file.name, await file.text());
        const layer: VectorLayerNode = {
          kind: "vector",
          id: newId("vec"),
          title: imported.title,
          visible: true,
          opacity: 1,
          style: defaultVectorStyle(project.layers.filter((l) => l.kind === "vector").length),
          data: { type: "FeatureCollection", features: imported.features },
          fields: imported.fields,
        };
        dispatch({ type: "addLayer", layer });
        setActiveId(layer.id);
        zoomToBounds(bbox(imported.features.map((f) => f.geometry)));
        say(`Imported ${imported.features.length} features from ${file.name}${imported.skipped ? ` (${imported.skipped} without a location skipped)` : ""}.`);
      } catch (e) {
        say(`Could not import ${file.name}: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    }
  };

  const saveProject = () => download(`${safeName(project.title)}.decho.json`, serializeProject(project), "application/json");

  const openProject = async (file: File) => {
    try {
      const p = parseProject(await file.text());
      seeded.current = true;
      dispatch({ type: "replace", project: p });
      setActiveId(null);
      setSelection(null);
      map?.jumpTo({ center: p.view.center as [number, number], zoom: p.view.zoom, bearing: p.view.bearing, pitch: p.view.pitch });
      say(`Opened ${file.name}.`);
    } catch (e) {
      say(`Could not open ${file.name}: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  };

  const newProjectCmd = () => {
    if (!confirm("Start a new project? Unsaved changes to this one will be lost.")) {return;}
    clearAutosave();
    seeded.current = false;
    dispatch({ type: "replace", project: newProject(project.connection) });
    setActiveId(null);
    setSelection(null);
  };

  const exportLayer = (format: "geojson" | "csv" | "kml") => {
    const layer = activeVector;
    if (!layer) {return;}
    const fields = fieldsOf(layer);
    const name = safeName(layer.title);
    if (format === "geojson") {download(`${name}.geojson`, toGeoJson(layer.data.features), "application/geo+json");}
    if (format === "csv") {download(`${name}.csv`, toCsv(layer.data.features, fields), "text/csv");}
    if (format === "kml") {download(`${name}.kml`, toKml(layer.title, layer.data.features, fields, layer.style.labelField), "application/vnd.google-earth.kml+xml");}
  };

  const exportPng = async () => {
    if (!map) {return;}
    // Selection highlights and tool markers are working aids, not map content.
    setSelection(null);
    setIdentify(null);
    setMeasured(null);
    setSketch([]);
    await new Promise((r) => setTimeout(r, 300));
    try {
      const blob = await renderLayout(map, project, { title: project.title, scale: window.devicePixelRatio || 1, legend: true });
      download(`${safeName(project.title)}.png`, blob, "image/png");
    } catch (e) {
      say(`Export failed: ${String(e)}`, "error");
    }
  };

  // Keyboard: undo/redo/save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {return;}
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) {return;}
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveProject();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const typedDispatch = dispatch as (a: Action) => void;
  const activeEntry = activeNode?.kind === "catalog" ? entries.get(activeNode.catalogId) : undefined;
  const activeManifest = activeNode?.kind === "catalog" ? manifests.get(activeNode.catalogId) : undefined;

  return (
    <div className={tableOpen ? "app with-table" : "app"}>
      <Toolbar
        title={project.title}
        onTitle={(title) => dispatch({ type: "setTitle", title })}
        tool={tool}
        onTool={setTool}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        snapping={snapping}
        onSnapping={setSnapping}
        globe={project.globe}
        onGlobe={(globe) => dispatch({ type: "setGlobe", globe })}
        tableOpen={tableOpen}
        onTable={setTableOpen}
        hasVector={!!activeVector}
        onNew={newProjectCmd}
        onOpen={openProject}
        onSave={saveProject}
        onImport={(f) => void importFiles(f)}
        onExportPng={() => void exportPng()}
        onExportLayer={exportLayer}
      />
      <aside className="left">
        <LayersPanel
          layers={project.layers}
          activeId={activeId}
          errors={manifestErrors}
          onActivate={setActiveId}
          onZoomTo={zoomToLayer}
          onNewLayer={() => {
            const layer: VectorLayerNode = {
              kind: "vector", id: newId("vec"), title: `Layer ${project.layers.filter((l) => l.kind === "vector").length + 1}`,
              visible: true, opacity: 1, style: defaultVectorStyle(project.layers.filter((l) => l.kind === "vector").length),
              data: { type: "FeatureCollection", features: [] }, fields: ["name"],
            };
            dispatch({ type: "addLayer", layer });
            setActiveId(layer.id);
          }}
          dispatch={typedDispatch}
        />
        <BrowserPanel
          library={library}
          error={libraryError}
          loading={libraryLoading}
          connection={project.connection}
          foundryAvailable={!!foundry}
          onConnect={(connection) => {
            seeded.current = project.layers.length > 0;
            dispatch({ type: "setConnection", connection });
          }}
          onAdd={addCatalogLayer}
        />
      </aside>
      <main
        className="map-wrap"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) {void importFiles(e.dataTransfer.files);}
        }}
      >
        <MapView
          style={style}
          initialView={initialView.current}
          onViewChange={(view) => {
            setZoom(view.zoom);
            dispatch({ type: "setView", view });
          }}
          onReady={setMap}
          onError={(m) => say(m, "error")}
        />
      </main>
      <aside className="right">
        <ResultsPanel
          identify={identify}
          measurement={liveMeasurement}
          profile={profilePoints}
          profileBusy={profileBusy}
          onClose={() => {
            setIdentify(null);
            setMeasured(null);
            setProfilePoints(null);
            setSketch([]);
          }}
        />
        <PropertiesPanel node={activeNode} entry={activeEntry} manifest={activeManifest} glyphs={glyphs} dispatch={typedDispatch} />
      </aside>
      {tableOpen && (
        <AttributeTable
          layer={activeVector}
          selected={selection && activeVector && selection.layerId === activeVector.id ? selection.featureIds : []}
          onSelect={(ids) => activeVector && setSelection({ layerId: activeVector.id, featureIds: ids })}
          onZoomTo={(f) => zoomToBounds(bbox([f.geometry]))}
          dispatch={typedDispatch}
        />
      )}
      <StatusBar
        cursor={cursor?.lngLat ?? null}
        elevation={elevation}
        zoom={zoom}
        tool={tool}
        sketchLength={sketch.length}
        message={message}
        onDismiss={() => setMessage(null)}
      />
    </div>
  );
}
