/**
 * A table.
 *
 * Eight of them in the estate — the live RICEFW table, the requirements
 * section, the KDD alignment grid, the rule tables, the linked-metrics grid,
 * the scope inventory, the readiness table — and between them they carry
 * something like a quarter of a megabyte of source. Almost none of that is
 * table code: it is editing, validation, persistence and object-set queries
 * wrapped around a `<table>` that each one rebuilds.
 *
 * So the scope here is deliberately narrow and the boundary is the point:
 *
 *   IN    columns, sorting, sticky header, row hover, bulk selection, density,
 *         numeric alignment, "+N more", empty and loading states, and the
 *         accessibility all eight got wrong.
 *   OUT   editing, validation, persistence, pagination, virtualisation,
 *         column resizing, anything that fetches.
 *
 * It is **presentational and controlled**: rows in, sort and selection in,
 * events out. Nothing here knows what an object set is, and that is what makes
 * it testable without a client and usable outside Foundry.
 *
 * WHAT IT FIXES THAT A SCREENSHOT WOULD NOT SHOW
 * ----------------------------------------------
 * - `<th scope="col">` with `aria-sort`, and the sort control a real button.
 *   The originals sorted from an `onClick` on a `<div>` inside a `<td>`.
 * - A `<caption>`, so the table has a name. Visually hidden by default,
 *   because these tables sit under a `SectionHeader` that already says it.
 * - A select-all checkbox with a real indeterminate state, and a label on
 *   every row checkbox — "Select AV-27 Recovery", not "checkbox".
 * - Numbers in `tabular-nums`, right-aligned, so a column of figures reads as
 *   a column.
 */

import React, { useMemo, useRef, useState } from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { EmptyState } from "./EmptyState.js";
import { Skeleton } from "./Skeleton.js";
import { virtualRange } from "./virtualRange.js";

export type SortDirection = "asc" | "desc";

export interface DataTableSort {
  key: string;
  direction: SortDirection;
}

export interface DataTableColumn<Row> {
  key: string;
  header: React.ReactNode;
  /** The cell. Defaults to `value`, then to `row[key]`. */
  render?: (row: Row) => React.ReactNode;
  /**
   * The sortable, comparable value. Given this, sorting is handled here; a
   * column with a `render` but no `value` is not sortable, because there is
   * nothing to compare but React nodes.
   */
  value?: (row: Row) => string | number | boolean | null | undefined;
  align?: "left" | "center" | "right";
  /** `true` right-aligns and sets tabular figures. */
  numeric?: boolean;
  width?: number | string;
  /** Defaults to true when the column has a `value`. */
  sortable?: boolean;
}

export interface DataTableProps<Row>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  /** Stable identity, for selection and for React keys. */
  getRowId: (row: Row) => string;
  /** The table's accessible name. Hidden visually unless `showCaption`. */
  caption?: string;
  showCaption?: boolean;

  /**
   * Controlled sort. Omit both this and `onSortChange` and the table sorts
   * itself; pass both to sort on the server. Passing `sort` alone freezes it,
   * which is the right behaviour for "already sorted, do not touch".
   */
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;

  /** Selection. Presence of `onSelectionChange` is what shows the checkboxes. */
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  /** Names a row's checkbox: "Select AV-27 Recovery". */
  getRowLabel?: (row: Row) => string;

  onRowClick?: (row: Row) => void;
  /** Highlights the row whose detail is open beside the table. */
  activeRowId?: string;

  density?: "compact" | "default";
  stickyHeader?: boolean;
  maxHeight?: number | string;

  /** Skeleton rows instead of content. */
  loading?: boolean;
  loadingRows?: number;
  /** Shown when there are no rows. A string, or your own `EmptyState`. */
  empty?: React.ReactNode;

  /**
   * Cap the rows drawn and summarise the rest as "+N more" — the estate's
   * answer to a cell that can contain four hundred dependencies, and cheaper
   * than virtualisation for a widget that is showing a summary anyway.
   */
  maxRows?: number;
  /**
   * Render only the rows on screen.
   *
   * Needs `maxHeight` — there is nothing to scroll without it — and every row
   * must be `rowHeight` tall, which in practice means no wrapping cells. Worth
   * turning on past a few hundred rows: the readiness table renders ~5 DOM
   * nodes per row and visibly stutters at 800.
   */
  virtual?: boolean;
  /**
   * The height of one row, in pixels, when virtualising.
   *
   * Must match what the rows actually are, or the scrollbar lies. The default
   * matches this table's own `compact` density.
   */
  rowHeight?: number;
  onShowAll?: () => void;

  tokens?: DechoTokenSet;
}

