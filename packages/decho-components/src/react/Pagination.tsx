/**
 * Paging, and the "load more" variant.
 *
 * `DataTable` currently has `maxRows` plus an `onShowAll`, which is the right
 * behaviour for a widget showing the top ten and the wrong one for a table
 * somebody has to work through. Both patterns are here because both are
 * correct in different places: a pager for a table you audit row by row, a
 * `LoadMore` for a feed you skim.
 *
 * The page numbers come from `pageMath`, which is where the off-by-ones live.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle } from "../core/recipes.js";
import { Icon } from "./Icon.js";
import { pageInfo, pageSummary, pageWindow, type PageInfo } from "./pageMath.js";
import { Select } from "./Select.js";

export interface PaginationProps extends Omit<React.HTMLAttributes<HTMLElement>, "onChange"> {
  /** Zero-based. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Offer a page-size select. Omit to leave the size fixed. */
  pageSizes?: number[];
  onPageSizeChange?: (size: number) => void;
  /** "objects", "rows", "vendors". */
  noun?: string;
  /** How many numbered buttons; the window keeps this width. */
  span?: number;
  /** Just the arrows and the summary, for a narrow widget. */
  compact?: boolean;
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizes,
  onPageSizeChange,
  noun = "rows",
  span = 5,
  compact = false,
  size = "sm",
  tokens,
  style,
  ...rest
}: PaginationProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const info = pageInfo({ page, pageSize, total });
  const tokensToShow = compact ? [] : pageWindow(info.page, info.pageCount, span);

  return (
    <nav
      {...rest}
      // A nav landmark with a name: a table with a pager above and below it
      // otherwise gives a screen-reader user two identical unnamed regions.
      aria-label={`${noun} pagination`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: t.space[5],
        flexWrap: "wrap",
        fontFamily: t.fontFamily.sans,
        fontSize: size === "sm" ? t.fontSize.sm : t.fontSize.md,
        color: t.color.textMuted,
        ...style,
      }}
    >
      {/*
        The summary is a live region: changing page updates the numbers, and
        without this the only announcement is "button pressed", which does not
        say where you now are.
      */}
      <span aria-live="polite" style={{ fontVariantNumeric: "tabular-nums" }}>
        {pageSummary(info, noun)}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: t.space[3] }}>
        {pageSizes != null && onPageSizeChange != null && (
          <div style={{ minWidth: 104 }}>
            <Select
              options={pageSizes.map((value) => ({
                value: `${value}`,
                label: `${value} / page`,
              }))}
              value={`${pageSize}`}
              onValueChange={(value) => {
                if (value != null) {
                  onPageSizeChange(Number(value));
                }
              }}
              size="sm"
              tokens={tokens}
            />
          </div>
        )}

        <PageButton
          label="First page"
          icon="chevronsLeft"
          disabled={!info.hasPrevious}
          onClick={() => onPageChange(0)}
          tokens={tokens}
        />
        <PageButton
          label="Previous page"
          icon="chevronLeft"
          disabled={!info.hasPrevious}
          onClick={() => onPageChange(info.page - 1)}
          tokens={tokens}
        />

        {tokensToShow.map((token, index) =>
          token == null ? (
            <span
              // Gaps have no identity of their own; their position is the key.
              key={`gap-${index}`}
              aria-hidden="true"
              style={{ padding: `0 ${t.space[2]}`, color: t.color.textFaint }}
            >
              …
            </span>
          ) : (
            <NumberButton
              key={token}
              page={token}
              current={info.page}
              onClick={() => onPageChange(token)}
              tokens={tokens}
            />
          ),
        )}

        <PageButton
          label="Next page"
          icon="chevronRight"
          disabled={!info.hasNext}
          onClick={() => onPageChange(info.page + 1)}
          tokens={tokens}
        />
        <PageButton
          label="Last page"
          icon="chevronsRight"
          disabled={!info.hasNext}
          onClick={() => onPageChange(info.pageCount - 1)}
          tokens={tokens}
        />
      </div>
    </nav>
  );
}

function PageButton({
  label,
  icon,
  disabled,
  onClick,
  tokens,
}: {
  label: string;
  icon: "chevronLeft" | "chevronRight" | "chevronsLeft" | "chevronsRight";
  disabled: boolean;
  onClick: () => void;
  tokens?: DechoTokenSet;
}): React.ReactElement {
  const t = resolveTokens(tokens);
  const [focused, setFocused] = React.useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        display: "flex",
        padding: 4,
        border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.sm,
        background: t.color.surface,
        color: disabled ? t.color.textFaint : t.color.text,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        outline: "none",
        ...(focused ? focusRingStyle({ tokens }) : {}),
      }}
    >
      <Icon name={icon} size={13} />
    </button>
  );
}

function NumberButton({
  page,
  current,
  onClick,
  tokens,
}: {
  page: number;
  current: number;
  onClick: () => void;
  tokens?: DechoTokenSet;
}): React.ReactElement {
  const t = resolveTokens(tokens);
  const [focused, setFocused] = React.useState(false);
  const active = page === current;
  return (
    <button
      type="button"
      // Both: the number for sighted users, the sentence for everyone else,
      // and `aria-current` so "the page you are on" is a state rather than a
      // colour.
      aria-label={`Page ${page + 1}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        minWidth: 26,
        padding: "3px 6px",
        border: `1px solid ${active ? t.color.accent : t.color.border}`,
        borderRadius: t.radius.sm,
        background: active ? t.color.accentTint : t.color.surface,
        color: active ? t.color.accent : t.color.text,
        font: "inherit",
        fontWeight: active ? 600 : 400,
        fontVariantNumeric: "tabular-nums",
        cursor: "pointer",
        outline: "none",
        ...(focused ? focusRingStyle({ tokens }) : {}),
      }}
    >
      {page + 1}
    </button>
  );
}

export interface LoadMoreProps extends React.HTMLAttributes<HTMLDivElement> {
  /** How many are on screen. */
  loaded: number;
  /** How many there are, if known. Unknown totals are normal with an object set. */
  total?: number;
  onLoadMore: () => void;
  loading?: boolean;
  noun?: string;
  tokens?: DechoTokenSet;
}

/** The feed variant: a count, and a button that adds to it. */
export function LoadMore({
  loaded,
  total,
  onLoadMore,
  loading = false,
  noun = "rows",
  tokens,
  style,
  ...rest
}: LoadMoreProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const done = total != null && loaded >= total;

  return (
    <div
      {...rest}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: t.space[4],
        padding: t.space[5],
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.sm,
        color: t.color.textMuted,
        ...style,
      }}
    >
      <span aria-live="polite">
        {total != null ? `${loaded} of ${total} ${noun}` : `${loaded} ${noun}`}
      </span>
      {!done && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          aria-busy={loading ? true : undefined}
          style={{
            padding: `${t.space[2]} ${t.space[5]}`,
            border: `1px solid ${t.color.border}`,
            borderRadius: t.radius.sm,
            background: t.color.surface,
            color: t.color.text,
            font: "inherit",
            cursor: loading ? "progress" : "pointer",
          }}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

export type { PageInfo };
