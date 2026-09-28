/**
 * Cards in columns, moved by dragging — or by the keyboard.
 *
 * NO DRAG-AND-DROP LIBRARY
 * ------------------------
 * `dnd-kit` is the right answer for a board with nested sortables, drag
 * overlays and collision detection. This is a board with cards in columns, and
 * the native HTML5 drag events do that in about forty lines — which is a
 * better trade than a dependency in every widget bundle.
 *
 * What the native API costs: no drag preview styling worth having, and no
 * touch support at all (`dragstart` does not fire on touch). Both are written
 * down here rather than discovered later. The keyboard path covers the second
 * case for anyone who needs it, and is the reason this is usable at all
 * without a mouse.
 *
 * THE KEYBOARD PATH IS NOT AN AFTERTHOUGHT
 * ----------------------------------------
 * A card is focusable; ctrl+arrow moves it. That is the whole contract, it is
 * announced in the card's `aria-describedby`, and it works on a board where
 * dragging is impossible — a tablet, a screen reader, a trackpad somebody
 * finds imprecise. Every kanban in this estate is drag-only.
 */

import React from "react";
import { focusRingStyle } from "../core/recipes.js";
import { resolveTokens, type DechoTokenSet, type DechoTone } from "../core/vars.js";
import { moveCard, moveColumn, reorderColumn, type Board } from "./kanban.js";

export interface KanbanColumn {
  id: string;
  title: React.ReactNode;
  /** A cap, shown as "3 / 5" — a WIP limit. */
  limit?: number;
  tone?: DechoTone;
}

export interface KanbanBoardProps<Card> extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  columns: KanbanColumn[];
  /** `{ [columnId]: cardId[] }`. */
  board: Board;
  onBoardChange: (board: Board) => void;
  /** The cards themselves, by id. */
  cards: Record<string, Card>;
  renderCard: (card: Card, id: string) => React.ReactNode;
  /** Announced on each card, so the keyboard path is discoverable. */
  instructions?: string;
  columnWidth?: number;
  tokens?: DechoTokenSet;
}

export function KanbanBoard<Card>({
  columns,
  board,
  onBoardChange,
  cards,
  renderCard,
  instructions = "Press ctrl with the arrow keys to move this card.",
  columnWidth = 260,
  tokens,
  style,
  ...rest
}: KanbanBoardProps<Card>): React.ReactElement {
  const t = resolveTokens(tokens);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<{ column: string; index: number } | null>(null);
  const [focusedCard, setFocusedCard] = React.useState<string | null>(null);
  const instructionsId = React.useId();

  const columnIds = columns.map((column) => column.id);

  const drop = (column: string, index: number): void => {
    if (dragging != null) {
      onBoardChange(moveCard(board, dragging, column, index));
    }
    setDragging(null);
    setOver(null);
  };

  const onCardKeyDown = (event: React.KeyboardEvent, cardId: string, column: string, index: number): void => {
    // Ctrl (or Cmd) rather than bare arrows: bare arrows must keep scrolling
    // the board, and a card that moves when somebody is only trying to look
    // around is worse than one that cannot be moved at all.
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    let next: Board | null = null;
    if (event.key === "ArrowUp") {
      next = reorderColumn(board, column, index, -1);
    } else if (event.key === "ArrowDown") {
      next = reorderColumn(board, column, index, 1);
    } else if (event.key === "ArrowLeft") {
      next = moveColumn(board, cardId, columnIds, -1);
    } else if (event.key === "ArrowRight") {
      next = moveColumn(board, cardId, columnIds, 1);
    }
    if (next != null) {
      event.preventDefault();
      onBoardChange(next);
    }
  };

  return (
    <div
      {...rest}
      style={{
        display: "flex",
        gap: t.space[5],
        alignItems: "flex-start",
        overflowX: "auto",
        fontFamily: t.fontFamily.sans,
        ...style,
      }}
    >
      <span id={instructionsId} hidden>
        {instructions}
      </span>

      {columns.map((column) => {
        const cardIds = board[column.id] ?? [];
        const overLimit = column.limit != null && cardIds.length > column.limit;

        return (
          <section
            key={column.id}
            aria-label={typeof column.title === "string" ? column.title : column.id}
            onDragOver={(event) => {
              // Without this the drop event never fires — the single most
              // common reason a hand-rolled HTML5 drop target "does nothing".
              event.preventDefault();
              setOver({ column: column.id, index: cardIds.length });
            }}
            onDrop={(event) => {
              event.preventDefault();
              drop(column.id, over?.column === column.id ? over.index : cardIds.length);
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: t.space[3],
              flex: `0 0 ${columnWidth}px`,
              padding: t.space[3],
              borderRadius: t.radius.lg,
              background: over?.column === column.id ? t.color.accentTint : t.color.bg,
              border: `1px solid ${t.color.borderSubtle}`,
              minHeight: 120,
              transition: t.effect.transition,
            }}
          >
            <header
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: t.space[3],
                padding: `${t.space[2]} ${t.space[3]}`,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: t.fontSize.md, color: t.color.text }}>
                {column.title}
              </span>
              <span
                style={{
                  fontSize: t.fontSize.sm,
                  fontVariantNumeric: "tabular-nums",
                  color: overLimit ? t.color.danger : t.color.textMuted,
                  fontWeight: overLimit ? 600 : 400,
                }}
              >
                {column.limit != null ? `${cardIds.length} / ${column.limit}` : cardIds.length}
              </span>
            </header>

            <ul style={{ display: "grid", gap: t.space[3], margin: 0, padding: 0, listStyle: "none" }}>
              {cardIds.map((cardId, index) => {
                const card = cards[cardId];
                if (card == null) {
                  return null;
                }
                return (
                  <li key={cardId}>
                    <div
                      // A card is a button-like thing that can also be
                      // dragged; `role="button"` plus a tabindex is the
                      // honest description, and the keyboard contract is in
                      // `aria-describedby` rather than left to be guessed.
                      role="button"
                      tabIndex={0}
                      aria-describedby={instructionsId}
                      aria-roledescription="draggable card"
                      draggable
                      onDragStart={(event) => {
                        setDragging(cardId);
                        // Required by Firefox, which ignores a drag with no
                        // data attached.
                        event.dataTransfer.setData("text/plain", cardId);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOver({ column: column.id, index });
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        drop(column.id, index);
                      }}
                      onFocus={() => setFocusedCard(cardId)}
                      onBlur={() => setFocusedCard(null)}
                      onKeyDown={(event) => onCardKeyDown(event, cardId, column.id, index)}
                      style={{
                        padding: t.space[4],
                        borderRadius: t.radius.md,
                        background: t.color.surface,
                        border: `1px solid ${
                          over?.column === column.id && over.index === index
                            ? t.color.accent
                            : t.color.borderSubtle
                        }`,
                        boxShadow: t.shadow.card,
                        opacity: dragging === cardId ? 0.4 : 1,
                        cursor: "grab",
                        outline: "none",
                        ...(focusedCard === cardId ? focusRingStyle({ tokens }) : {}),
                      }}
                    >
                      {renderCard(card, cardId)}
                    </div>
                  </li>
                );
              })}

              {cardIds.length === 0 && (
                <li
                  style={{
                    padding: t.space[5],
                    borderRadius: t.radius.md,
                    border: `1px dashed ${t.color.border}`,
                    color: t.color.textFaint,
                    fontSize: t.fontSize.sm,
                    textAlign: "center",
                  }}
                >
                  Nothing here
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
