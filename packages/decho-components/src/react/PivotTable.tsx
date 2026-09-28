/**
 * A crosstab: one dimension down, one across, a number in the middle.
 *
 * The engine is `pivot.ts`; this is the table around it, plus the two things
 * that make a pivot readable rather than merely correct:
 *
 *   - A heat scale. A grid of forty numbers is a grid of forty numbers; the
 *     same grid shaded by value is a picture of where the problem is. Shading
 *     is opt-in because it is wrong for a count of anything and right for a
 *     percentage.
 *   - Totals that are visibly totals. A total row that looks like a data row
 *     gets read as one, and then somebody sums the column including it.
 *
 * `null` cells render as a dash, never as a zero — see `pivot.ts` for why that
 * distinction is worth keeping.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { monoStyle } from "../core/recipes.js";
import { pivot, type Aggregation, type PivotSpec } from "./pivot.js";

export interface PivotTableProps<Row>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  rows: Row[];
  /** Row dimension. */
  by: (row: Row) => string;
  /** Column dimension. */
  across: (row: Row) => string;
  /** The number. `null` for "this row has no value here". */
  value: (row: Row) => number | null;
  aggregate?: Aggregation;
  /** Heading above the row dimension. */
  rowLabel?: string;
  /** Format a cell. Defaults to a compact number. */
  format?: (value: number) => string;
  /** Shade cells by value. Off by default; wrong for counts. */
  heat?: boolean;
  /** Row and column totals. */
  totals?: boolean;
  /** Click a cell to drill in. */
  onCellClick?: (rowKey: string, columnKey: string) => void;
  caption?: string;
  tokens?: DechoTokenSet;
}

