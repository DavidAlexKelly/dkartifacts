/**
 * <DechoBasemap /> — a Foundry-served offline basemap as one tag.
 *
 *   <DechoBasemap />                                   preset planet basemap
 *   <DechoBasemap spawnLat={48.85} spawnLong={2.35} spawnZoom={12} />
 *   <DechoBasemap rid={datasetRid} assetsRid={glyphsRid} />
 *
 * Everything is optional. `rid` points at a dataset holding manifest.json and
 * the PMTiles chunks; `spawnLat` / `spawnLong` / `spawnZoom` set the opening
 * view. For anything more elaborate — media sets, the fixed-grid scheme, a
 * custom manifest path — pass `tiles` instead.
 *
 * ESCAPE HATCHES
 * --------------
 * A map component that hides its map is useless for real work, so there are
 * two ways out:
 *
 *   onMapReady={(map) => ...}   — the real maplibregl.Map, once per mount
 *   ref                        — { map, globe } imperatively
 *
 * Use either to add sources, layers, DOM markers, drawing tools, click
 * handling or overlays exactly as you would with a hand-built map. Children
 * are rendered above the canvas, so HUDs and controls compose normally.
 */

import { forwardRef, useImperativeHandle, useRef, type ReactElement } from "react";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  useBasemap,
  type UseBasemapOptions,
} from "./useBasemap.js";
import {
  ClearIcon,
  LineIcon,
  PointIcon,
  PolygonIcon,
  RectangleIcon,
  RemoveIcon,
  SelectIcon,
} from "./DrawingIcons.js";
import { MapToolbarButton } from "./MapToolbarButton.js";
import {
  DEFAULT_SURFACE_THEME,
  toolbarSeparator,
  toolbarSurface,
  type SurfaceTheme,
} from "./theme.js";
import type { DrawMode, DrawingToolsState } from "./useDrawingTools.js";
import type { BasemapHandle } from "../core/basemap.js";

export interface DechoBasemapProps extends UseBasemapOptions {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  /** Rendered over the map while an archive is downloading. */
  renderLoading?: (path: string) => React.ReactNode;
  /** Rendered instead of the map if setup fails. */
  renderError?: (error: Error) => React.ReactNode;
  /**
   * Colours for the toolbar. Spread over DEFAULT_SURFACE_THEME, so overriding
   * one value keeps the rest.
   *
   *   drawingToolbarTheme={{ accent: "#c8a94a" }}
   */
  drawingToolbarTheme?: Partial<SurfaceTheme>;
  /**
   * Controls appended to the end of the toolbar, after a separator.
   *
   *   toolbarItems={
   *     <MapToolbarButton label="3D buildings" active={on} onClick={toggle}>
   *       <BuildingsIcon />
   *     </MapToolbarButton>
   *   }
   *
   * This is where an add-on's own switch belongs: beside the map controls
   * rather than in a panel of its own in another corner. The bar renders for
   * these even when `drawingTools` is off, so a map with no drawing still gets
   * one tidy strip of controls instead of a floating orphan.
   */
  toolbarItems?: React.ReactNode;
}

export interface DechoBasemapRef {
  map: maplibregl.Map | null;
  globe: BasemapHandle | null;
  /** Drawn features, current mode, and the delete/cancel actions. */
  drawing: DrawingToolsState;
}

/**
 * Default toolbar for `drawingTools`.
 *
 * ICONS, NOT WORDS
 * ----------------
 * A word-per-tool toolbar is five different widths, wraps at the first
 * translation, and takes a third of the top of the map to say things the
 * shapes say better. Each button is now a 16-pixel glyph drawn in
 * ./DrawingIcons — hand-drawn `<path>` elements rather than an icon set,
 * because this package has no icon dependency and the CI code scan blocks
 * `dangerouslySetInnerHTML`, so a string of SVG is not an option either.
 *
 * Every button keeps an `aria-label` and a `title`, so the words are still
 * there for a screen reader and one hover away for everyone else. An icon-only
 * toolbar without them is a guessing game.
 *
 * Colours come from DEFAULT_SURFACE_THEME and can be overridden per map with
 * the `drawingToolbarTheme` prop — the same pattern as the mil menus'
 * `menuTheme`. Replace the toolbar entirely by dropping to
 * `useBasemap` and rendering your own controls against the `drawing` state.
 */
