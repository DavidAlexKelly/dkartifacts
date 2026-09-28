/**
 * <MilMap /> — a Foundry-served basemap that units are placed on and
 * orders assigned from, as one tag.
 *
 *   <MilMap
 *     unitTemplates={TEMPLATES}
 *     units={units} orders={orders}
 *     onUnitsChange={setUnits} onOrdersChange={setOrders}
 *   />
 *
 * Right-click empty map to place a unit; right-click a unit to give it an
 * order, then click the objective. Drag units to move them (their orders
 * follow); drag an order's handles to shape the graphic. Escape cancels.
 *
 * Everything else is @acc/decho-basemap's: tiles, glyphs and sprites come from
 * Foundry datasets, so this makes no external network calls either. All of its
 * props are accepted here and passed through — `tiles`, `assets`, `flavor`,
 * `lang`, `spawnLat/Long/Zoom`, `globe`, and so on — except the drawing tools,
 * which are deliberately not available (see useMilMap).
 *
 * ESCAPE HATCHES
 * --------------
 *   onMapReady={(map) => ...}   the real maplibregl.Map, once per mount
 *   useMilMap(ref, options)     same behaviour, your own container and menus
 *   children                    rendered above the canvas, below the menus
 */

import React, { useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

import { useMilMap, type UseMilMapOptions } from "./useMilMap";
import {
  OrderPickerMenu,
  PendingBanner,
  UnitMenu,
  MapMenu,
  UnitPaletteMenu,
} from "./menus";
import { DEFAULT_MENU_THEME, type MenuTheme } from "./theme";

export interface MilMapProps extends UseMilMapOptions {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  /** Colours for the built-in menus. Replace the menus entirely via useMilMap. */
  menuTheme?: MenuTheme;
  /** Rendered over the map while a basemap archive is downloading. */
  renderLoading?: (path: string) => React.ReactNode;
  /** Rendered instead of the map if the basemap fails to set up. */
  renderError?: (error: Error) => React.ReactNode;
}

export function MilMap({
  className,
  style,
  children,
  menuTheme = DEFAULT_MENU_THEME,
  renderLoading,
  renderError,
  ...options
}: MilMapProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mil = useMilMap(containerRef, options);
  const { menu, interaction } = mil;

  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", ...style }}
    >
      {/*
        Absolutely positioned rather than 100%/100%, for the same reason
        <DechoBasemap/> does it: a percentage height only resolves against a
        parent with a DEFINITE height, and MapLibre measures its container
        once. A host that sizes this from content would otherwise get a map
        that loads every tile correctly and displays nothing.
      */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {mil.error && renderError?.(mil.error)}
      {mil.loading && renderLoading?.(mil.loading)}

      {children}

      {interaction.kind === "awaitingObjective" && (
        <PendingBanner
          theme={menuTheme}
          text={`${interaction.order.label}: click the objective for ${interaction.unit.label}`}
        />
      )}
      {interaction.kind === "routing" && (
        <PendingBanner theme={menuTheme} text="Routing…" />
      )}

      {menu?.kind === "map" && (
        <MapMenu
          x={menu.x}
          y={menu.y}
          theme={menuTheme}
          onAddUnit={() => mil.openUnitPicker(menu.at, menu.x, menu.y)}
          onAddOrder={() => mil.openOrderPickerAt(menu.at, menu.x, menu.y)}
        />
      )}

      {menu?.kind === "units" && (
        <UnitPaletteMenu
          x={menu.x}
          y={menu.y}
          theme={menuTheme}
          templates={options.unitTemplates}
          onPick={(template) => mil.placeUnit(template, menu.at)}
        />
      )}

      {menu?.kind === "unit" && (
        <UnitMenu
          x={menu.x}
          y={menu.y}
          theme={menuTheme}
          unit={menu.unit}
          orderCount={
            options.orders.filter((o) => o.unitId === menu.unit.id).length
          }
          onAssignOrder={() => mil.openOrderPicker(menu.unit, menu.x, menu.y)}
          onClearOrders={() =>
            options.onOrdersChange(
              options.orders.filter((o) => o.unitId !== menu.unit.id),
            )
          }
          onRemoveUnit={() => mil.removeUnit(menu.unit.id)}
        />
      )}

      {menu?.kind === "orders" && (
        <OrderPickerMenu
          x={menu.x}
          y={menu.y}
          theme={menuTheme}
          unit={menu.unit}
          orders={mil.orderCatalog}
          onPick={(order) => {
            // With a unit, the pick starts the two-click flow: the user still
            // has to say where the objective is. Without one, the position is
            // already known — it is where they right-clicked — so the order is
            // placed there and then.
            if (menu.unit) {
              mil.beginOrder(menu.unit, order);
            } else if (menu.at) {
              mil.placeOrderAt(order, menu.at);
            }
          }}
        />
      )}
    </div>
  );
}