export function PivotTable<Row>({
  rows,
  by,
  across,
  value,
  aggregate = "sum",
  rowLabel = "",
  format,
  heat = false,
  totals = true,
  onCellClick,
  caption,
  tokens,
  style,
  ...rest
}: PivotTableProps<Row>): React.ReactElement {
  const t = resolveTokens(tokens);

  const spec: PivotSpec<Row> = { row: by, column: across, value, aggregate };
  const table = React.useMemo(
    () => pivot(rows, spec),
    // The accessors are usually inline arrows, so depending on them would
    // recompute every render and the memo would be a lie. The data and the
    // aggregation are what actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, aggregate],
  );

  const show = (cell: number | null): string => {
    if (cell == null) {
      return "—";
    }
    if (format != null) {
      return format(cell);
    }
    // Two decimals only when they say something: "40" rather than "40.00",
    // "19.67" rather than "19.666666666666668".
    return Number.isInteger(cell) ? `${cell}` : cell.toFixed(2);
  };

  /* The range used for shading, from the cells only — totals are bigger by
     construction and would flatten every cell to the pale end of the scale. */
  const extent = React.useMemo(() => {
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (const rowKey of table.rowKeys) {
      for (const columnKey of table.columnKeys) {
        const cell = table.cell(rowKey, columnKey);
        if (cell != null) {
          low = Math.min(low, cell);
          high = Math.max(high, cell);
        }
      }
    }
    return Number.isFinite(low) ? { low, high } : null;
  }, [table]);

  const shade = (cell: number | null): string | undefined => {
    if (!heat || cell == null || extent == null || extent.high === extent.low) {
      return undefined;
    }
    const share = (cell - extent.low) / (extent.high - extent.low);
    // `color-mix` against the surface rather than an alpha: a translucent wash
    // over an unpainted host page takes the host's colour, which is the bug
    // the tint tokens exist for. `color-mix` has been in every browser since
    // 2023 and degrades to the second colour where it is not supported.
    return `color-mix(in srgb, ${t.color.accent} ${Math.round(share * 55)}%, ${t.color.surface})`;
  };

  const cellStyle: React.CSSProperties = {
    padding: `${t.space[3]} ${t.space[4]}`,
    borderBottom: `1px solid ${t.color.borderSubtle}`,
    fontSize: t.fontSize.md,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };

  const headerStyle: React.CSSProperties = {
    ...cellStyle,
    position: "sticky",
    top: 0,
    background: t.color.surfaceRaised,
    color: t.color.textMuted,
    fontSize: t.fontSize.sm,
    fontWeight: 600,
    zIndex: 1,
  };

  return (
    <div
      {...rest}
      style={{
        overflow: "auto",
        border: `1px solid ${t.color.borderSubtle}`,
        borderRadius: t.radius.lg,
        background: t.color.surface,
        fontFamily: t.fontFamily.sans,
        ...style,
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        {caption != null && (
          <caption
            style={{
              padding: `${t.space[4]} ${t.space[4]} ${t.space[3]}`,
              textAlign: "left",
              fontSize: t.fontSize.sm,
              color: t.color.textMuted,
            }}
          >
            {caption}
          </caption>
        )}
        <thead>
          <tr>
            <th scope="col" style={{ ...headerStyle, textAlign: "left", left: 0, zIndex: 2 }}>
              {rowLabel}
            </th>
            {table.columnKeys.map((columnKey) => (
              <th key={columnKey} scope="col" style={headerStyle}>
                {columnKey}
              </th>
            ))}
            {totals && (
              <th scope="col" style={{ ...headerStyle, color: t.color.text }}>
                Total
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {table.rowKeys.map((rowKey) => (
            <tr key={rowKey}>
              <th
                scope="row"
                style={{
                  ...cellStyle,
                  textAlign: "left",
                  fontWeight: 500,
                  color: t.color.text,
                  position: "sticky",
                  left: 0,
                  background: t.color.surface,
                }}
              >
                {rowKey}
              </th>
              {table.columnKeys.map((columnKey) => {
                const cell = table.cell(rowKey, columnKey);
                const interactive = onCellClick != null && cell != null;
                return (
                  <td
                    key={columnKey}
                    style={{
                      ...cellStyle,
                      background: shade(cell),
                      color: cell == null ? t.color.textFaint : t.color.text,
                      cursor: interactive ? "pointer" : undefined,
                      padding: 0,
                    }}
                  >
                    {interactive ? (
                      <button
                        type="button"
                        onClick={() => onCellClick?.(rowKey, columnKey)}
                        title={`${rowKey} · ${columnKey} · ${table.count(rowKey, columnKey)} rows`}
                        style={{
                          width: "100%",
                          padding: `${t.space[3]} ${t.space[4]}`,
                          border: "none",
                          background: "transparent",
                          color: "inherit",
                          font: "inherit",
                          fontVariantNumeric: "tabular-nums",
                          textAlign: "right",
                          cursor: "pointer",
                        }}
                      >
                        {show(cell)}
                      </button>
                    ) : (
                      <span style={{ display: "block", padding: `${t.space[3]} ${t.space[4]}` }}>
                        {show(cell)}
                      </span>
                    )}
                  </td>
                );
              })}
              {totals && (
                <td style={{ ...cellStyle, ...monoStyle({ tokens }), fontWeight: 600 }}>
                  {show(table.rowTotal(rowKey))}
                </td>
              )}
            </tr>
          ))}
        </tbody>

        {totals && (
          /* In a `<tfoot>` rather than as a last row: it is what makes the
             total row a total row to a screen reader, and it keeps it put when
             the body scrolls. */
          <tfoot>
            <tr>
              <th
                scope="row"
                style={{
                  ...cellStyle,
                  textAlign: "left",
                  fontWeight: 600,
                  borderTop: `2px solid ${t.color.border}`,
                  background: t.color.surfaceRaised,
                }}
              >
                Total
              </th>
              {table.columnKeys.map((columnKey) => (
                <td
                  key={columnKey}
                  style={{
                    ...cellStyle,
                    ...monoStyle({ tokens }),
                    fontWeight: 600,
                    borderTop: `2px solid ${t.color.border}`,
                    background: t.color.surfaceRaised,
                  }}
                >
                  {show(table.columnTotal(columnKey))}
                </td>
              ))}
              <td
                style={{
                  ...cellStyle,
                  ...monoStyle({ tokens }),
                  fontWeight: 700,
                  borderTop: `2px solid ${t.color.border}`,
                  background: t.color.surfaceRaised,
                }}
              >
                {show(table.grandTotal)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
