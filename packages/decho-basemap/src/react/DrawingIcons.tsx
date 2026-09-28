/**
 * The drawing toolbar's icons.
 *
 * WHY HAND-DRAWN SVG AND NOT AN ICON SET
 * --------------------------------------
 * Two constraints, both of which rule out the easy answer:
 *
 *   - this package deliberately has no icon-set dependency. It is a map
 *     library; making every consumer install and configure an icon font to get
 *     a toolbar would be a poor trade, and it is why the toolbar was plain text
 *     buttons in the first place;
 *   - the CI code scan blocks `dangerouslySetInnerHTML` outright, so an icon
 *     cannot be an SVG string either. They have to be real elements.
 *
 * Sixteen pixels of `<path>` each, drawn on a 16-unit grid, stroked with
 * `currentColor` so the button's own colour drives them and the active state
 * needs no second icon.
 *
 * ICONS ALONE ARE NOT A LABEL
 * ---------------------------
 * Every button that uses these carries an `aria-label` and a `title`. An
 * icon-only toolbar with neither is a guessing game for a sighted user and
 * silence for a screen reader.
 */

export interface IconProps {
  size?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
});

/** Arrow cursor. */
export function SelectIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3.2 2.4l8.2 4.9-3.6.8-1.4 3.4z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** A dropped point: ring plus centre. */
export function PointIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="8" cy="8" r="4.5" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Two segments with their vertices showing. */
export function LineIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M2.5 12.5L6.5 6l4 3.2 3-6" />
      <circle cx="2.5" cy="12.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="3.2" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Closed irregular ring, vertices at the corners. */
export function PolygonIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 2.2l5.4 3.6-2 6.4H4.6l-2-6.4z" />
      <circle cx="8" cy="2.2" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function RectangleIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="2.6" y="4" width="10.8" height="8" rx="0.8" />
      <circle cx="2.6" cy="4" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Remove the selected shape: a cross in a ring. */
export function RemoveIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M6 6l4 4M10 6l-4 4" />
    </svg>
  );
}

/**
 * Extruded buildings: a cube in axonometric projection.
 *
 * Here rather than in a buildings-specific module because it is toolbar
 * iconography, and the toolbar's glyphs belong together — a host adding the 3D
 * toggle to the bar should not have to hunt in a second place for the icon
 * that matches the other seven.
 */
export function BuildingsIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 1.8l5.4 2.9v6.6L8 14.2l-5.4-2.9V4.7z" />
      <path d="M2.6 4.7L8 7.6l5.4-2.9M8 7.6v6.6" />
    </svg>
  );
}

/**
 * Ground textures: the woodland tree, at toolbar scale.
 *
 * Same shape as the artwork landusePatterns actually prints, redrawn on the
 * 16-unit grid — a toggle whose icon is the thing it turns on needs no label
 * to be understood, though it gets one anyway.
 */
export function TexturesIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 11.3h4.7L9.7 7h2L8 2 4.3 7h2L3.3 11.3H8zM8 11.3V14" />
    </svg>
  );
}

/** Empty the drawing: a bin. */
export function ClearIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M2.8 4.3h10.4M6.3 4.3V2.9h3.4v1.4" />
      <path d="M4.2 4.3l.7 8.3a.9.9 0 00.9.8h4.4a.9.9 0 00.9-.8l.7-8.3" />
    </svg>
  );
}
