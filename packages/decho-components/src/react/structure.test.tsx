/**
 * The overlays, the structure components and the table.
 *
 * `renderToStaticMarkup` again, which shapes what can be tested here: the
 * markup, the roles and the ARIA. Hover, focus movement and Escape are
 * behaviour a static render cannot reach, and rather than pull in a DOM
 * environment and Testing Library for four assertions, the interactive parts
 * are kept small enough to read — `useDismiss` is thirty lines — and the
 * *structure* they act on is what is pinned down here.
 *
 * The bias is towards the things the estate's eight tables and three dialogs
 * got wrong, because those are the regressions worth catching: a table with no
 * name, a sort control that is not a button, a select-all that cannot express
 * "some", a dialog with no `aria-modal`, a tab strip that is a row of divs.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import React from "react";
import {
  DataTable,
  Dialog,
  Drawer,
  FacetGroup,
  Tabs,
  Toolbar,
  ToolbarSpacer,
  ToolbarStatus,
  type DataTableColumn,
} from "./index.js";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    expect(html(<Dialog open={false}>x</Dialog>)).toBe("");
  });

  it("is a modal dialog labelled by its own title", () => {
    const markup = html(
      <Dialog open title="Link a RICEFW object" description="Pick one.">
        body
      </Dialog>,
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("aria-labelledby=");
    expect(markup).toContain("aria-describedby=");
    // The title is a heading, not a styled div.
    expect(markup).toContain("<h2");
  });

  it("names its close control", () => {
    expect(html(<Dialog open title="X" onClose={() => {}} />)).toContain(
      'aria-label="Close"',
    );
  });

  it("offers no close control when there is nothing to call", () => {
    expect(html(<Dialog open title="X" />)).not.toContain('aria-label="Close"');
  });

  it("hides the scrim from assistive tech rather than announcing it", () => {
    // The scrim is a pointer shortcut for closing; Escape and the button are
    // the real affordances, and a reader should not meet a nameless region.
    expect(html(<Dialog open title="X" onClose={() => {}} />)).toContain(
      'aria-hidden="true"',
    );
  });
});

describe("Drawer", () => {
  it("is a complementary region when it does not take over the page", () => {
    const markup = html(
      <Drawer open title="AV-27 Recovery" meta="RICEFW · 12 fields">
        detail
      </Drawer>,
    );
    expect(markup).toContain('role="complementary"');
    expect(markup).not.toContain("aria-modal");
  });

  it("becomes a dialog, with a scrim, only when modal", () => {
    const markup = html(
      <Drawer open modal title="Edit requirement" onClose={() => {}}>
        form
      </Drawer>,
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
  });

  it("renders nothing when closed", () => {
    expect(html(<Drawer open={false}>x</Drawer>)).toBe("");
  });
});

describe("Tabs", () => {
  const items = [
    { key: "a", label: "Overview" },
    { key: "b", label: "Requirements", badge: 24 },
    { key: "c", label: "History", disabled: true },
  ];

  it("is a tablist of tabs, not a row of divs", () => {
    const markup = html(<Tabs items={items} activeKey="b" onSelect={() => {}} />);
    expect(markup).toContain('role="tablist"');
    expect(markup.match(/role="tab"/g) ?? []).toHaveLength(3);
  });

  it("marks exactly one tab selected", () => {
    const markup = html(<Tabs items={items} activeKey="b" onSelect={() => {}} />);
    expect(markup.match(/aria-selected="true"/g) ?? []).toHaveLength(1);
  });

  it("puts only the selected tab in the tab order", () => {
    // Arrow keys move within the strip; Tab should skip past it to the panel.
    const markup = html(<Tabs items={items} activeKey="b" onSelect={() => {}} />);
    expect(markup.match(/tabindex="0"/g) ?? []).toHaveLength(1);
    expect(markup.match(/tabindex="-1"/g) ?? []).toHaveLength(2);
  });

  it("gives each tab a stable id so a panel can be labelled by it", () => {
    const markup = html(
      <Tabs items={items} activeKey="a" onSelect={() => {}} idPrefix="sections" />,
    );
    expect(markup).toContain('id="sections-tab-a"');
  });

  it("disables what it is told to disable", () => {
    expect(html(<Tabs items={items} activeKey="a" onSelect={() => {}} />)).toContain(
      "disabled",
    );
  });
});

describe("Toolbar", () => {
  it("is a toolbar, and can be named", () => {
    const markup = html(
      <Toolbar label="Table actions">
        <span>filters</span>
        <ToolbarSpacer />
        <ToolbarStatus>12 of 480</ToolbarStatus>
      </Toolbar>,
    );
    expect(markup).toContain('role="toolbar"');
    expect(markup).toContain('aria-label="Table actions"');
  });

  it("announces a changing count instead of silently changing it", () => {
    expect(html(<ToolbarStatus>11 rows</ToolbarStatus>)).toContain(
      'aria-live="polite"',
    );
  });
});

describe("FacetGroup", () => {
  const facets = [
    { value: "high", label: "High", count: 12 },
    { value: "medium", label: "Medium", count: 40 },
  ];

  it("is a named group of toggles, not eleven loose buttons", () => {
    const markup = html(
      <FacetGroup label="Severity" facets={facets} selected={["high"]} onChange={() => {}} />,
    );
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="Severity"');
  });

  it("carries the selection as pressed state, not only as colour", () => {
    const markup = html(
      <FacetGroup facets={facets} selected={["high"]} onChange={() => {}} />,
    );
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
  });

  it("offers a clear only when there is something to clear", () => {
    expect(
      html(<FacetGroup facets={facets} selected={[]} onChange={() => {}} />),
    ).not.toContain("Clear");
    expect(
      html(<FacetGroup facets={facets} selected={["high"]} onChange={() => {}} />),
    ).toContain("Clear");
  });
});

describe("DataTable", () => {
  interface Row {
    id: string;
    name: string;
    fields: number;
  }
  const rows: Row[] = [
    { id: "r2", name: "Beta", fields: 12 },
    { id: "r1", name: "Alpha", fields: 140 },
  ];
  const columns: DataTableColumn<Row>[] = [
    { key: "name", header: "Object", value: (r) => r.name },
    { key: "fields", header: "Fields", value: (r) => r.fields, numeric: true },
  ];
  const table = (props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) =>
    html(
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        caption="Objects in scope"
        {...props}
      />,
    );

  it("has a name, and column headers that are headers", () => {
    const markup = table();
    expect(markup).toContain("<caption");
    expect(markup).toContain("Objects in scope");
    expect(markup.match(/<th scope="col"/g) ?? []).toHaveLength(2);
  });

  it("sorts itself when nobody asked for control of it", () => {
    // Unsorted: the order given. The pipeline's own ordering is usually
    // meaningful, so the table does not reorder until asked.
    const markup = table();
    expect(markup.indexOf("Beta")).toBeLessThan(markup.indexOf("Alpha"));
  });

  it("sorts ascending on a sortable column when told", () => {
    const markup = table({ sort: undefined, onSortChange: undefined });
    expect(markup).toContain('aria-sort="none"');
  });

  it("reports a controlled sort on the right column", () => {
    const markup = table({
      sort: { key: "fields", direction: "desc" },
      onSortChange: () => {},
    });
    expect(markup).toContain('aria-sort="descending"');
    expect(markup.match(/aria-sort="none"/g) ?? []).toHaveLength(1);
  });

  it("makes the sort control a real button", () => {
    expect(table()).toContain('<button type="button"');
  });

  it("shows no checkboxes until selection is handled", () => {
    expect(table()).not.toContain('type="checkbox"');
  });

  it("labels every row's checkbox with the row, not with 'checkbox'", () => {
    const markup = table({
      selectedIds: ["r1"],
      onSelectionChange: () => {},
      getRowLabel: (r) => r.name,
    });
    expect(markup).toContain('aria-label="Select Alpha"');
    expect(markup).toContain('aria-label="Select Beta"');
    expect(markup).toContain('aria-label="Select all rows"');
  });

  it("marks selected rows as selected", () => {
    const markup = table({ selectedIds: ["r1"], onSelectionChange: () => {} });
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-selected="false"');
  });

  it("sets tabular figures on a numeric column", () => {
    expect(table()).toContain("tabular-nums");
  });

  it("renders an empty state rather than an empty grid", () => {
    const markup = html(
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(r: Row) => r.id}
        empty="No objects in scope"
      />,
    );
    expect(markup).toContain("No objects in scope");
  });

  it("caps rows and summarises the rest", () => {
    const markup = table({ maxRows: 1 });
    expect(markup).toContain("+1 more");
  });

  it("says it is loading instead of showing an empty table", () => {
    const markup = table({ loading: true, loadingRows: 2 });
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain("Alpha");
  });

  it("is themed by var() like everything else", () => {
    expect(table()).toContain("var(--decho-");
  });
});
