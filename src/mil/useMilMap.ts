/**
 * useMilMap — units, orders and the right-click interaction model on top of a
 * Foundry-served basemap.
 *
 * <MilMap/> is a thin wrapper over this. Use the hook directly when you
 * want to render your own menus, or drive the map from your own UI, and still
 * have the marker lifecycle, the order overlay and the state machine handled.
 *
 * The interaction model, deliberately narrow:
 *
 *   right-click empty map   → Add unit  → unit palette → placed there
 *                           → Add order → order list   → placed there, no unit
 *   right-click a unit      → Assign order → order list → click an objective
 *   drag a unit             → moves the unit and its attached orders
 *   drag an order's handles → edits the graphic (the library owns this)
 *   Escape                  → cancels whatever is pending
 *
 * There is still no free-DRAWING mode — no lasso, no freehand shape with no
 * meaning behind it. An unassigned order is not that: it is a doctrinal
 * graphic, from the same catalog, that happens to belong to the ground rather
 * than to a unit. Planning needs those — a phase line exists before anybody is
 * allocated to it — and the alternative is inventing a unit to hang them on.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

import { useBasemap, type UseBasemapOptions } from "@acc/decho-basemap/react";
import type { BasemapHandle } from "@acc/decho-basemap";
import { APP6D_CATALOG } from "@acc/app6d/symbols";
import type { SymbolCatalog } from "@acc/app6d/engine";
import { useTacticGraphics } from "@acc/app6d/react";

import {
  DEFAULT_UNIT_SCALE,
  unitSizeForZoom,
  type UnitScaleOptions,
} from "./unitScale";
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
  type OrderRouter,
  type PlacedMilUnit,
  type UnitTemplate,
} from "@acc/app6d/orders";

/** What the map is waiting for, if anything. */
export type MilInteraction =
  | { kind: "idle" }
  | { kind: "awaitingObjective"; unit: PlacedMilUnit; order: MilOrderDef }
  | { kind: "routing"; unit: PlacedMilUnit; order: MilOrderDef };

/** Which menu is open, and where. Screen coordinates, container-relative. */
export type MilMenu =
  | null
  /** Right-click on empty map: add a unit, or add an order with no unit. */
  | { kind: "map"; x: number; y: number; at: LatLng }
  | { kind: "units"; x: number; y: number; at: LatLng }
  | { kind: "unit"; x: number; y: number; unit: PlacedMilUnit }
  /**
   * The order list, reached two ways. With a `unit` it assigns — the graphic
   * attaches to that unit's anchor and follows it. With an `at` and no unit it
   * places the order on the ground at that point, where its anchor behaves as
   * an ordinary handle. Same list, because it is the same catalog.
   */
  | {
      kind: "orders";
      x: number;
      y: number;
      unit: PlacedMilUnit | null;
      at: LatLng | null;
    };

export interface UseMilMapOptions
  extends Omit<UseBasemapOptions, "drawingTools" | "onDrawChange"> {
  /** Symbol catalog. Defaults to the library's built-in APP-6D set. */
  catalog?: SymbolCatalog;

  /** What right-click-to-place offers. Domain data: no sensible default. */
  unitTemplates: UnitTemplate[];
  /** What right-click-a-unit offers. Defaults to the doctrinal task catalog. */
  orderCatalog?: MilOrderDef[];

  /** Controlled state. */
  units: PlacedMilUnit[];
  orders: MilOrder[];
  onUnitsChange: (units: PlacedMilUnit[]) => void;
  onOrdersChange: (orders: MilOrder[]) => void;

  /** Optional real routing. Omitted, orders follow a straight line. */
  router?: OrderRouter;

  selectedUnitId?: string | null;
  onSelectUnit?: (unitId: string | null) => void;

  /** Fired after an order is assigned, for toasts, telemetry or persistence. */
  onOrderAssigned?: (order: MilOrder, meta: { routeFallback: boolean }) => void;
  /** Fired after a unit is placed. */
  onUnitPlaced?: (unit: PlacedMilUnit) => void;

  /**
   * Icon size in px AT THE ANCHOR ZOOM. Default 26.
   *
   * Units scale with the map from here — see `unitScale`, and ./unitScale for
   * why a marker does not do that on its own.
   */
  markerSize?: number;
  /**
   * How the unit symbols scale with zoom.
   *
   * Defaults to ground-fixed within legible bounds, so a unit grows with the
   * order arrow attached to it instead of staying the same size while the
   * graphic around it doubles. Pass `null` for the old behaviour: one size at
   * every zoom.
   */
  unitScale?: Omit<UnitScaleOptions, "base"> | null;
  /** Colour for orders whose catalog entry carries none. */
  orderColour?: string;
  /** Set false to make the map read-only: no menus, no drags, no handles. */
  editable?: boolean;
}

