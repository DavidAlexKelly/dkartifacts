/**
 * Right-click, anywhere in a region.
 *
 * Self-contained, unlike `Menu`: a context menu's open state and position come
 * from the event that opened it, so there is nothing useful for a caller to
 * own. That is why this one keeps state and `Menu` does not.
 *
 * The anchor is a zero-size rectangle at the pointer — which is the reason
 * `placeFloating` takes rectangles rather than elements. The mil map's
 * hand-rolled version anchors to an invisible element it moves around, and is
 * a pixel out at every zoom level because the element is inside the map's
 * transformed subtree.
 *
 * ALSO REACHABLE WITHOUT A MOUSE
 * ------------------------------
 * `Shift+F10` and the Menu key open it at the focused element, because a
 * right-click-only affordance is one that keyboard users simply do not have.
 * Every hand-rolled context menu in this estate is mouse-only, which is why
 * this is here rather than left to the caller.
 */

import React from "react";
import { Menu, type MenuEntry } from "./Menu.js";
import type { Rect } from "./placement.js";
import type { DechoTokenSet } from "../core/vars.js";

export interface ContextMenuProps extends React.HTMLAttributes<HTMLDivElement> {
  items: MenuEntry[];
  /** Called when the menu opens, so a row can mark itself as the target. */
  onOpen?: () => void;
  disabled?: boolean;
  "aria-label"?: string;
  tokens?: DechoTokenSet;
}

export function ContextMenu({
  items,
  onOpen,
  disabled = false,
  children,
  tokens,
  ...rest
}: ContextMenuProps): React.ReactElement {
  const [at, setAt] = React.useState<Rect | null>(null);
  const region = React.useRef<HTMLDivElement>(null);

  const openAt = (rect: Rect): void => {
    setAt(rect);
    onOpen?.();
  };

  return (
    <>
      {/*
        eslint-disable-next-line jsx-a11y/no-static-element-interactions --
        A region that has a context menu is exactly this: a wrapper whose only
        job is to notice a right-click. The rule's concern — mouse-only
        interactivity — is answered by the `onKeyDown` below, which opens the
        same menu on Shift+F10 and the Menu key. Giving the wrapper an
        interactive role instead would be a lie: it is not a button, and
        announcing it as one would put a phantom control in front of the
        content it wraps.
      */}
      <div
        {...rest}
        ref={region}
        onContextMenu={(event) => {
          if (disabled) {
            return;
          }
          // The browser menu is suppressed only because a replacement is
          // actually being shown — a component that swallows it and then fails
          // to open leaves the user with no menu at all.
          event.preventDefault();
          openAt({ top: event.clientY, left: event.clientX, width: 0, height: 0 });
          rest.onContextMenu?.(event);
        }}
        onKeyDown={(event) => {
          const asked =
            event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
          if (asked && !disabled) {
            event.preventDefault();
            // At the focused element rather than at the pointer, which may be
            // anywhere or nowhere.
            const target = event.target as HTMLElement | null;
            const box = (target ?? region.current)?.getBoundingClientRect();
            openAt(
              box != null
                ? { top: box.top + box.height, left: box.left, width: 0, height: 0 }
                : { top: 0, left: 0, width: 0, height: 0 },
            );
          }
          rest.onKeyDown?.(event);
        }}
      >
        {children}
      </div>
      {at != null && (
        <Menu
          open
          onClose={() => setAt(null)}
          anchor={at}
          items={items}
          offset={0}
          tokens={tokens}
          aria-label={rest["aria-label"] ?? "Context menu"}
        />
      )}
    </>
  );
}
