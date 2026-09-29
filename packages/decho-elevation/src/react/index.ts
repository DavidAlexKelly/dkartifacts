/**
 * @acc/decho-elevation/react — hooks and one chart.
 *
 * Separate from the core entry point so that a consumer with no React (a
 * worker, a Function, a Node script computing profiles) resolves none of it.
 */

export {
  useCursorElevation,
  useElevation,
  type CursorElevation,
  type PointerMap,
  type UseElevationOptions,
  type UseElevationResult,
} from "./useElevation.js";

export { TerrainProfile, type TerrainProfileProps } from "./TerrainProfile.js";