export interface UseMilMapResult {
  map: maplibregl.Map | null;
  basemap: BasemapHandle | null;
  loading: string | null;
  error: Error | null;
  interaction: MilInteraction;
  menu: MilMenu;
  /** Resolved order list — the prop, or the doctrinal default. */
  orderCatalog: MilOrderDef[];
  /** The palette, passed straight back so menus have one place to read from. */
  unitTemplates: UnitTemplate[];
  closeMenu: () => void;
  cancel: () => void;
  /** Actions, exposed so a host can build its own menus over this hook. */
  placeUnit: (template: UnitTemplate, at: LatLng) => void;
  beginOrder: (unit: PlacedMilUnit, order: MilOrderDef) => void;
  openOrderPicker: (unit: PlacedMilUnit, x: number, y: number) => void;
  /** Second level of the empty-map menu: the unit palette. */
  openUnitPicker: (at: LatLng, x: number, y: number) => void;
  /** Second level of the empty-map menu: the order list, with no unit. */
  openOrderPickerAt: (at: LatLng, x: number, y: number) => void;
  /** Place an order on the ground, unassigned. One click. */
  placeOrderAt: (order: MilOrderDef, at: LatLng) => void;
  removeUnit: (unitId: string) => void;
  removeOrder: (orderId: string) => void;
}

