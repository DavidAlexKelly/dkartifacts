/**
 * Keyboard movement through a list of options, as arithmetic.
 *
 * Shared by `Menu`, `Select` and `MultiSelect`, which is most of the argument
 * for it existing: three components with three slightly different versions of
 * "down arrow, but skip the disabled ones, and wrap" is three sets of bugs.
 * The estate's hand-rolled dropdowns have all of these:
 *
 *   - Down from the last item does nothing, so a six-item menu needs the mouse
 *     to get back to the top.
 *   - Down onto a disabled item highlights it, and Enter then does nothing at
 *     all, which reads as the menu being broken rather than the item.
 *   - Home and End are unhandled, so a forty-object list is forty presses.
 *   - Typing a letter does nothing, when every native `<select>` jumps.
 */

/** What this needs to know about an option. */
export interface NavigableItem {
  disabled?: boolean;
  /** The text typeahead matches against. */
  label?: string;
}

export type NavKey = "ArrowDown" | "ArrowUp" | "Home" | "End" | "PageDown" | "PageUp";

/** How many items a PageDown moves. Matches the native listbox convention. */
const PAGE = 10;

/**
 * The index a key press moves to, or `null` for "nothing to move to".
 *
 * `from` may be -1 for "nothing highlighted yet", which is the state a menu
 * opens in: the first Down then lands on the first item rather than the
 * second.
 */
export function nextIndex<T extends NavigableItem>(
  items: readonly T[],
  from: number,
  key: NavKey,
  options: { wrap?: boolean } = {},
): number | null {
  const wrap = options.wrap ?? true;
  const enabled = items.some((item) => item.disabled !== true);
  if (!enabled) {
    return null;
  }

  const step = (start: number, direction: 1 | -1): number | null => {
    const count = items.length;
    for (let moved = 1; moved <= count; moved += 1) {
      let candidate = start + direction * moved;
      if (candidate < 0 || candidate >= count) {
        if (!wrap) {
          // Clamp rather than stop: a held arrow key at the end of a
          // non-wrapping list should stay on the last enabled item.
          candidate = direction === 1 ? count - 1 : 0;
          return items[candidate]?.disabled === true ? seek(candidate, -direction as 1 | -1) : candidate;
        }
        candidate = ((candidate % count) + count) % count;
      }
      if (items[candidate]?.disabled !== true) {
        return candidate;
      }
    }
    return null;
  };

  /** The nearest enabled item from here, moving in one direction only. */
  const seek = (start: number, direction: 1 | -1): number | null => {
    for (let index = start; index >= 0 && index < items.length; index += direction) {
      if (items[index]?.disabled !== true) {
        return index;
      }
    }
    return null;
  };

  switch (key) {
    case "ArrowDown":
      return step(from, 1);
    case "ArrowUp":
      // From "nothing highlighted", Up goes to the end — same as a native
      // select, and the fastest way to the last item in a long list.
      return from < 0 ? seek(items.length - 1, -1) : step(from, -1);
    case "Home":
      return seek(0, 1);
    case "End":
      return seek(items.length - 1, -1);
    case "PageDown": {
      const target = Math.min(items.length - 1, (from < 0 ? 0 : from) + PAGE);
      return seek(target, -1) ?? seek(target, 1);
    }
    case "PageUp": {
      const target = Math.max(0, (from < 0 ? 0 : from) - PAGE);
      return seek(target, 1) ?? seek(target, -1);
    }
    default:
      return null;
  }
}

/**
 * The index a typed character jumps to.
 *
 * Starts *after* the current item so repeated presses of the same letter cycle
 * through the items beginning with it, which is what a native select does and
 * what people expect without being able to say so.
 */
export function typeaheadIndex<T extends NavigableItem>(
  items: readonly T[],
  from: number,
  query: string,
): number | null {
  const needle = query.toLowerCase();
  if (needle === "") {
    return null;
  }
  const count = items.length;
  for (let moved = 1; moved <= count; moved += 1) {
    const index = (from + moved + count) % count;
    const item = items[index];
    if (item == null || item.disabled === true) {
      continue;
    }
    if ((item.label ?? "").toLowerCase().startsWith(needle)) {
      return index;
    }
  }
  return null;
}

/**
 * Accumulate keystrokes into a typeahead query.
 *
 * Multi-character, because "St" and "S" select different objects in a list of
 * SAP tables, and time-limited, because the next "S" a minute later is a fresh
 * search rather than a continuation. Pure: the caller keeps the state and the
 * clock, so this is testable without fake timers.
 */
export interface TypeaheadState {
  query: string;
  at: number;
}

export function extendTypeahead(
  state: TypeaheadState | null,
  character: string,
  now: number,
  timeoutMs = 800,
): TypeaheadState {
  if (state == null || now - state.at > timeoutMs) {
    return { query: character, at: now };
  }
  return { query: state.query + character, at: now };
}

/** Whether a key press is a character to search with rather than a command. */
export function isTypeaheadKey(key: string): boolean {
  // Single printable character, and not a space: space toggles a checkbox in a
  // multi-select and activates an item in a menu, so it cannot also type.
  return key.length === 1 && key !== " ";
}
