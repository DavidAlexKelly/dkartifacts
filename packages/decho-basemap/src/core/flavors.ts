/**
 * Map colour sets of our own, beside the five Protomaps ships.
 *
 * PHOSPHOR
 * --------
 * A green-screen terminal look: near-black ground, the map drawn in one
 * phosphor colour at different strengths. Water is the darkest thing on the
 * map, land a shade above it, roads dim, borders and labels bright — the way a
 * vector display only lights what it draws.
 *
 * It is one colour and a table of strengths rather than seventy hex values, so
 * the whole map can be retuned, or turned amber, by changing one argument:
 *
 *   phosphorFlavor("#ffb000")   // amber terminal
 *
 * `mapStyle="crt"` is `phosphorFlavor()` with the "black" sprite sheet, whose
 * icons are drawn for a near-black ground.
 *
 * Type-only import: this module draws no layers itself, so it loads without
 * @protomaps/basemaps at runtime.
 */

import type { Flavor } from "@protomaps/basemaps";

/** The default phosphor: a P1-style green. */
export const PHOSPHOR_GREEN = "#33ff66";

/**
 * How strongly each part of the map glows, 0 (black) to 1 (full phosphor).
 *
 * Grouped as a terminal would think of them: what is filled is barely lit,
 * what is stroked is dim, what is written is bright.
 */
const STRENGTH: Record<FlavorColour, number> = {
  // Ground. Water below land, so coastlines read without an outline.
  background: 0.03,
  earth: 0.07,
  water: 0.015,

  // Land cover: just off the ground, so areas show as shapes and not as noise.
  park_a: 0.1,
  park_b: 0.1,
  wood_a: 0.1,
  wood_b: 0.1,
  scrub_a: 0.09,
  scrub_b: 0.09,
  glacier: 0.11,
  sand: 0.09,
  beach: 0.1,
  hospital: 0.09,
  industrial: 0.085,
  school: 0.09,
  pedestrian: 0.09,
  zoo: 0.09,
  military: 0.11,
  aerodrome: 0.09,
  runway: 0.16,
  pier: 0.12,
  buildings: 0.13,

  // Road casings stay dark: the lines carry the glow, not their edges.
  tunnel_other_casing: 0.03,
  tunnel_minor_casing: 0.03,
  tunnel_link_casing: 0.03,
  tunnel_major_casing: 0.03,
  tunnel_highway_casing: 0.03,
  minor_service_casing: 0.04,
  minor_casing: 0.04,
  link_casing: 0.04,
  major_casing_late: 0.04,
  highway_casing_late: 0.04,
  major_casing_early: 0.04,
  highway_casing_early: 0.04,
  bridges_other_casing: 0.04,
  bridges_minor_casing: 0.04,
  bridges_link_casing: 0.04,
  bridges_major_casing: 0.04,
  bridges_highway_casing: 0.04,

  // Roads, dimmest to brightest by rank.
  tunnel_other: 0.1,
  tunnel_minor: 0.1,
  tunnel_link: 0.12,
  tunnel_major: 0.14,
  tunnel_highway: 0.17,
  other: 0.14,
  minor_service: 0.14,
  minor_a: 0.17,
  minor_b: 0.15,
  link: 0.2,
  major: 0.24,
  highway: 0.3,
  railway: 0.2,
  bridges_other: 0.14,
  bridges_minor: 0.17,
  bridges_link: 0.2,
  bridges_major: 0.24,
  bridges_highway: 0.3,

  // Borders: the brightest line on the map, as on a radar plot.
  boundaries: 0.55,

  // Text, with halos the colour of the ground so labels cut through roads.
  roads_label_minor: 0.4,
  roads_label_minor_halo: 0.03,
  roads_label_major: 0.5,
  roads_label_major_halo: 0.03,
  ocean_label: 0.38,
  subplace_label: 0.45,
  subplace_label_halo: 0.03,
  city_label: 0.85,
  city_label_halo: 0.03,
  state_label: 0.4,
  state_label_halo: 0.03,
  country_label: 0.7,
  address_label: 0.35,
  address_label_halo: 0.03,
};

/**
 * A Protomaps flavor drawn in one phosphor colour.
 *
 * Every colour is `phosphor` scaled towards black by the strength above.
 * Throws on a colour it cannot read, rather than drawing a black map.
 */
export function phosphorFlavor(phosphor: string = PHOSPHOR_GREEN): Flavor {
  const rgb = parseHex(phosphor);
  if (!rgb) {
    throw new Error(
      `[decho-basemap] phosphorFlavor needs a hex colour such as "#33ff66"; got ${JSON.stringify(phosphor)}.`,
    );
  }
  const flavor: Record<string, string> = {};
  for (const [key, strength] of Object.entries(STRENGTH)) {
    flavor[key] = toHex(rgb.map((channel) => channel * strength) as Rgb);
  }
  return flavor as unknown as Flavor;
}

/** The green CRT map: `mapStyle="crt"`. */
export const CRT_FLAVOR: Flavor = phosphorFlavor();

/** Flavor's colour keys: everything but its fonts and the optional groups. */
type FlavorColour = Exclude<keyof Flavor, "regular" | "bold" | "italic" | "pois" | "landcover">;

type Rgb = [number, number, number];

function parseHex(text: string): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!match) {return null;}
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}
