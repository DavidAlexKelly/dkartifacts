/**
 * The words for the seven RAG states.
 *
 * Here rather than beside a component for two reasons. The mechanical one is
 * React Fast Refresh, which stops working in a file that exports both a
 * component and something else. The real one is that three components and the
 * heatmap all need these strings, and "At risk" written four ways is the same
 * class of defect as four shades of amber.
 *
 * Override the wording per instance with a component's children where you need
 * to; the colour is not overridable, and neither is this by default.
 */

import type { DechoStatus } from "./vars.js";

export const STATUS_LABEL: Record<DechoStatus, string> = {
  critical: "Critical",
  high: "High",
  atRisk: "At risk",
  onTrack: "On track",
  complete: "Complete",
  notAssessed: "Not assessed",
  noData: "No data",
};
