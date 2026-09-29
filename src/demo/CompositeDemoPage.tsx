/**
 * All four packages, one map.
 *
 * This is the demo that only exists because the estate was reshaped: a year of
 * this repository's history is a story of one package owning the map and the
 * others queueing behind it. Now every add-on is an entry in one array, and
 * the interesting thing about this file is how little of it is glue.
 *
 *   @acc/decho-basemap        the map, the toolbar, and buildings3d() — which
 *                             extrudes the archive's OWN building layer, so it
 *                             costs no dataset and no extra bytes
 *   @acc/decho-elevation      terrain and hillshade from Foundry DEM chunks,
 *                             and the same source answering questions about
 *                             what it drew
 *   @acc/app6d                the tactical graphics as an extension, plus the
 *                             units-and-orders model behind them
 *   @acc/unit-symbol-picker   the SIDC of the unit about to be placed
 *
 * THE SEAM BETWEEN THE PACKAGES IS ONE STRING
 * -------------------------------------------
 * The picker produces a 20-character SIDC. `UnitTemplate.sidc` consumes one.
 * That is the entire integration between symbology and graphics — no shared
 * unit type, no adapter, no coupling. It is worth seeing written down, because
 * "they should probably be one package" is a very reasonable thing to assume
 * until you look at what actually crosses the boundary.
 *
 * WHAT THE ELEVATION IS FOR
 * -------------------------
 * Not decoration. Assign an order and the section under its axis is drawn from
 * the same DEM the terrain is built from, with the line of sight over it — so
 * the map answers whether the unit can actually see the objective it has been
 * told to take. Three packages have to agree for that to be true, and none of
 * them knows about the others.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
// A value import, not a type-only one: this page constructs Markers itself.
// Namespace, not default: maplibre-gl 6 is ESM-only and has no default export.
import * as maplibregl from "maplibre-gl";

import {
  buildings3d,
  chokePoints,
  describeBasemapError,
  describeOverlayLayers,
  going,
  landusePatterns,
  wetGaps,
  type BasemapExtension,
  type BasemapHandle,
  type SourceLayerCensus,
} from "@acc/decho-basemap";
import {
  BuildingsIcon,
  DechoBasemap,
  MapToolbarButton,
  PointIcon,
  TexturesIcon,
} from "@acc/decho-basemap/react";
import { contourTiles, elevation } from "@acc/decho-elevation/extension";
import {
  TerrainProfile,
  useElevation,
} from "@acc/decho-elevation/react";
import type {
  DemSourceHandle,
  ElevationProfile,
  SightResult,
} from "@acc/decho-elevation";
import { tacticGraphics } from "@acc/app6d/extension";
import { APP6D_CATALOG } from "@acc/app6d/symbols";
import {
  assignOrder,
  defaultOrderCatalog,
  moveUnitOrders,
  newId,
  pinAttachedOrders,
  resolveRoute,
  toPlacedOrder,
  unitMarkerOffset,
  unitMarkerSvg,
  withOrderEnd,
  withOrderParams,
  withOrderScale,
  type LatLng,
  type MilOrder,
  type MilOrderDef,
  type PlacedMilUnit,
} from "@acc/app6d/orders";
import { UnitSymbolPicker } from "@acc/unit-symbol-picker/react";
import type { Sidc } from "@acc/unit-symbol-picker";
import { DEFAULT_SIDC, formatSidc } from "@acc/unit-symbol-picker";

import {
  errorPanel,
  mapPanel,
  panelFigures,
  panelHeading,
  panelMuted,
  panelSeparator,
  surface,
} from "@/components/mapPanel";
import { DEFAULT_UNIT_SCALE, unitSizeForZoom } from "@/mil/unitScale";

/** Jotunheimen: steep enough that terrain and line of sight mean something. */
const SPAWN = { lat: 61.5, lon: 9.0, zoom: 11 };
const MARKER_SIZE = 34;

type Mode = "idle" | "placing" | "objective";