function MapToolbar({
  drawing,
  drawingTools,
  items,
  theme,
}: {
  drawing: DrawingToolsState;
  drawingTools: boolean;
  items?: React.ReactNode;
  theme: SurfaceTheme;
}) {
  const modes: { id: DrawMode; label: string; icon: ReactElement }[] = [
    { id: "select", label: "Select", icon: <SelectIcon /> },
    { id: "point", label: "Point", icon: <PointIcon /> },
    { id: "line", label: "Line", icon: <LineIcon /> },
    { id: "polygon", label: "Polygon", icon: <PolygonIcon /> },
    { id: "rectangle", label: "Rectangle", icon: <RectangleIcon /> },
  ];

  return (
    <div style={{ ...toolbarSurface(theme), ...toolbarPosition }}>
      {drawingTools && (
        <>
          {modes.map((m) => (
            <MapToolbarButton
              key={m.id}
              label={m.label}
              active={drawing.mode === m.id}
              onClick={() => drawing.setMode(m.id)}
              theme={theme}
            >
              {m.icon}
            </MapToolbarButton>
          ))}

          <span style={toolbarSeparator(theme)} />

          <MapToolbarButton
            label="Delete selected"
            onClick={drawing.deleteSelected}
            disabled={!drawing.selectedId}
            theme={theme}
          >
            <RemoveIcon />
          </MapToolbarButton>
          <MapToolbarButton
            label="Clear all"
            onClick={drawing.deleteAll}
            theme={theme}
          >
            <ClearIcon />
          </MapToolbarButton>
        </>
      )}

      {/*
        Host items go on the END, behind a separator — and the separator is only
        drawn when there is something to separate them from, so a map with
        `toolbarItems` and no drawing tools gets a clean bar of just its own
        controls rather than one with a rule floating at the front.
      */}
      {items && (
        <>
          {drawingTools && <span style={toolbarSeparator(theme)} />}
          {items}
        </>
      )}

      {drawing.drawing && (
        <span
          style={{
            font: "11px/1.6 sans-serif",
            color: theme.muted,
            padding: "0 8px 0 4px",
          }}
        >
          double-click or Enter to finish · Backspace undoes · Esc cancels
        </span>
      )}
    </div>
  );
}

const toolbarPosition: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  zIndex: 2,
};

export const DechoBasemap = forwardRef<DechoBasemapRef, DechoBasemapProps>(
  function DechoBasemap(
    {
      className,
      style,
      children,
      renderLoading,
      renderError,
      drawingToolbarTheme,
      toolbarItems,
      ...options
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const { map, globe, loading, error, drawing } = useBasemap(
      containerRef,
      options,
    );

    useImperativeHandle(ref, () => ({ map, globe, drawing }), [
      map,
      globe,
      drawing,
    ]);

    return (
      <div
        className={className}
        style={{ position: "relative", width: "100%", height: "100%", ...style }}
      >
        {/*
        Absolutely positioned, NOT width/height 100%.

        A percentage height only resolves against a parent with a DEFINITE
        height. Hosts routinely give the wrapper `min-height: 100vh`, or drop
        it in a flex/grid cell, or size it from its content — in all of those
        the parent's height is auto, `height: 100%` computes to 0, and the map
        container is zero-height. MapLibre measures its container when the Map
        is constructed and does not re-measure on its own, so the result is a
        map that loads tiles perfectly and displays nothing at all.

        `position: absolute; inset: 0` fills the relatively-positioned wrapper
        whatever established its size, definite or not.
      */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        {(options.drawingTools || toolbarItems) && (
          <MapToolbar
            drawing={drawing}
            drawingTools={Boolean(options.drawingTools)}
            items={toolbarItems}
            theme={{ ...DEFAULT_SURFACE_THEME, ...drawingToolbarTheme }}
          />
        )}
        {error && renderError?.(error)}
        {loading && renderLoading?.(loading)}
        {children}
      </div>
    );
  },
);
