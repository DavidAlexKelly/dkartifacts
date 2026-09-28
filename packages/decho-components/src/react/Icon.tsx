/**
 * A small, closed set of glyphs — inline SVG, no dependency, no sprite.
 *
 * WHY THE LIBRARY NEEDS ANY ICONS AT ALL
 * --------------------------------------
 * Every component here takes `icon?: ReactNode` and owns no glyphs, which is
 * the right default: an icon set is a brand decision. But a chevron is not a
 * brand decision — it is part of what makes a select look like a select. Six
 * of the components in this batch (`Select`, `Accordion`, `Pagination`,
 * `Checkbox`, `Toast`, `CopyButton`) cannot render correctly without one, and
 * the alternative is what the estate does today: a literal `▾` character,
 * which is a different shape in every font and unaligned in all of them.
 *
 * So: a deliberately minimal set, only the glyphs the components themselves
 * need, and `icon={<YourIcon />}` still accepted everywhere. This is not a
 * proposal for an icon library.
 *
 * WHY STROKED PATHS ON A 16-GRID
 * ------------------------------
 * `currentColor` and `strokeWidth` mean an icon inherits the text colour and
 * looks right in a theme nobody has designed yet. A 16×16 viewBox matches the
 * type scale (`fontSize.md` is 12px, so 14–16px icons sit on the same
 * baseline) and is the geometry the map toolbars already use.
 */

import React from "react";

/**
 * The glyphs. Ordered by the component that needs them, which is also the
 * argument for each one existing.
 */
const PATHS = {
  // Select, Accordion, Menu, Pagination
  chevronDown: "M4 6.5 8 10.5 12 6.5",
  chevronUp: "M4 9.5 8 5.5 12 9.5",
  chevronLeft: "M9.5 4 5.5 8 9.5 12",
  chevronRight: "M6.5 4 10.5 8 6.5 12",
  chevronsLeft: "M7.5 4 3.5 8 7.5 12M12.5 4 8.5 8 12.5 12",
  chevronsRight: "M3.5 4 7.5 8 3.5 12M8.5 4 12.5 8 8.5 12",
  // Checkbox, Toast, Stepper
  check: "M3.5 8.5 6.5 11.5 12.5 5",
  // A checkbox's third state. "Some of these are selected" is not "none".
  minus: "M4 8h8",
  plus: "M8 4v8M4 8h8",
  // Toast, Banner, Drawer, FilterSummary
  close: "M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5",
  // Toolbars and filters
  search: "M9.6 9.6 13 13",
  filter: "M3 4.5h10M5 8h6M6.8 11.5h2.4",
  // CopyButton, DownloadButton, RefreshButton
  copy: "M6.5 6.5h5.5v5.5H6.5zM4 9.5V4h5.5",
  download: "M8 3v7.2M5.2 7.6 8 10.4l2.8-2.8M3.5 13h9",
  refresh: "M3.2 8a4.8 4.8 0 0 1 8.2-3.4M12.8 8a4.8 4.8 0 0 1-8.2 3.4M11.4 2.2v2.6H8.8M4.6 13.8v-2.6h2.6",
  // Banner tones
  info: "M8 7.4v3.8M8 5.2h.01",
  warning: "M8 3.4 13.2 12.4H2.8zM8 6.8v2.4M8 11.2h.01",
  // Timeline, DateInput
  clock: "M8 5.2V8l2 1.4",
  calendar: "M3.5 5.5h9v7h-9zM3.5 7.6h9M6 3.5v2M10 3.5v2",
  // Menu (the "⋯"), SplitPane's grab handle
  dotsHorizontal: "M4 8h.01M8 8h.01M12 8h.01",
  dotsVertical: "M8 4v.01M8 8v.01M8 12v.01",
  grip: "M6.6 4.5v7M9.4 4.5v7",
  // Avatar fallback, UserName's sibling
  user: "M5.8 4.9a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0M3.6 13.2a4.4 4.4 0 0 1 8.8 0",
  // Where a link leaves the page
  externalLink: "M9 3.5h3.5V7M12.5 3.5 7.4 8.6M11 9.6v3H3.5V5h3",
} as const;

/** The circle some glyphs need behind the path, as `[cx, cy, r]`. */
const CIRCLES: Partial<Record<DechoIconName, readonly [number, number, number]>> = {
  search: [7, 7, 3.6],
  info: [8, 8, 5.4],
  clock: [8, 8, 5.4],
};

export type DechoIconName = keyof typeof PATHS;

/** Every glyph's name. Iterating this is how the showcase draws the set. */
export const ICON_NAMES = Object.keys(PATHS) as DechoIconName[];

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "name"> {
  name: DechoIconName;
  /** Pixel size; 14 by default, which sits on a 12px line without lifting it. */
  size?: number;
  /**
   * A name for assistive technology.
   *
   * Omitted, the icon is `aria-hidden`: an icon beside a label is decoration,
   * and announcing "chevron down" before "Status" is noise. Pass it only when
   * the icon IS the label — an icon-only button, say — and prefer labelling
   * the button instead.
   */
  label?: string;
}

export function Icon({
  name,
  size = 14,
  label,
  strokeWidth,
  style,
  ...rest
}: IconProps): React.ReactElement {
  const circle = CIRCLES[name];
  // Dots are drawn as zero-length round-capped segments, so their width IS
  // their diameter; everything else is a 1.5px line.
  const width = strokeWidth ?? (name === "dotsHorizontal" || name === "dotsVertical" ? 2 : 1.5);

  return (
    <svg
      {...rest}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label != null ? "img" : undefined}
      aria-hidden={label == null ? true : undefined}
      aria-label={label}
      // `block` because an inline SVG sits on the text baseline and adds a few
      // pixels of descender to every row it is in — which is why hand-rolled
      // icon buttons in this estate are all one pixel taller than their
      // neighbours.
      style={{ display: "block", flex: "0 0 auto", ...style }}
    >
      {label != null && <title>{label}</title>}
      {circle != null && <circle cx={circle[0]} cy={circle[1]} r={circle[2]} />}
      <path d={PATHS[name]} />
    </svg>
  );
}