export function useMilMap(
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseMilMapOptions,
): UseMilMapResult {
  const {
    catalog = APP6D_CATALOG,
    orderCatalog: orderCatalogProp,
    units,
    orders,
    onUnitsChange,
    onOrdersChange,
    router,
    selectedUnitId = null,
    onSelectUnit,
    onOrderAssigned,
    onUnitPlaced,
    markerSize = 26,
    unitScale = DEFAULT_UNIT_SCALE,
    orderColour = "#DC3232",
    editable = true,
    unitTemplates,
    ...basemapOptions
  } = options;

  /**
   * The size unit symbols are drawn at, which follows the zoom.
   *
   * Stored rounded, so a pinch re-renders the markers only when the size
   * actually changes by a pixel rather than on every frame.
   */
  const [unitSize, setUnitSize] = useState(() =>
    unitScale
      ? unitSizeForZoom(unitScale.anchorZoom, { base: markerSize, ...unitScale })
      : markerSize,
  );

  const [interaction, setInteraction] = useState<MilInteraction>({
    kind: "idle",
  });
  const [menu, setMenu] = useState<MilMenu>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Everything the map's own listeners read. They are registered once, on a
  // map that outlives any given render, so reading props directly would pin
  // them to the first render's values — the classic stale-closure map bug.
  const live = useRef({
    units,
    orders,
    interaction,
    editable,
    catalog,
    router,
    orderColour,
    onUnitsChange,
    onOrdersChange,
    onSelectUnit,
    onOrderAssigned,
    onUnitPlaced,
  });
  live.current = {
    units,
    orders,
    interaction,
    editable,
    catalog,
    router,
    orderColour,
    onUnitsChange,
    onOrdersChange,
    onSelectUnit,
    onOrderAssigned,
    onUnitPlaced,
  };

  const orderCatalog = useMemo(
    () => orderCatalogProp ?? defaultOrderCatalog(catalog),
    [orderCatalogProp, catalog],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const cancel = useCallback(() => {
    setInteraction({ kind: "idle" });
    setMenu(null);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const placeUnit = useCallback((template: UnitTemplate, at: LatLng) => {
    const unit: PlacedMilUnit = {
      id: newId(),
      templateId: template.id,
      label: template.label,
      sidc: template.sidc,
      lat: at.lat,
      lng: at.lng,
    };
    live.current.onUnitsChange([...live.current.units, unit]);
    live.current.onUnitPlaced?.(unit);
    setMenu(null);
  }, []);

  const beginOrder = useCallback(
    (unit: PlacedMilUnit, order: MilOrderDef) => {
      setMenu(null);
      setInteraction({ kind: "awaitingObjective", unit, order });
    },
    [],
  );

  const openOrderPicker = useCallback(
    (unit: PlacedMilUnit, x: number, y: number) =>
      setMenu({ kind: "orders", x, y, unit, at: null }),
    [],
  );

  /** The unit palette, from the first level of the empty-map menu. */
  const openUnitPicker = useCallback(
    (at: LatLng, x: number, y: number) => setMenu({ kind: "units", x, y, at }),
    [],
  );

  /**
   * The order list with no unit behind it: whatever is picked is placed at
   * `at`, belonging to the ground.
   */
  const openOrderPickerAt = useCallback(
    (at: LatLng, x: number, y: number) =>
      setMenu({ kind: "orders", x, y, unit: null, at }),
    [],
  );



  const removeUnit = useCallback((unitId: string) => {
    live.current.onUnitsChange(
      live.current.units.filter((u) => u.id !== unitId),
    );
    // Orders belong to units, so a unit's removal takes its orders with it.
    // Leaving them would strand graphics whose `from` end nothing can move.
    live.current.onOrdersChange(
      live.current.orders.filter((o) => o.unitId !== unitId),
    );
    setMenu(null);
  }, []);

  const removeOrder = useCallback((orderId: string) => {
    live.current.onOrdersChange(
      live.current.orders.filter((o) => o.id !== orderId),
    );
    setMenu(null);
  }, []);

  /** Finish an assignment: route, build the graphic, hand it back. */
  const completeOrder = useCallback(
    async (
      unit: PlacedMilUnit | null,
      order: MilOrderDef,
      objective: LatLng,
    ) => {
      const map = mapRef.current;
      if (!map) {
        return;
      }
      // An unassigned order has no unit to travel from, so there is no route to
      // resolve and nothing to wait for: the point picked IS the graphic's
      // position. Routing it from itself would ask the router a meaningless
      // question and show a "Routing…" banner for a placement that is already
      // finished.
      const unrouted = { waypoints: [[objective.lat, objective.lng]] as [number, number][] };
      if (unit !== null) {
        setInteraction({ kind: "routing", unit, order });
      }

      const { route, fallback } =
        unit === null
          ? { route: unrouted, fallback: false }
          : await resolveRoute(live.current.router, {
              from: { lat: unit.lat, lng: unit.lng },
              to: objective,
              unit,
              order,
            });

      const assigned = assignOrder({
        catalog: live.current.catalog,
        order,
        unit,
        destination: objective,
        route,
        zoom: map.getZoom(),
        colour: live.current.orderColour,
        project: (p) => {
          const point = map.project([p.lng, p.lat]);
          return { x: point.x, y: point.y };
        },
        unproject: (point) => {
          const lngLat = map.unproject([point.x, point.y]);
          return { lat: lngLat.lat, lng: lngLat.lng };
        },
        id: newId(),
      });

      live.current.onOrdersChange([...live.current.orders, assigned]);
      live.current.onOrderAssigned?.(assigned, { routeFallback: fallback });
      setInteraction({ kind: "idle" });
    },
    [],
  );

  /**
   * Place an order on the ground, with no unit.
   *
   * One click, not two: the position came from the right-click that opened the
   * menu, so there is no second point to ask for. Assigning to a unit is the
   * two-click case because the unit supplies one end and the user the other —
   * here the user has already given the only end there is, and the graphic's
   * own handles are how it gets shaped from there.
   */
  const placeOrderAt = useCallback(
    (order: MilOrderDef, at: LatLng) => {
      setMenu(null);
      void completeOrder(null, order, at);
    },
    [completeOrder],
  );

  // ── The map ───────────────────────────────────────────────────────────────

  const hostOnMapReady = basemapOptions.onMapReady;

  const handleMapReady = useCallback(
    (map: maplibregl.Map, basemapHandle: BasemapHandle) => {
      mapRef.current = map;

      map.on("contextmenu", (e) => {
        if (!live.current.editable) {
          return;
        }
        // Right-clicking a unit is handled on the marker element, which stops
        // propagation — so reaching here means the click was on empty map.
        e.preventDefault();
        // The first level: add a unit here, or add an order here with no unit
        // behind it. It used to open the unit palette directly, which made
        // placing a control measure impossible without a unit to hang it on.
        setMenu({
          kind: "map",
          x: e.point.x,
          y: e.point.y,
          at: { lat: e.lngLat.lat, lng: e.lngLat.lng },
        });
      });

      map.on("click", (e) => {
        setMenu(null);
        const current = live.current.interaction;
        if (current.kind === "awaitingObjective") {
          void completeOrder(current.unit, current.order, {
            lat: e.lngLat.lat,
            lng: e.lngLat.lng,
          });
          return;
        }
        live.current.onSelectUnit?.(null);
      });

      hostOnMapReady?.(map, basemapHandle);
    },
    [completeOrder, hostOnMapReady],
  );

  const {
    map,
    globe: basemap,
    loading,
    error,
  } = useBasemap(containerRef, {
    ...basemapOptions,
    onMapReady: handleMapReady,
    // Never enabled: this map's graphics belong to units, and a free-drawn
    // shape would be a fourth kind of state with no owner.
    drawingTools: false,
  });

  // Escape cancels. Registered on the window rather than the map because the
  // menus are DOM overlays: the map may not have focus when the user gives up.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancel();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [cancel]);

  // Crosshair while an objective is awaited, so the mode is visible.
  useEffect(() => {
    if (!map) {
      return;
    }
    map.getCanvas().style.cursor =
      interaction.kind === "awaitingObjective" ? "crosshair" : "";
  }, [map, interaction.kind]);

  // ── Unit markers ──────────────────────────────────────────────────────────

  const markersRef = useRef(new Map<string, maplibregl.Marker>());

  // Follow the zoom, so the symbols can be sized from it. On `zoom` rather
  // than `zoomend`: the size should track a pinch, not jump when it finishes.
  // unitSizeForZoom rounds, and setState with an unchanged number re-renders
  // nothing, so this is cheap despite firing per frame.
  useEffect(() => {
    if (!map || !unitScale) {
      return;
    }
    const scale = { base: markerSize, ...unitScale };
    const follow = () => setUnitSize(unitSizeForZoom(map.getZoom(), scale));

    follow();
    map.on("zoom", follow);
    return () => {
      map.off("zoom", follow);
    };
  }, [map, markerSize, unitScale]);

  useEffect(() => {
    if (!map) {
      return;
    }
    const markers = markersRef.current;
    const seen = new Set<string>();

    for (const unit of units) {
      seen.add(unit.id);
      const selected = unit.id === selectedUnitId;
      const existing = markers.get(unit.id);

      if (existing) {
        existing.setLngLat([unit.lng, unit.lat]);
        // The offset positions the symbol's anchor over the ground point, and
        // it is in pixels — so it has to be recomputed with the size or the
        // symbol slides off its own location as it scales.
        existing.setOffset(
          unitMarkerOffset(catalog, unit.sidc, { size: unitSize }),
        );
        // Update in place: replaceWith() would detach the element MapLibre
        // holds a reference to, and the marker would stop tracking the map.
        const el = existing.getElement();
        el.innerHTML = unitMarkerSvg(catalog, unit.sidc, {
          size: unitSize,
          selected,
        });
        el.style.filter = selected ? "drop-shadow(0 0 4px #4fc3f7)" : "none";
        existing.setDraggable(editable);
        continue;
      }

      const el = document.createElement("div");
      el.style.cursor = "pointer";
      el.style.lineHeight = "0";
      el.innerHTML = unitMarkerSvg(catalog, unit.sidc, {
        size: unitSize,
        selected,
      });
      el.style.filter = selected ? "drop-shadow(0 0 4px #4fc3f7)" : "none";

      el.addEventListener("click", (event) => {
        event.stopPropagation();
        const latest = live.current.units.find((u) => u.id === unit.id);
        const current = live.current.interaction;
        // Clicking a unit while an objective is awaited means "order this one
        // onto that unit" — deliberately allowed: attacking, supporting or
        // relieving another unit is the common case, and forcing the user to
        // click next to it would be worse than useless.
        if (current.kind === "awaitingObjective" && latest) {
          void completeOrder(current.unit, current.order, {
            lat: latest.lat,
            lng: latest.lng,
          });
          return;
        }
        live.current.onSelectUnit?.(unit.id);
      });

      el.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!live.current.editable) {
          return;
        }
        const latest = live.current.units.find((u) => u.id === unit.id);
        if (!latest) {
          return;
        }
        const rect = map.getContainer().getBoundingClientRect();
        setMenu({
          kind: "unit",
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          unit: latest,
        });
      });

      const marker = new maplibregl.Marker({
        element: el,
        draggable: editable,
        offset: unitMarkerOffset(catalog, unit.sidc, { size: unitSize }),
      })
        .setLngLat([unit.lng, unit.lat])
        .addTo(map);

      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        live.current.onUnitsChange(
          live.current.units.map((u) =>
            u.id === unit.id ? { ...u, lat, lng } : u,
          ),
        );
        // Only the attached END follows — an axis of advance keeps its
        // objective where it was and simply gets longer or shorter. Orders
        // placed ON an objective do not move at all.
        const moved = moveUnitOrders({
          catalog: live.current.catalog,
          orders: live.current.orders,
          unitId: unit.id,
          position: { lat, lng },
          project: (p) => {
            const point = map.project([p.lng, p.lat]);
            return { x: point.x, y: point.y };
          },
          zoom: map.getZoom(),
        });
        if (moved !== live.current.orders) {
          live.current.onOrdersChange(moved);
        }
      });

      markers.set(unit.id, marker);
    }

    for (const [id, marker] of markers) {
      if (!seen.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }
  }, [map, units, selectedUnitId, catalog, unitSize, editable, completeOrder]);

  // Markers are DOM this hook owns, not part of MapLibre's style, so removing
  // the map is not by itself enough to take them with it.
  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const marker of markers.values()) {
        marker.remove();
      }
      markers.clear();
    };
  }, []);

  // ── Order graphics ────────────────────────────────────────────────────────

  const placedOrders = useMemo(() => orders.map(toPlacedOrder), [orders]);

  /**
   * Every order edit goes through here, so the "an attached order's anchor is
   * on its unit" invariant is re-asserted after all of them rather than after
   * the ones somebody remembered. Scaling and reshaping both move the anchor
   * as a side effect; without this the graphic quietly parts company with the
   * unit it belongs to.
   */
  const commitOrders = useCallback((next: MilOrder[]) => {
    const currentMap = mapRef.current;
    live.current.onOrdersChange(
      currentMap
        ? pinAttachedOrders({
            catalog: live.current.catalog,
            orders: next,
            units: live.current.units,
            zoom: currentMap.getZoom(),
            project: (p) => {
              const point = currentMap.project([p.lng, p.lat]);
              return { x: point.x, y: point.y };
            },
          })
        : next,
    );
  }, []);

  useTacticGraphics(catalog, map, placedOrders, {
    editable,
    onMoveEnd: (id, end, world) =>
      commitOrders(withOrderEnd(live.current.orders, id, end, world)),
    onMilxParamsChange: (id, params) =>
      commitOrders(withOrderParams(live.current.orders, id, params)),
    onScaleChange: (id, scale) =>
      commitOrders(withOrderScale(live.current.orders, id, scale)),
    onRemove: (id) =>
      live.current.onOrdersChange(
        live.current.orders.filter((o) => o.id !== id),
      ),
  });

  return {
    map,
    basemap,
    loading,
    error,
    interaction,
    menu,
    orderCatalog,
    unitTemplates,
    closeMenu,
    cancel,
    placeUnit,
    beginOrder,
    openOrderPicker,
    openUnitPicker,
    openOrderPickerAt,
    placeOrderAt,
    removeUnit,
    removeOrder,
  };
}
