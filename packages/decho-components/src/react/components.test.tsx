/**
 * The components render, and the accessibility decisions are still there.
 *
 * WHAT THIS IS FOR
 * ----------------
 * Every careful choice in these components — the heatmap being a real table,
 * the nav row being a button with `aria-current`, the breadcrumb's separators
 * being hidden from a screen reader, `type="button"` so a toolbar control
 * cannot submit a form — was protected by nothing until now. They are exactly
 * the sort of thing a later refactor removes without noticing, because nothing
 * about the page looks different afterwards.
 *
 * WHY renderToStaticMarkup AND NOT TESTING LIBRARY
 * ------------------------------------------------
 * The package has no dependencies and this keeps it that way: react-dom is
 * already present wherever these tests run. The trade is real — no hover, no
 * focus, no click — so those are not tested here; they are state transitions
 * the recipes cover. What renders into the markup is precisely the part that
 * matters to a screen reader, and it is the part worth freezing.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AppBreadcrumb,
  AppContent,
  AppFooter,
  AppHeader,
  AppShell,
  AppSidebar,
  AppSidebarNav,
  Button,
  Card,
  DechoSurface,
  NavItem,
  Panel,
  StatusHeatmap,
  Tag,
} from "./index.js";
// Aliased in vitest.config.ts. The product must not import this package;
// the tests may, and here they must: the point of several of them is that a
// real token set from the real styling package flows through unchanged.
import { tokensFor, withAccent } from "@acc/decho-styling";

const modern = tokensFor("modern");

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("landmarks", () => {
  it("uses the elements that carry meaning", () => {
    // Not divs: these are what put "skip to content" and landmark navigation
    // in an app for free.
    expect(html(<AppHeader brand="X" />)).toContain("<header");
    expect(html(<AppContent>c</AppContent>)).toContain("<main");
    expect(html(<AppFooter>f</AppFooter>)).toContain("<footer");
    expect(html(<AppSidebar>s</AppSidebar>)).toContain("<nav");
  });
});

describe("Button", () => {
  it("defaults to type=button, so a toolbar control cannot submit a form", () => {
    expect(html(<Button>Go</Button>)).toContain('type="button"');
  });

  it("can still submit when asked", () => {
    expect(html(<Button type="submit">Save</Button>)).toContain('type="submit"');
  });

  it("is really disabled, not merely faded", () => {
    const markup = html(<Button disabled>Go</Button>);
    expect(markup).toContain("disabled");
    // …and the fade is there too, so it looks disabled as well as being it.
    expect(markup).toMatch(/opacity:\s*0\.4/);
  });
});

describe("NavItem", () => {
  it("is a button, and marks the active row for a screen reader", () => {
    const active = html(<NavItem label="Ops" active />);
    expect(active).toContain("<button");
    expect(active).toContain('type="button"');
    expect(active).toContain('aria-current="page"');
  });

  it("does not claim to be current when it is not", () => {
    expect(html(<NavItem label="Ops" />)).not.toContain("aria-current");
  });
});

describe("AppBreadcrumb", () => {
  const crumbs = [{ label: "Plans", href: "/plans" }, { label: "Exercise 12" }];

  it("is a labelled nav around an ordered list", () => {
    const markup = html(<AppBreadcrumb items={crumbs} />);
    expect(markup).toContain('aria-label="Breadcrumb"');
    expect(markup).toContain("<ol");
  });

  it("marks the last crumb as the page, and does not link it", () => {
    const markup = html(<AppBreadcrumb items={crumbs} />);
    expect(markup).toContain('aria-current="page"');
    // "Exercise 12" is the page you are on; only "Plans" is a link.
    expect(markup.match(/<a /g) ?? []).toHaveLength(1);
  });

  it("hides the separators from a screen reader", () => {
    // Otherwise it reads "Plans slash Exercise 12" instead of "Plans,
    // Exercise 12".
    expect(html(<AppBreadcrumb items={crumbs} />)).toContain('aria-hidden="true"');
  });
});

describe("StatusHeatmap", () => {
  const markup = html(
    <StatusHeatmap
      columns={["W1", "W2"]}
      rows={[{ label: "Supply", cells: ["onTrack", "critical"] }]}
    />,
  );

  it("is a table with row and column headers", () => {
    expect(markup).toContain("<table");
    expect(markup).toContain('scope="col"');
    expect(markup).toContain('scope="row"');
  });

  // The wording is now `core/labels.ts`, shared with the chips and the legend.
  // The heatmap used to keep its own copy, which had already drifted to title
  // case and called `high` "High / At Risk" — two states in one label.
  it("never carries the state in colour alone", () => {
    // The point of the whole component: a RAG grid that a screen reader can
    // read, and that survives being printed in greyscale.
    expect(markup).toContain("On track");
    expect(markup).toContain("Critical");
    expect(markup).toContain("Supply · W2: Critical");
  });

  it("renders an unknown cell as No Data rather than failing", () => {
    const sparse = html(
      <StatusHeatmap columns={["W1", "W2"]} rows={[{ label: "Finance", cells: ["onTrack"] }]} />,
    );
    expect(sparse).toContain("No data");
  });
});

describe("Tag", () => {
  it("draws the dot in currentColor when solid", () => {
    // A green dot on a green fill is an empty circle.
    expect(html(<Tag tone="success" solid dot />)).toContain("currentColor");
  });
});

describe("Card", () => {
  it("renders its title, meta and children", () => {
    const markup = html(
      <Card title="1 PARA" meta="Bn · 612 pax">
        Two platoons detached.
      </Card>,
    );
    expect(markup).toContain("1 PARA");
    expect(markup).toContain("Bn · 612 pax");
    expect(markup).toContain("Two platoons detached.");
  });

  it("stays a div even when interactive", () => {
    // Deliberate: a card that responds to clicks needs a role, a tabIndex and
    // a key handler, and those belong to the caller who knows whether this is
    // a button, a link or a row in a listbox. Guessing produces markup that
    // passes the lint rule and fails the screen reader.
    const markup = html(<Card interactive title="X" />);
    expect(markup.startsWith("<div")).toBe(true);
    expect(markup).not.toContain('role="button"');
  });
});

describe("no stylesheet required", () => {
  it("every component carries its own inline styles", () => {
    // The package's central promise: in a widget where the CSS may not survive
    // the host's bundler, the components still render correctly.
    for (const node of [
      <Card key="card" title="X" />,
      <Tag key="tag" tone="danger">
        x
      </Tag>,
      <Button key="button">x</Button>,
      <Panel key="panel" title="X">
        x
      </Panel>,
      <NavItem key="nav" label="X" />,
    ]) {
      expect(html(node)).toContain("style=");
    }
  });
});

describe("DechoSurface", () => {
  it("adds the theme class and the data attribute for the CSS delivery", () => {
    const markup = html(<DechoSurface theme="modern">x</DechoSurface>);
    expect(markup).toContain("decho-root");
    expect(markup).toContain("decho-modern");
    expect(markup).toContain('data-decho-theme="modern"');
  });

  it("writes a token set as custom properties for the inline delivery", () => {
    const markup = html(<DechoSurface tokens={modern}>x</DechoSurface>);
    // The variable AND the value: writing the name with the wrong value is the
    // failure a class-only assertion misses.
    expect(markup).toContain("--decho-color-accent:" + modern.color.accent);
    expect(markup).toContain("--decho-color-surface:" + modern.color.surface);
  });

  it("names no theme when given none, so it cannot restyle a host", () => {
    const markup = html(<DechoSurface>x</DechoSurface>);
    expect(markup).toContain("decho-root");
    expect(markup).not.toContain("data-decho-theme");
    expect(markup).not.toContain("--decho-color-accent:");
  });

  it("takes a re-tinted set, since an accent is now values rather than a prop", () => {
    const green = withAccent("modern", "#2fbf71");
    const markup = html(<DechoSurface tokens={green}>x</DechoSurface>);
    expect(markup).toContain("--decho-color-accent:" + green.color.accent);
    expect(markup).not.toContain(modern.color.accent);
  });

  /**
   * The nesting bug this package cannot have.
   *
   * Its predecessor published a skin and a resolved token set through React
   * context, so an inner surface given no accent would publish the theme's own
   * over an ancestor's re-tint — green page, indigo shell — and the failure
   * read as "some components ignore the accent" rather than as a boundary.
   *
   * Custom properties inherit through the DOM, and an inner surface writes
   * only what it was given, so an inner surface with no tokens declares
   * nothing and everything inside it keeps the outer theme. There is no
   * inheritance code here to get wrong; this test guards the absence.
   */
  it("does not reset an ancestor's theme when it is given none", () => {
    const markup = html(
      <DechoSurface tokens={modern} filled>
        <DechoSurface>
          <Card title="Unit">x</Card>
        </DechoSurface>
      </DechoSurface>,
    );
    expect(markup.match(/--decho-color-accent:/g) ?? []).toHaveLength(1);
  });

  it("lets an inner surface override the theme for its own subtree", () => {
    const daylight = tokensFor("daylight");
    const markup = html(
      <DechoSurface tokens={modern}>
        <DechoSurface tokens={daylight}>x</DechoSurface>
      </DechoSurface>,
    );
    expect(markup).toContain("--decho-color-surface:" + modern.color.surface);
    expect(markup).toContain("--decho-color-surface:" + daylight.color.surface);
  });

  /**
   * The property that makes the package independent: a component with no
   * theme anywhere above it still emits a colour, because every recipe value
   * is `var(--decho-…, <base value>)`.
   */
  it("styles components from var() with a fallback, so bare usage is correct", () => {
    const markup = html(<Card title="Unit">x</Card>);
    expect(markup).toContain("var(--decho-color-surface,");
    expect(markup).toContain("var(--decho-radius-lg,");
  });
});

describe("AppShell", () => {
  it("composes into a frame without any layout CSS of its own", () => {
    const markup = html(
      <AppShell tokens={modern}>
        <AppHeader brand="Mission Control" />
        <AppSidebar>
          <AppSidebarNav
            items={[
              { key: "a", label: "Overview", group: "Views" },
              { key: "b", label: "Orchestration", group: "Views" },
            ]}
            activeKey="b"
          />
        </AppSidebar>
        <AppContent>page</AppContent>
      </AppShell>,
    );
    expect(markup).toContain("Mission Control");
    expect(markup).toContain("Orchestration");
    // One heading for two contiguous items in the same group.
    expect(markup.match(/Views/g) ?? []).toHaveLength(1);
    expect(markup).toContain('aria-current="page"');
  });
});