export function DataTable<Row>({
  columns,
  rows,
  getRowId,
  caption,
  showCaption = false,
  sort,
  onSortChange,
  selectedIds,
  onSelectionChange,
  getRowLabel,
  onRowClick,
  activeRowId,
  density = "default",
  stickyHeader = true,
  maxHeight,
  loading = false,
  loadingRows = 5,
  empty = "No rows",
  maxRows,
  virtual = false,
  rowHeight,
  onShowAll,
  tokens,
  style,
  ...rest
}: DataTableProps<Row>): React.ReactElement {
  const t = resolveTokens(tokens);
  const captionId = React.useId();
  const compact = density === "compact";
  const selectable = onSelectionChange != null;
  const selected = selectedIds ?? [];

  // Uncontrolled sort, used only when the caller supplies neither half of the
  // controlled pair.
  const [ownSort, setOwnSort] = useState<DataTableSort | null>(null);
  const controlled = sort !== undefined;
  const activeSort = controlled ? (sort ?? null) : ownSort;

  const sortColumn = columns.find((c) => c.key === activeSort?.key);

  const sortedRows = useMemo(() => {
    // Sorting is the caller's when they asked for control of it.
    if (controlled || activeSort == null || sortColumn?.value == null) {
      return rows;
    }
    const read = sortColumn.value;
    const factor = activeSort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = read(a);
      const vb = read(b);
      // Blanks last in both directions: a missing value is not "smaller", and
      // sorting a column to find the gaps is the commonest reason to sort it.
      if (va == null && vb == null) {return 0;}
      if (va == null) {return 1;}
      if (vb == null) {return -1;}
      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * factor;
      }
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * factor;
    });
  }, [rows, controlled, activeSort, sortColumn]);

  const visibleRows =
    maxRows != null && sortedRows.length > maxRows
      ? sortedRows.slice(0, maxRows)
      : sortedRows;
  const hiddenCount = sortedRows.length - visibleRows.length;

  const toggleSort = (column: DataTableColumn<Row>) => {
    const next: DataTableSort | null =
      activeSort?.key !== column.key
        ? { key: column.key, direction: "asc" }
        : activeSort.direction === "asc"
          ? { key: column.key, direction: "desc" }
          : // Third click clears it. A two-state sort cannot get back to the
            // order the data arrived in, which for these tables is usually
            // meaningful (a pipeline's own ordering).
            null;
    if (onSortChange != null) {onSortChange(next);}
    if (!controlled) {setOwnSort(next);}
  };

  const allIds = visibleRows.map(getRowId);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  const someSelected = allIds.some((id) => selected.includes(id));

  const selectAllRef = useRef<HTMLInputElement | null>(null);
  // `indeterminate` is a property, not an attribute — there is no way to set
  // it in JSX, and without it "some rows selected" looks identical to "none".
  React.useEffect(() => {
    if (selectAllRef.current != null) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  const cellPadding = compact ? "5px 8px" : "7px 10px";

  const alignOf = (column: DataTableColumn<Row>): "left" | "center" | "right" =>
    column.align ?? (column.numeric === true ? "right" : "left");

  const headerCell = (column: DataTableColumn<Row>): React.ReactElement => {
    const sortable = column.sortable ?? column.value != null;
    const isSorted = activeSort?.key === column.key;
    const direction = isSorted ? activeSort.direction : undefined;

    return (
      <th
        key={column.key}
        scope="col"
        aria-sort={
          !sortable
            ? undefined
            : direction === "asc"
              ? "ascending"
              : direction === "desc"
                ? "descending"
                : "none"
        }
        style={{
          position: stickyHeader ? "sticky" : undefined,
          top: stickyHeader ? 0 : undefined,
          zIndex: stickyHeader ? 1 : undefined,
          width: column.width,
          padding: cellPadding,
          textAlign: alignOf(column),
          backgroundColor: t.color.surfaceRaised,
          borderBottom: `1px solid ${t.color.border}`,
          // 9.5px uppercase, which is the estate's header cell: small enough
          // that the data is what you read, heavy enough to be a header.
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: t.color.textMuted,
          whiteSpace: "nowrap",
        }}
      >
        {sortable ? (
          <button
            type="button"
            onClick={() => toggleSort(column)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              margin: 0,
              padding: 0,
              background: "none",
              border: "none",
              color: isSorted ? t.color.text : "inherit",
              font: "inherit",
              letterSpacing: "inherit",
              textTransform: "inherit",
              cursor: "pointer",
            }}
          >
            {column.header}
            <span aria-hidden="true" style={{ opacity: isSorted ? 1 : 0.35 }}>
              {direction === "desc" ? "▼" : "▲"}
            </span>
          </button>
        ) : (
          column.header
        )}
      </th>
    );
  };

  const columnCount = columns.length + (selectable ? 1 : 0);

  /*
    Virtualisation. The maths is in `virtualRange`; what is left here is a
    scroll listener and two spacer rows. `scrollTop` in state rather than in a
    ref because the rendered window is derived from it — a ref would need a
    forced re-render, which is the same thing with more steps.
  */
  const scroller = React.useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = React.useState({ top: 0, height: 0 });
  const measuredRowHeight = rowHeight ?? (density === "compact" ? 29 : 37);

  React.useLayoutEffect(() => {
    if (!virtual || scroller.current == null) {
      return;
    }
    // The viewport height is needed before the first scroll event, or the
    // initial render shows only the overscan.
    setScroll((was) => ({ ...was, height: scroller.current?.clientHeight ?? 0 }));
  }, [virtual, maxHeight]);

  const range = virtualRange({
    rowCount: visibleRows.length,
    rowHeight: measuredRowHeight,
    scrollTop: scroll.top,
    viewportHeight: scroll.height,
  });

  const renderedRows = virtual ? visibleRows.slice(range.start, range.end) : visibleRows;

  return (
    <div
      {...rest}
      ref={scroller}
      onScroll={
        virtual
          ? (event) => {
              const element = event.currentTarget;
              setScroll({ top: element.scrollTop, height: element.clientHeight });
            }
          : rest.onScroll
      }
      style={{
        border: `1px solid ${t.color.borderSubtle}`,
        borderRadius: t.radius.lg,
        backgroundColor: t.color.surface,
        overflow: "auto",
        maxHeight,
        fontFamily: t.fontFamily.sans,
        ...style,
      }}
    >
      <table
        aria-rowcount={virtual ? visibleRows.length : undefined}
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: compact ? t.fontSize.sm : t.fontSize.md,
          color: t.color.text,
        }}
      >
        {caption != null && (
          <caption
            id={captionId}
            style={
              showCaption
                ? {
                    captionSide: "top",
                    padding: cellPadding,
                    textAlign: "left",
                    fontSize: t.fontSize.md,
                    fontWeight: 600,
                    color: t.color.textMuted,
                  }
                : visuallyHidden
            }
          >
            {caption}
          </caption>
        )}

        <thead>
          <tr>
            {selectable && (
              <th
                scope="col"
                style={{
                  position: stickyHeader ? "sticky" : undefined,
                  top: stickyHeader ? 0 : undefined,
                  zIndex: stickyHeader ? 1 : undefined,
                  width: 34,
                  padding: cellPadding,
                  backgroundColor: t.color.surfaceRaised,
                  borderBottom: `1px solid ${t.color.border}`,
                }}
              >
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  aria-label={
                    allSelected ? "Deselect all rows" : "Select all rows"
                  }
                  onChange={() => {
                    if (allSelected) {
                      onSelectionChange?.(
                        selected.filter((id) => !allIds.includes(id)),
                      );
                    } else {
                      onSelectionChange?.([...new Set([...selected, ...allIds])]);
                    }
                  }}
                />
              </th>
            )}
            {columns.map(headerCell)}
          </tr>
        </thead>

        <tbody>
          {loading &&
            Array.from({ length: loadingRows }, (_, i) => (
              <tr key={`skeleton-${i}`}>
                <td colSpan={columnCount} style={{ padding: cellPadding }}>
                  <Skeleton tokens={tokens} />
                </td>
              </tr>
            ))}

          {!loading && visibleRows.length === 0 && (
            <tr>
              <td colSpan={columnCount} style={{ padding: 0 }}>
                {typeof empty === "string" ? (
                  <EmptyState title={empty} tokens={tokens} compact />
                ) : (
                  empty
                )}
              </td>
            </tr>
          )}

          {virtual && range.paddingTop > 0 && (
            <tr aria-hidden="true" style={{ height: range.paddingTop }}>
              <td colSpan={columnCount} style={{ padding: 0, border: "none" }} />
            </tr>
          )}

          {!loading &&
            renderedRows.map((row, offset) => {
              const id = getRowId(row);
              const isSelected = selected.includes(id);
              const isActive = activeRowId === id;

              return (
                <tr
                  key={id}
                  // +2: `aria-rowindex` is 1-based and the header is row 1.
                  aria-rowindex={virtual ? range.start + offset + 2 : undefined}
                  aria-selected={selectable ? isSelected : undefined}
                  // A clickable row is a pointer convenience, and it is given
                  // keyboard equivalence rather than being left as a
                  // mouse-only affordance. The fully correct alternative is
                  // the ARIA grid pattern — roving focus across cells — which
                  // is a much larger commitment than these tables need, and
                  // which none of the eight originals attempted either.
                   
                  onClick={onRowClick != null ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick != null
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick != null ? 0 : undefined}
                  style={{
                    backgroundColor: isActive
                      ? t.color.accentSoft
                      : isSelected
                        ? t.color.surfaceRaised
                        : undefined,
                    // The 3px accent edge the estate draws on a selected row.
                    boxShadow: isSelected
                      ? `inset 3px 0 0 0 ${t.color.accent}`
                      : undefined,
                    cursor: onRowClick != null ? "pointer" : undefined,
                  }}
                >
                  {selectable && (
                    <td style={{ padding: cellPadding, borderBottom: `1px solid ${t.color.borderSubtle}` }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        aria-label={
                          getRowLabel != null
                            ? `Select ${getRowLabel(row)}`
                            : `Select row ${id}`
                        }
                        onClick={(e) => e.stopPropagation()}
                        onChange={() =>
                          onSelectionChange?.(
                            isSelected
                              ? selected.filter((s) => s !== id)
                              : [...selected, id],
                          )
                        }
                      />
                    </td>
                  )}

                  {columns.map((column) => (
                    <td
                      key={column.key}
                      style={{
                        padding: cellPadding,
                        textAlign: alignOf(column),
                        borderBottom: `1px solid ${t.color.borderSubtle}`,
                        fontVariantNumeric:
                          column.numeric === true ? "tabular-nums" : undefined,
                        verticalAlign: "top",
                      }}
                    >
                      {column.render?.(row) ??
                        stringify(
                          column.value?.(row) ??
                            (row as Record<string, unknown>)[column.key],
                        )}
                    </td>
                  ))}
                </tr>
              );
            })}

          {virtual && range.paddingBottom > 0 && (
            <tr aria-hidden="true" style={{ height: range.paddingBottom }}>
              <td colSpan={columnCount} style={{ padding: 0, border: "none" }} />
            </tr>
          )}
        </tbody>
      </table>

      {hiddenCount > 0 && (
        <div
          style={{
            padding: cellPadding,
            textAlign: "center",
            borderTop: `1px solid ${t.color.borderSubtle}`,
            fontSize: t.fontSize.md,
            color: t.color.textMuted,
          }}
        >
          {onShowAll != null ? (
            <button
              type="button"
              onClick={onShowAll}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: t.color.link,
                font: "inherit",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              {`+${hiddenCount} more`}
            </button>
          ) : (
            `+${hiddenCount} more`
          )}
        </div>
      )}
    </div>
  );
}

function stringify(value: unknown): React.ReactNode {
  if (value == null) {return null;}
  if (typeof value === "boolean") {return value ? "Yes" : "No";}
  if (typeof value === "object") {return null;}
  return String(value);
}

const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};
