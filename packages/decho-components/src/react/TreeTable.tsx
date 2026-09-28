/**
 * A hierarchy with columns: object trees, BOM explosions, workstream rollups.
 *
 * `role="treegrid"`, which is the honest role for "a table whose rows nest".
 * The keyboard contract that comes with it is in `tree.ts` — Right opens and
 * steps in, Left closes and steps out — and it is the reason this is a
 * component rather than a `DataTable` with indented labels: the indentation is
 * the easy half.
 *
 * WHY THE ROWS ARE FLAT
 * ---------------------
 * `flattenTree` turns the nesting plus the expansion set into a list of
 * visible rows, so this renders one `<tr>` per visible node with an indent,
 * rather than nesting tables. Nested tables cannot be virtualised, cannot be
 * keyboard-navigated as one grid, and align their columns only by accident.
 */

/* eslint-disable jsx-a11y/no-noninteractive-element-to-interactive-role,
      jsx-a11y/no-noninteractive-element-interactions,
      jsx-a11y/no-noninteractive-tabindex --
      A treegrid IS a table with an interactive role: that is the ARIA pattern,
      not a workaround for one. The `<tbody>` holds the single tab stop and the
      arrow-key handler for the same reason — a grid is navigated inside one
      stop rather than by tabbing through forty rows. Doing what these three
      rules ask would leave a table that cannot be operated by keyboard at all,
      which is the opposite of what they exist for. */

import React from "react";
import { focusRingStyle } from "../core/recipes.js";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { Icon } from "./Icon.js";
import { flattenTree, toggleNode, treeKey, type FlatRow, type TreeNode } from "./tree.js";

export interface TreeColumn<T> {
  key: string;
  header: React.ReactNode;
  /** The first column carries the expander and the indent. */
  render?: (data: T, row: FlatRow<T>) => React.ReactNode;
  align?: "left" | "right";
  width?: number | string;
}

export interface TreeTableProps<T> extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  nodes: TreeNode<T>[];
  columns: TreeColumn<T>[];
  /** Controlled expansion. Omit for uncontrolled. */
  expanded?: Set<string>;
  onExpandedChange?: (expanded: Set<string>) => void;
  defaultExpanded?: string[];
  /** The row the user is on. */
  activeId?: string;
  onActiveChange?: (id: string) => void;
  onRowClick?: (node: TreeNode<T>) => void;
  /** Pixels per level. */
  indent?: number;
  density?: "compact" | "default";
  caption?: string;
  empty?: React.ReactNode;
  tokens?: DechoTokenSet;
}

export function TreeTable<T>({
  nodes,
  columns,
  expanded,
  onExpandedChange,
  defaultExpanded = [],
  activeId,
  onActiveChange,
  onRowClick,
  indent = 16,
  density = "default",
  caption,
  empty = "Nothing to show",
  tokens,
  style,
  ...rest
}: TreeTableProps<T>): React.ReactElement {
  const t = resolveTokens(tokens);
  const [internal, setInternal] = React.useState<Set<string>>(new Set(defaultExpanded));
  const controlled = expanded != null;
  const open = controlled ? expanded : internal;
  const [focused, setFocused] = React.useState(false);

  const rows = React.useMemo(() => flattenTree(nodes, open), [nodes, open]);
  const activeIndex = Math.max(
    0,
    rows.findIndex((row) => row.node.id === activeId),
  );

  const setOpen = (next: Set<string>): void => {
    if (!controlled) {
      setInternal(next);
    }
    onExpandedChange?.(next);
  };

  const padding = density === "compact" ? `${t.space[2]} ${t.space[4]}` : `${t.space[4]}`;

  const onKeyDown = (event: React.KeyboardEvent<HTMLTableSectionElement>): void => {
    const result = treeKey(rows, activeIndex, event.key, open);
    if (result.index == null && result.expanded == null) {
      return;
    }
    event.preventDefault();
    if (result.expanded != null) {
      setOpen(result.expanded);
    }
    if (result.index != null) {
      const target = rows[result.index];
      if (target != null) {
        onActiveChange?.(target.node.id);
      }
    }
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
      <table
        role="treegrid"
        aria-label={caption}
        style={{ width: "100%", borderCollapse: "collapse", fontSize: t.fontSize.md }}
      >
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
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{
                  padding,
                  width: column.width,
                  textAlign: column.align ?? "left",
                  borderBottom: `1px solid ${t.color.border}`,
                  background: t.color.surfaceRaised,
                  color: t.color.textMuted,
                  fontSize: t.fontSize.sm,
                  fontWeight: 600,
                  position: "sticky",
                  top: 0,
                }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody
          // One tab stop for the whole grid, with the arrows moving inside it:
          // the treegrid contract. Forty rows of forty tab stops is the thing
          // this avoids.
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ outline: "none", ...(focused ? focusRingStyle({ tokens }) : {}) }}
        >
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                style={{ padding: t.space[6], textAlign: "center", color: t.color.textFaint }}
              >
                {empty}
              </td>
            </tr>
          )}

          {rows.map((row) => {
            const isActive = row.node.id === activeId;
            return (
              <tr
                key={row.node.id}
                // The three attributes that make nesting audible: how deep,
                // where in the level, and whether it is open.
                aria-level={row.depth + 1}
                aria-expanded={row.hasChildren ? row.expanded : undefined}
                aria-selected={isActive}
                onClick={() => {
                  onActiveChange?.(row.node.id);
                  onRowClick?.(row.node);
                }}
                style={{
                  background: isActive ? t.color.accentTint : undefined,
                  cursor: onRowClick != null ? "pointer" : undefined,
                }}
              >
                {columns.map((column, columnIndex) => (
                  <td
                    key={column.key}
                    style={{
                      padding,
                      paddingLeft:
                        columnIndex === 0 ? `calc(${t.space[4]} + ${row.depth * indent}px)` : undefined,
                      textAlign: column.align ?? "left",
                      borderBottom: `1px solid ${t.color.borderSubtle}`,
                      color: t.color.text,
                      fontVariantNumeric: column.align === "right" ? "tabular-nums" : undefined,
                      whiteSpace: columnIndex === 0 ? "nowrap" : undefined,
                    }}
                  >
                    {columnIndex === 0 ? (
                      <span style={{ display: "flex", alignItems: "center", gap: t.space[2] }}>
                        {row.hasChildren ? (
                          <button
                            type="button"
                            // -1: the row is the thing being navigated, and a
                            // focusable chevron would add a second tab stop
                            // per row. The keyboard path is Right/Left.
                            tabIndex={-1}
                            aria-label={row.expanded ? "Collapse" : "Expand"}
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpen(toggleNode(open, row.node.id));
                            }}
                            style={{
                              display: "flex",
                              padding: 0,
                              border: "none",
                              background: "transparent",
                              color: t.color.textMuted,
                              cursor: "pointer",
                            }}
                          >
                            <Icon
                              name="chevronRight"
                              size={12}
                              style={{
                                transform: row.expanded ? "rotate(90deg)" : "none",
                                transition: t.effect.transition,
                              }}
                            />
                          </button>
                        ) : (
                          // A spacer the width of the chevron, so leaves line
                          // up with their siblings rather than shifting left.
                          <span aria-hidden="true" style={{ width: 12, flex: "0 0 auto" }} />
                        )}
                        {column.render?.(row.node.data, row) ?? row.node.id}
                      </span>
                    ) : (
                      column.render?.(row.node.data, row)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
