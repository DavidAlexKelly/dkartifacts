export {
  DechoBasemap,
  type DechoBasemapProps,
  type DechoBasemapRef,
} from "./DechoBasemap";

export {
  useBasemap,
  type UseBasemapOptions,
  type UseBasemapResult,
} from "./useBasemap";

export {
  useDrawingTools,
  type DrawMode,
  type DrawingToolsState,
} from "./useDrawingTools";

// The toolbar's colours and metrics. Exported so a host's own map panels and
// toolbar controls match the library's rather than approximating them — one
// palette across the estate, shared with the mil menus' DEFAULT_MENU_THEME
// (src/mil/theme.ts in the harness app).
export {
  DEFAULT_SURFACE_THEME,
  toolbarButton,
  toolbarSeparator,
  toolbarSurface,
  type SurfaceTheme,
} from "./theme";

// A button for the end of the toolbar, via <DechoBasemap toolbarItems={...} />.
export {
  MapToolbarButton,
  type MapToolbarButtonProps,
} from "./MapToolbarButton";

// The toolbar's glyphs, for anyone replacing the toolbar but keeping the
// iconography.
export {
  BuildingsIcon,
  ClearIcon,
  LineIcon,
  PointIcon,
  PolygonIcon,
  RectangleIcon,
  RemoveIcon,
  SelectIcon,
  TexturesIcon,
  type IconProps,
} from "./DrawingIcons";

export {
  MAP_STYLES,
  resolveAssetStore,
  resolveTileStore,
  resolveView,
  spritePathForStyle,
  type MapStyleName,
} from "./options";
