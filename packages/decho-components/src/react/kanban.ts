/**
 * Moving a card between columns, and within one.
 *
 * Small, and pure, because the two ways this goes wrong are both arithmetic
 * rather than drag-and-drop:
 *
 *   1. Remove-then-insert with the original index. Moving a card down by one
 *      within its own column removes it (shifting everything up), then inserts
 *      at the index it came from — so it lands back where it started and the
 *      drag appears to do nothing.
 *   2. Mutating the board. React then does not re-render, the card snaps back,
 *      and the state is wrong in a way that only shows up on the next render.
 *
 * The board is `{ [columnId]: cardId[] }` rather than a nested structure: the
 * cards themselves live wherever the caller keeps them, and a board that owns
 * only ids cannot go out of step with them.
 */

export type Board = Record<string, string[]>;

/** Which column a card is in, or `null`. */
export function columnOf(board: Board, cardId: string): string | null {
  for (const [column, cards] of Object.entries(board)) {
    if (cards.includes(cardId)) {
      return column;
    }
  }
  return null;
}

/**
 * Move a card to a column, at an index.
 *
 * The index is interpreted against the column as it will be AFTER the card has
 * been taken out of wherever it was — which is what makes a within-column move
 * behave the way the pointer says it should.
 */
export function moveCard(
  board: Board,
  cardId: string,
  toColumn: string,
  toIndex: number,
): Board {
  const from = columnOf(board, cardId);
  if (from == null || board[toColumn] == null) {
    // An unknown card or column is a caller bug, but throwing here would take
    // a page down mid-drag; returning the board unchanged is visible and safe.
    return board;
  }

  const next: Board = {};
  for (const [column, cards] of Object.entries(board)) {
    next[column] = cards.filter((id) => id !== cardId);
  }

  const target = next[toColumn] ?? [];
  const index = Math.max(0, Math.min(toIndex, target.length));
  target.splice(index, 0, cardId);
  next[toColumn] = target;

  return next;
}

/**
 * Nudge a card up or down inside its column — the keyboard path.
 *
 * A board that can only be rearranged by dragging is a board some people
 * cannot use at all, which is why this exists beside `moveCard` rather than
 * being left to the component.
 */
export function reorderColumn(
  board: Board,
  column: string,
  index: number,
  delta: number,
): Board {
  const cards = board[column];
  if (cards == null) {
    return board;
  }
  const target = index + delta;
  if (index < 0 || index >= cards.length || target < 0 || target >= cards.length) {
    // Clamp rather than wrap: a card at the top of a column jumping to the
    // bottom because Up was pressed once too often is never what was meant.
    return board;
  }
  const next = [...cards];
  const [moved] = next.splice(index, 1);
  if (moved != null) {
    next.splice(target, 0, moved);
  }
  return { ...board, [column]: next };
}

/** Move a card to the next or previous column, keeping its position. */
export function moveColumn(
  board: Board,
  cardId: string,
  columns: readonly string[],
  delta: number,
): Board {
  const from = columnOf(board, cardId);
  if (from == null) {
    return board;
  }
  const at = columns.indexOf(from);
  const target = columns[at + delta];
  if (at < 0 || target == null) {
    return board;
  }
  const index = board[from]?.indexOf(cardId) ?? 0;
  return moveCard(board, cardId, target, index);
}
