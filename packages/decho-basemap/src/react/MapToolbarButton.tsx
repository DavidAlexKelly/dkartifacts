/**
 * A toolbar button, for anything a host wants to put at the end of the map's
 * toolbar.
 *
 * WHY THIS IS EXPORTED
 * --------------------
 * `<DechoBasemap toolbarItems={...} />` lets a host — or an extension's own
 * control — attach to the end of the drawing toolbar. Left to itself, every
 * host would reimplement a 28-pixel square with the right radius, the right
 * hover colour and the right active state, and each one would be a shade off.
 * A control that does not look native to the bar reads as bolted on.
 *
 * It is also where the accessibility is enforced rather than hoped for: an
 * icon-only button MUST have a name, so `label` is required and becomes both
 * the tooltip and the accessible name. `aria-pressed` is set whenever `active`
 * is passed, which is what makes a toggle announce as a toggle rather than as
 * a button that does something unexplained.
 */

import type { ReactNode } from "react";

import { DEFAULT_SURFACE_THEME, toolbarButton, type SurfaceTheme } from "./theme";

export interface MapToolbarButtonProps {
  /** Tooltip and accessible name. Required: the icon is not a label. */
  label: string;
  /** The icon. 16px glyphs from this package, or your own. */
  children: ReactNode;
  onClick: () => void;
  /**
   * Pass for a toggle: it drives the pressed styling and announces the button
   * as a toggle. Omit for a plain action.
   */
  active?: boolean;
  disabled?: boolean;
  theme?: Partial<SurfaceTheme>;
}

export function MapToolbarButton({
  label,
  children,
  onClick,
  active,
  disabled = false,
  theme,
}: MapToolbarButtonProps) {
  const resolved = { ...DEFAULT_SURFACE_THEME, ...theme };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // `title` is the hover tooltip; `aria-label` is the accessible name. A
      // title alone is not reliably announced.
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={toolbarButton(resolved, { active, disabled })}
    >
      {children}
    </button>
  );
}
