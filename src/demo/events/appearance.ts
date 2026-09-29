/**
 * The event monitor's look and feel as a module sets it: map style, where the
 * camera starts, clustering, and how much of the page's machinery a user may
 * touch. Each is its own Workshop variable (see src/workshopConfig.ts); these
 * are the values when one is unset, which is also how the page looks outside
 * Workshop.
 */

export interface StartView {
  lat: number;
  lon: number;
  zoom: number;
}

export interface EventAppearance {
  /** Sprite set inside the basemap's assets, e.g. "sprites/light". */
  spritePath: string;
  startView: StartView;
  /** Starting values: the settings' toggles can still change them. */
  globe: boolean;
  terrain: boolean;
  /** Frame whatever loads instead of staying at the start view. */
  fitToDataOnLoad: boolean;
  clustering: boolean;
  /** Pixels; how close events must be to merge into a cluster. */
  clusterRadius: number;
  /** The Settings button, and with it everything behind it. */
  showSettings: boolean;
  /** Add, remove and toggle sources (including mock events) on the page. */
  allowSourceEditing: boolean;
  /** Put events, sources and values into categories on the page. */
  allowCategoryEditing: boolean;
  /** Rows in the "Latest" feed; 0 hides it. */
  feedLength: number;
}

export const DEFAULT_APPEARANCE: EventAppearance = {
  spritePath: "sprites/light",
  // Europe and the Middle East in view, the rest of the globe a drag away.
  startView: { lat: 38, lon: 25, zoom: 2.3 },
  globe: true,
  terrain: true,
  fitToDataOnLoad: false,
  clustering: true,
  clusterRadius: 50,
  showSettings: true,
  allowSourceEditing: true,
  allowCategoryEditing: true,
  feedLength: 40,
};

/**
 * A sprite set as a module might write it: a path inside the assets dataset
 * ("sprites/dark"), or just the set's name ("dark"). Null when blank.
 */
export function spritePathFrom(text: string): string | null {
  let start = 0;
  let end = text.length;
  while (start < end && (text[start] === "/" || text[start].trim() === "")) {start++;}
  while (end > start && (text[end - 1] === "/" || text[end - 1].trim() === "")) {end--;}
  const trimmed = text.slice(start, end);
  if (trimmed === "") {return null;}
  return trimmed.includes("/") ? trimmed : `sprites/${trimmed}`;
}

/** Numeric variables: their range, and whether they are whole numbers. */
export const NUMBER_LIMITS = {
  lat: { min: -90, max: 90, whole: false },
  lon: { min: -180, max: 180, whole: false },
  zoom: { min: 0, max: 22, whole: false },
  clusterRadius: { min: 1, max: 200, whole: true },
  feedLength: { min: 0, max: 500, whole: true },
} as const;

export type NumberLimit = (typeof NUMBER_LIMITS)[keyof typeof NUMBER_LIMITS];

/** The number if it is usable, or why not. */
export function checkNumber(
  value: number,
  limit: NumberLimit,
): { ok: true; value: number } | { ok: false; error: string } {
  if (!Number.isFinite(value)) {return { ok: false, error: "not a number." };}
  if (value < limit.min || value > limit.max) {
    return { ok: false, error: `outside ${limit.min} to ${limit.max}.` };
  }
  return { ok: true, value: limit.whole ? Math.round(value) : value };
}