function CompositeDemoPage(): React.ReactElement {
  const [sidc, setSidc] = useState<Sidc>(DEFAULT_SIDC);
  const [units, setUnits] = useState<PlacedMilUnit[]>([]);
  const [orders, setOrders] = useState<MilOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<MilOrderDef | null>(null);
  const [mode, setMode] = useState<Mode>("placing");
  const [zoom, setZoom] = useState(SPAWN.zoom);
  // Units are sized from the zoom, so they scale with the order arrows
  // attached to them instead of staying one size while the graphics double.
  // See src/mil/unitScale for why a marker does not do this on its own.
  const unitSize = unitSizeForZoom(zoom, {
    base: MARKER_SIZE,
    ...DEFAULT_UNIT_SCALE,
  });
  const [buildings, setBuildings] = useState(false);
  const [textures, setTextures] = useState(true);
  const [overlay, setOverlay] = useState<"none" | "wet" | "choke" | "going">(
    "none",
  );
  const [census, setCensus] = useState<Record<string, SourceLayerCensus> | null>(
    null,
  );
  const [dem, setDem] = useState<DemSourceHandle | null>(null);
  const [profile, setProfile] = useState<ElevationProfile | null>(null);
  const [sight, setSight] = useState<SightResult | null>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  // The click handler is registered once, on a map that outlives every render,
  // so it reads live state through a ref rather than closing over stale props.
  // `placeOrder` goes in it too: it closes over `dem`, which is null on the
  // render that registers the handler and populated a moment later — captured
  // by value, the elevation half of this page would never run.
  const live = useRef<{
    units: PlacedMilUnit[];
    orders: MilOrder[];
    mode: Mode;
    pendingOrder: MilOrderDef | null;
    selectedId: string | null;
    sidc: Sidc;
    placeOrder: (
      map: maplibregl.Map,
      unit: PlacedMilUnit | null,
      order: MilOrderDef,
      destination: LatLng,
    ) => Promise<void>;
    commitOrders: (next: MilOrder[]) => void;
  }>(null as never);

  const orderCatalog = useMemo(() => defaultOrderCatalog(APP6D_CATALOG), []);
  const { profile: computeProfile, sight: computeSight } = useElevation({
    source: dem,
  });

  // ── The four packages, in one array ──────────────────────────────────────
  //
  // Created once: the extension list is read when the map is constructed, and a
  // fresh instance per render would claim the same layer ids and protocols.
  const elevationExt = useMemo(
    () =>
      elevation({
        terrain: { exaggeration: 1.4 },
        hillshade: true,
        // Contours come from the traced archives instead — see contoursExt
        // below. This is the raster fallback and it cannot be labelled.
        contours: false,
        sky: true,
        onReady: setDem,
      }),
    [],
  );
  const buildingsExt = useMemo(() => buildings3d({ visible: false }), []);
  // The three operational overlays. All hidden to begin with and toggled
  // imperatively, like the buildings: nothing here remounts the map.
  const wetExt = useMemo(() => wetGaps({ visible: false }), []);
  const chokeExt = useMemo(() => chokePoints({ visible: false }), []);
  const goingExt = useMemo(() => going({ visible: false }), []);
  // Ground colour and texture, on by default — unlike the three above this is
  // not an operational wash to be read one at a time, it is what the basemap
  // looks like. The toggle is the icons; the colour stays, including the
  // repainted `earth` under it. going()'s wash lands over both when it is on.
  const texturesExt = useMemo(() => landusePatterns({ ground: true }), []);
  // Traced contours, labelled, from one PMTiles per DEM cell. The last piece
  // of the topographic sheet: ground colour and texture underneath, relief
  // over it, contours with their heights on top.
  const contoursExt = useMemo(() => contourTiles(), []);

  // The four handle callbacks are what make a drawn order EDITABLE. Without
  // them the controller moves a handle live and the next update() snaps it back,
  // because the state it re-renders from never changed — which is exactly the
  // bug this page had. They are created once with the extension and read
  // current state through the ref, since the instance outlives every render.
  const graphicsExt = useMemo(
    () =>
      tacticGraphics({
        catalog: APP6D_CATALOG,
        orders: [],
        // Draped on the terrain rather than drawn over it. With the overlay the
        // graphics slid and resized as the camera rotated, because they were
        // fitted in screen pixels every frame; as GeoJSON layers MapLibre
        // renders them into the terrain texture, so they follow the ground,
        // foreshorten with pitch and hide behind the hill in front.
        renderer: "layers",
        layers: {
          // The basemap serves the Protomaps Noto bundle from a Foundry
          // dataset, so labels can be drawn. A host with no glyphs omits this
          // and gets geometry without text rather than nothing at all.
          textFont: ["Noto Sans Regular"],
        },
        onMoveEnd: (id, end, world) =>
          live.current.commitOrders(
            withOrderEnd(live.current.orders, id, end, world),
          ),
        onMilxParamsChange: (id, params) =>
          live.current.commitOrders(
            withOrderParams(live.current.orders, id, params),
          ),
        onScaleChange: (id, scale) =>
          live.current.commitOrders(
            withOrderScale(live.current.orders, id, scale),
          ),
        onRemove: (id) =>
          live.current.commitOrders(
            live.current.orders.filter((o) => o.id !== id),
          ),
      }),
    [],
  );
  const extensions = useMemo<BasemapExtension[]>(
    // Order is reading order among layers anchored at "labels": going under
    // the water under the choke points, relief under all of it, graphics on
    // top. The merge would throw on a collision, so this is checked rather
    // than hoped for.
    () => [
      elevationExt,
      goingExt,
      texturesExt,
      contoursExt,
      wetExt,
      chokeExt,
      buildingsExt,
      graphicsExt,
    ],
    [
      elevationExt,
      goingExt,
      texturesExt,
      contoursExt,
      wetExt,
      chokeExt,
      buildingsExt,
      graphicsExt,
    ],
  );

  // Both add-ons take their state imperatively, so nothing here remounts the
  // map: the tiles, the camera and the units all survive every toggle.
  useEffect(() => {
    buildingsExt.setVisible(buildings);
    mapRef.current?.easeTo({ pitch: buildings ? 55 : 40, duration: 500 });
  }, [buildings, buildingsExt]);

  useEffect(() => {
    texturesExt.setVisible(textures);
  }, [textures, texturesExt]);

  // Pinning happens HERE, where units and orders are both current: some edits
  // move an attached anchor without meaning to — the scale handle scales about
  // the render origin, a reshape can carry the first bend with it — and rather
  // than enumerate which ones are safe, every derivation re-asserts that an
  // attached order's anchor sits on its unit. It is idempotent and returns the
  // same array when nothing drifted.
  useEffect(() => {
    const map = mapRef.current;
    const pinned = map
      ? pinAttachedOrders({
          catalog: APP6D_CATALOG,
          orders,
          units,
          project: (p) => map.project([p.lng, p.lat]),
          zoom: map.getZoom(),
        })
      : orders;
    graphicsExt.update(pinned.map(toPlacedOrder));
  }, [orders, units, graphicsExt]);

  // One overlay at a time: three semi-transparent washes over each other is a
  // mess nobody can read, and the point of each is that it is the only thing
  // being asked about.
  useEffect(() => {
    wetExt.setVisible(overlay === "wet");
    chokeExt.setVisible(overlay === "choke");
    goingExt.setVisible(overlay === "going");
  }, [overlay, wetExt, chokeExt, goingExt]);

  /**
   * Commit an order edit. Deliberately just `setOrders`.
   *
   * The tempting version pins attached anchors here — and it is wrong on the
   * path that matters most. When a unit is dragged, this runs in the same tick
   * as the `setUnits` that moves it, so `pinAttachedOrders` would see the
   * unit's OLD position and drag the anchor straight back, undoing the drag it
   * was called to record. Pinning belongs where both units and orders are
   * current, which is when the graphics are derived below.
   */
  const commitOrders = useCallback((next: MilOrder[]) => {
    setOrders(next);
  }, []);

  // ── Units are DOM markers ────────────────────────────────────────────────
  // milsymbol draws them; MapLibre keeps them on the terrain surface.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {return;}

    for (const unit of units) {
      const existing = markersRef.current.get(unit.id);
      const selected = unit.id === selectedId;
      const svg = unitMarkerSvg(APP6D_CATALOG, unit.sidc, {
        size: unitSize,
        selected,
      });

      if (existing) {
        const el = existing.getElement();
        el.innerHTML = svg;
        el.style.filter = selected ? "drop-shadow(0 0 4px #7fb08c)" : "none";
        existing.setLngLat([unit.lng, unit.lat]);
        // In pixels, so it follows the size — otherwise the symbol slides off
        // its own ground point as it scales.
        existing.setOffset(
          unitMarkerOffset(APP6D_CATALOG, unit.sidc, { size: unitSize }),
        );
        continue;
      }

      const el = document.createElement("div");
      el.style.cursor = "pointer";
      el.style.lineHeight = "0";
      el.innerHTML = svg;
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelectedId(unit.id);
        setMode("idle");
      });

      const marker = new maplibregl.Marker({
        element: el,
        draggable: true,
        offset: unitMarkerOffset(APP6D_CATALOG, unit.sidc, {
          size: unitSize,
        }),
      })
        .setLngLat([unit.lng, unit.lat])
        // Terrain occlusion: fade a unit that is behind a ridge rather than
        // drawing it over the mountain in front of it. MapLibre applies this
        // itself once terrain is on, and it is the one part of "looks wrong in
        // 3D" that is a single call rather than a new renderer.
        .setOpacity("1", "0.25")
        .addTo(map);

      // Dragging a unit takes ONLY what is attached to it: an axis of advance
      // leaves the unit, so its start follows; a Destroy sits on the objective
      // and must not move. moveUnitOrders knows the difference from the
      // symbol's own declared anchor — rewriting `from` for everything would
      // walk each objective along with the unit.
      marker.on("dragend", () => {
        const at = marker.getLngLat();
        const position: LatLng = { lat: at.lat, lng: at.lng };
        setUnits((previous) =>
          previous.map((u) =>
            u.id === unit.id ? { ...u, lat: position.lat, lng: position.lng } : u,
          ),
        );
        commitOrders(
          moveUnitOrders({
            catalog: APP6D_CATALOG,
            orders: live.current.orders,
            unitId: unit.id,
            position,
            project: (p) => map.project([p.lng, p.lat]),
            zoom: map.getZoom(),
          }),
        );
      });

      markersRef.current.set(unit.id, marker);
    }

    for (const [id, marker] of markersRef.current) {
      if (!units.some((u) => u.id === id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [units, selectedId, commitOrders, unitSize]);

  // ── One click handler, three meanings ────────────────────────────────────
  const onMapReady = useCallback((map: maplibregl.Map, handle: BasemapHandle) => {
    mapRef.current = map;
    map.easeTo({ pitch: 40, duration: 0 });

    // What this archive actually holds, at this zoom, for the layers the
    // overlays read. They are only as good as the tiles: `landcover` stops at
    // z7, and a source-layer the cut dropped renders nothing while looking
    // exactly like a broken style. `idle` rather than `moveend` because the
    // census reads the tiles the map is holding, and straight after a pan
    // that is the old set.
    const takeCensus = () => {
      setZoom(map.getZoom());
      setCensus(describeOverlayLayers(map, handle.sourceId, { limit: 2000 }));
    };
    map.on("idle", takeCensus);
    // "zoom" as well as "moveend": the unit symbols are sized from this, and
    // they should track a pinch rather than jump when it finishes. The size is
    // rounded, so most frames set the same number and re-render nothing.
    map.on("moveend", () => setZoom(map.getZoom()));
    map.on("zoom", () => setZoom(map.getZoom()));

    map.on("click", (event) => {
      const at: LatLng = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      const state = live.current;

      if (state.mode === "placing") {
        setUnits((previous) => [
          ...previous,
          {
            id: newId(),
            label: `Unit ${previous.length + 1}`,
            // THE SEAM. The picker's structured SIDC becomes a string, and the
            // graphics package takes it from there. That is the whole bridge
            // between the two packages.
            sidc: formatSidc(state.sidc),
            lat: at.lat,
            lng: at.lng,
          },
        ]);
        return;
      }

      if (state.mode === "objective" && state.pendingOrder) {
        const unit =
          state.units.find((u) => u.id === state.selectedId) ?? null;
        void state.placeOrder(map, unit, state.pendingOrder, at);
      }
    });
  }, []);

  const placeOrder = async (
    map: maplibregl.Map,
    unit: PlacedMilUnit | null,
    order: MilOrderDef,
    destination: LatLng,
  ) => {
    const from: LatLng = unit
      ? { lat: unit.lat, lng: unit.lng }
      : destination;

    // resolveRoute is the injected-routing seam: with no router it draws a
    // straight line, and @acc/decho-elevation or a pathfinding graph plugs in
    // here without this page changing.
    const { route } = await resolveRoute(undefined, {
      from,
      to: destination,
      unit: unit ?? ({ id: "", label: "", sidc: "", lat: 0, lng: 0 } as PlacedMilUnit),
      order,
    });

    const assigned = assignOrder({
      catalog: APP6D_CATALOG,
      order,
      unit,
      destination,
      route,
      project: (p) => map.project([p.lng, p.lat]),
      unproject: (pt) => {
        const ll = map.unproject([pt.x, pt.y]);
        return { lat: ll.lat, lng: ll.lng };
      },
      zoom: map.getZoom(),
    });

    commitOrders([...live.current.orders, assigned]);
    setPendingOrder(null);
    setMode("idle");

    // ── And now the fourth package earns its place ─────────────────────────
    // The DEM that drew the terrain answers whether this order is even
    // sensible: the section under its axis, and whether the unit can see the
    // ground it has been told to take.
    if (dem && unit) {
      const [nextProfile, nextSight] = await Promise.all([
        computeProfile(
          [
            { lon: from.lng, lat: from.lat },
            { lon: destination.lng, lat: destination.lat },
          ],
          { samples: 240 },
        ),
        computeSight({
          from: { lon: from.lng, lat: from.lat },
          to: { lon: destination.lng, lat: destination.lat },
          observerHeight: 2,
          targetHeight: 2,
        }),
      ]);
      setProfile(nextProfile);
      setSight(nextSight);
    }
  };

  // Refreshed every render, read by the click handler registered once. See the
  // declaration above for why placeOrder is in here.
  live.current = {
    units,
    orders,
    mode,
    pendingOrder,
    selectedId,
    sidc,
    placeOrder,
    commitOrders,
  };

  const selected = units.find((u) => u.id === selectedId) ?? null;

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <DechoBasemap
        rid="ri.foundry.main.dataset.c7e99de1-90a4-4e22-bd26-b42316d70fe4"
        assetsRid="ri.foundry.main.dataset.8637f7a1-7503-459c-82c9-78e6ffa94e6e"
        spritePath="sprites/light"
        spawnLat={SPAWN.lat}
        spawnLong={SPAWN.lon}
        spawnZoom={SPAWN.zoom}
        extensions={extensions}
        onMapReady={onMapReady}
        toolbarItems={
          <>
            <MapToolbarButton
              label={mode === "placing" ? "Placing units" : "Place a unit"}
              active={mode === "placing"}
              onClick={() =>
                setMode((m) => (m === "placing" ? "idle" : "placing"))
              }
            >
              <PointIcon />
            </MapToolbarButton>
            <MapToolbarButton
              label={buildings ? "3D buildings: on" : "3D buildings: off"}
              active={buildings}
              onClick={() => setBuildings((on) => !on)}
            >
              <BuildingsIcon />
            </MapToolbarButton>
            <MapToolbarButton
              label={textures ? "Ground icons: on" : "Ground icons: off"}
              active={textures}
              onClick={() => setTextures((on) => !on)}
            >
              <TexturesIcon />
            </MapToolbarButton>

            {/*
              The three operational overlays, one at a time — three
              semi-transparent washes over each other is a mess nobody can read.
              Lettered rather than drawn: the basemap ships glyphs for its own
              tools, and inventing three more for wet gaps, bridges and going
              would be guessing at iconography a doctrine publication already
              has opinions about.
            */}
            {(
              [
                ["wet", "Wet gaps", "W"],
                ["choke", "Bridges & tunnels", "B"],
                ["going", "Going & cover", "G"],
              ] as const
            ).map(([key, label, letter]) => (
              <MapToolbarButton
                key={key}
                label={label}
                active={overlay === key}
                onClick={() => setOverlay((o) => (o === key ? "none" : key))}
              >
                <span style={{ font: "600 12px/1 sans-serif" }}>{letter}</span>
              </MapToolbarButton>
            ))}
          </>
        }
        style={{ height: "100%" }}
        renderError={(err) => {
          const { title, detail, remediation } = describeBasemapError(err);
          return (
            <div style={{ ...errorPanel, top: 56, left: 12, zIndex: 3 }}>
              <strong>{title}</strong>
              <div>{detail}</div>
              {remediation && <div style={{ marginTop: 8 }}>{remediation}</div>}
            </div>
          );
        }}
      />

      {/* @acc/unit-symbol-picker — what the next placed unit will be. */}
      <div style={{ ...mapPanel, top: 12, right: 12, width: 300, maxHeight: "45%", overflow: "auto" }}>
        <div style={panelHeading}>Unit to place</div>
        <div style={panelMuted}>
          The SIDC below becomes the unit&apos;s icon. One string is the whole
          bridge between the picker and the graphics.
        </div>
        <div style={panelSeparator} />
        <UnitSymbolPicker value={sidc} onChange={(next) => setSidc(next)} />
        <div style={panelFigures}>{formatSidc(sidc)}</div>
      </div>

      {/* The order workflow — deliberately tiny, to show the packages carry it. */}
      <div style={{ ...mapPanel, bottom: profile ? 190 : 12, left: 12, minWidth: 240 }}>
        <div style={panelHeading}>
          {selected ? selected.label : "No unit selected"}
        </div>
        <div style={panelMuted}>
          {mode === "placing" && "Click the map to place a unit"}
          {mode === "objective" && "Click the objective"}
          {mode === "idle" &&
            (selected ? "Give it an order" : "Click a unit, or place one")}
        </div>

        {selected && mode !== "objective" && (
          <>
            <div style={panelSeparator} />
            <select
              value=""
              onChange={(event) => {
                const order = orderCatalog.find(
                  (o) => o.id === event.target.value,
                );
                if (!order) {return;}
                setPendingOrder(order);
                setMode("objective");
              }}
              style={{
                background: "transparent",
                color: surface.text,
                border: `1px solid ${surface.border}`,
                borderRadius: 4,
                padding: "4px 6px",
                font: "12px/1.4 sans-serif",
              }}
            >
              <option value="">Assign an order…</option>
              {orderCatalog.slice(0, 40).map((order) => (
                <option key={order.id} value={order.id}>
                  {order.label}
                </option>
              ))}
            </select>
          </>
        )}

        <div style={panelSeparator} />
        <div style={panelFigures}>
          {units.length} unit{units.length === 1 ? "" : "s"} · {orders.length}{" "}
          order{orders.length === 1 ? "" : "s"} · z{zoom.toFixed(1)}
          {dem ? ` · DEM ${dem.stats().residentCells} cells` : " · DEM loading"}
        </div>

        {/*
          The census, which is the honest answer to "can this archive support
          these overlays". A zero here means the cut dropped that source-layer
          at this zoom and the overlay will draw nothing — which looks like a
          broken style and is not one. `landcover` is expected to be 0: the
          schema stops it at z7.
        */}
        {census && (
          <div style={panelFigures}>
            {["water", "roads", "landuse", "landcover"].map((layer) => (
              <div key={layer}>
                {layer}: {census[layer]?.features ?? 0}
                {census[layer]?.features
                  ? ` · ${Object.keys(census[layer].kinds).slice(0, 3).join(", ")}`
                  : " — nothing here"}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* @acc/decho-elevation, answering for what @acc/app6d drew. */}
      {profile && (
        <div style={{ ...mapPanel, bottom: 12, left: 12, right: 12, padding: 8 }}>
          <TerrainProfile
            profile={profile}
            sight={sight}
            height={140}
            groundColour="#3c4a3f"
            lineColour="#9fc4a8"
            style={{ color: surface.text }}
          />
        </div>
      )}
    </div>
  );
}

export default CompositeDemoPage;
