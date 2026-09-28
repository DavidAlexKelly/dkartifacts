/**
 * The library, showing itself: every component, live, in one grid.
 *
 * WHY THIS IS A COMPONENT AND NOT A DOCS PAGE
 * -------------------------------------------
 * A showcase kept in a separate app is a showcase that is one release behind.
 * The five widget sets in this estate each rebuilt the same progress bar
 * because nobody could see, in ten seconds, that one already existed — and a
 * gallery nobody can reach from the package they just installed does not fix
 * that. This ships *with* the components, renders with no theme, no stylesheet
 * and no provider like everything else here, and is two lines to drop into any
 * app, a Workshop widget or a scratch route:
 *
 *     import { ComponentShowcase } from "@acc/decho-components";
 *     <ComponentShowcase />
 *
 * WHY IT CANNOT GO STALE
 * ----------------------
 * `showcase.test.tsx` imports the package's own entry point and asserts that
 * every exported component appears in `SHOWCASE_SPECIMENS`. Add a component
 * and forget it and the test fails, naming it.
 *
 * The specimens themselves are in `showcaseSpecimens.tsx` — a file of data
 * rather than of components, which is both what makes that test possible and
 * what keeps this one exporting a component and nothing else, as fast refresh
 * requires.
 */

import React from "react";
import { inputStyle, monoStyle } from "../core/recipes.js";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { Card } from "./Card.js";
import { DechoSurface } from "./DechoSurface.js";
import { EmptyState } from "./EmptyState.js";
import { FacetGroup } from "./FacetGroup.js";
import { SectionHeader } from "./SectionHeader.js";
import { Tag } from "./Tag.js";
import {
  SHOWCASE_GROUPS,
  SHOWCASE_SPECIMENS,
  type ShowcaseGroup,
} from "./showcaseSpecimens.js";

export interface ComponentShowcaseProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /**
   * A theme, as values — `tokensFor("accenture-sap")` from @acc/decho-styling.
   *
   * Written onto the wrapper as custom properties, so every specimen follows
   * it. Omit it and the showcase renders in the base theme, which is the point
   * of the fallbacks.
   */
  tokens?: DechoTokenSet;
  /** A theme, as a name, for the CSS delivery. See `DechoSurface`. */
  theme?: string;
  /** Only these shelves. Defaults to all of them, in `SHOWCASE_GROUPS` order. */
  groups?: readonly ShowcaseGroup[];
  /**
   * Filter by component name, case-insensitive.
   *
   * Supplying this makes the search box a controlled thing and hides the
   * built-in one: a page with two search boxes that disagree is worse than a
   * page with none.
   */
  query?: string;
  /** The search box and the group filter. On by default. */
  controls?: boolean;
  /** Minimum column width in px; the grid wraps to fit. Default 320. */
  columnWidth?: number;
  /** Heading and count above the grid. On by default. */
  heading?: boolean;
}

export function ComponentShowcase({
  tokens,
  theme,
  groups,
  query,
  controls = true,
  columnWidth = 320,
  heading = true,
  style,
  ...rest
}: ComponentShowcaseProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [typed, setTyped] = React.useState("");
  const [shelves, setShelves] = React.useState<string[]>([]);

  const controlled = query != null;
  const search = (controlled ? query : typed).trim().toLowerCase();

  const allowed = groups ?? SHOWCASE_GROUPS;
  const chosen = shelves.length > 0 ? shelves : allowed;

  const matches = SHOWCASE_SPECIMENS.filter((specimen) => {
    if (!allowed.includes(specimen.group)) {
      return false;
    }
    if (!chosen.includes(specimen.group)) {
      return false;
    }
    if (search === "") {
      return true;
    }
    // Name, the names it also covers, and the description: searching for
    // "sidebar" should find the shell, and searching for "empty" should find
    // the component whose description is the only place that word appears.
    const haystack = [specimen.name, ...(specimen.also ?? []), specimen.description]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });

  const shown = SHOWCASE_GROUPS.filter(
    (group) => allowed.includes(group) && matches.some((s) => s.group === group),
  );

  const body = (
    <div
      {...rest}
      style={{
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.md,
        color: t.color.text,
        display: "grid",
        gap: t.space[7],
        ...style,
      }}
    >
      {heading && (
        <SectionHeader
          title="Component showcase"
          description={`${SHOWCASE_SPECIMENS.length} components, live, in the theme this page is in. Everything here is from @acc/decho-components.`}
          actions={<Tag tone="accent">{`${matches.length} shown`}</Tag>}
          tokens={tokens}
          divider
        />
      )}

      {controls && (
        <div style={{ display: "flex", gap: t.space[5], flexWrap: "wrap", alignItems: "flex-end" }}>
          {!controlled && (
            <label style={{ display: "grid", gap: t.space[2] }}>
              <span style={{ fontSize: t.fontSize.sm, color: t.color.textMuted }}>
                Search
              </span>
              <input
                type="search"
                value={typed}
                placeholder="progress, empty, sidebar…"
                onChange={(event) => setTyped(event.target.value)}
                style={{ ...inputStyle({ tokens }), minWidth: 240 }}
              />
            </label>
          )}
          <FacetGroup
            label="Group"
            facets={allowed.map((group) => ({
              value: group,
              label: group,
              count: SHOWCASE_SPECIMENS.filter((s) => s.group === group).length,
            }))}
            selected={shelves}
            onChange={setShelves}
            multiple
            clearable
            tokens={tokens}
          />
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState
          outlined
          title="No component matches"
          description="Nothing in the library answers to that. Try a word from what it does rather than what it is called."
          tokens={tokens}
        />
      ) : (
        shown.map((group) => (
          <section key={group} style={{ display: "grid", gap: t.space[5] }}>
            <SectionHeader title={group} size="label" level={3} tokens={tokens} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(auto-fill, minmax(${columnWidth}px, 1fr))`,
                gap: t.space[5],
                alignItems: "start",
              }}
            >
              {matches
                .filter((specimen) => specimen.group === group)
                .map((specimen) => (
                  <Card
                    key={specimen.name}
                    tokens={tokens}
                    title={
                      <span style={{ ...monoStyle({ tokens }), fontSize: t.fontSize.lg }}>
                        {specimen.name}
                      </span>
                    }
                    meta={specimen.description}
                    footer={
                      specimen.also != null ? (
                        <span style={{ fontSize: t.fontSize.sm, color: t.color.textFaint }}>
                          {`also shown: ${specimen.also.join(" · ")}`}
                        </span>
                      ) : undefined
                    }
                  >
                    {/* The example sits in its own box so a tall one — a table,
                        a transcript — cannot stretch the row it is in. */}
                    <div style={{ maxHeight: 320, overflow: "auto" }}>{specimen.render()}</div>
                  </Card>
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );

  // A surface only when there is something to declare. An unconditional
  // wrapper would put an empty `decho-root` in the way of a host's own theme.
  return tokens != null || theme != null ? (
    <DechoSurface tokens={tokens} theme={theme}>
      {body}
    </DechoSurface>
  ) : (
    body
  );
}
