/**
 * The components lifted out of the migration widget sets.
 *
 * Rendered with `renderToStaticMarkup` rather than Testing Library, as the
 * rest of this package is: these are presentational components with no data
 * layer, so the markup and the attributes *are* the behaviour.
 *
 * What is asserted is deliberately narrow. Not "the bar is 42% wide", which is
 * a restatement of the implementation, but the things the originals got wrong
 * and which no reviewer would notice from a screenshot:
 *
 *   - a state or a share is never carried by colour alone;
 *   - anything clickable is a real button;
 *   - every value comes from a token, so a theme switch moves everything.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import React from "react";
import { tokensFor } from "@acc/decho-styling";
import {
  Callout,
  EmptyState,
  KpiTile,
  Legend,
  MetricTile,
  ProgressBar,
  SectionHeader,
  Skeleton,
  StackedBar,
  StatusChip,
  StatusDot,
  Tooltip,
} from "./index.js";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const sap = tokensFor("accenture-sap");

describe("ProgressBar", () => {
  it("is a progressbar with all three ARIA values", () => {
    const markup = html(<ProgressBar value={42} label="Mapped" />);
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="42"');
    expect(markup).toContain('aria-valuemin="0"');
    expect(markup).toContain('aria-valuemax="100"');
  });

  it("renders the figure as text too, not only as a width", () => {
    expect(html(<ProgressBar value={42} />)).toContain("42%");
  });

  it("scales to a max that is not 100", () => {
    const markup = html(<ProgressBar value={3} max={4} />);
    expect(markup).toContain("75%");
    expect(markup).toContain('aria-valuemax="4"');
  });

  it("clamps rather than overflowing its track", () => {
    expect(html(<ProgressBar value={140} />)).toContain("100%");
    expect(html(<ProgressBar value={-5} />)).toContain("0%");
  });

  it("says it is loading when indeterminate, instead of showing a false zero", () => {
    const markup = html(<ProgressBar value={0} indeterminate />);
    expect(markup).toContain('aria-valuetext="Loading"');
    expect(markup).not.toContain("aria-valuenow");
    // No rendered figure at all. Matched as a text node rather than as a
    // substring, because "0%" also occurs inside `width:100%`.
    expect(markup).not.toMatch(/>\d+%</);
  });

  it("names itself when it has no visible label", () => {
    expect(html(<ProgressBar value={10} />)).toContain('aria-label="Progress"');
  });

  it("takes its fill from a RAG state when given one", () => {
    const markup = html(<ProgressBar value={50} status="atRisk" tokens={sap} />);
    expect(markup).toContain(sap.status.atRisk);
  });
});

describe("StatusChip", () => {
  it("labels the state in words, not only in colour", () => {
    expect(html(<StatusChip status="atRisk" />)).toContain("At risk");
  });

  it("uses the theme's RAG colour, and the same one in both deliveries", () => {
    expect(html(<StatusChip status="critical" tokens={sap} />)).toContain(
      sap.status.critical,
    );
  });

  it("reads the colour from a variable when no tokens are given", () => {
    expect(html(<StatusChip status="onTrack" />)).toContain(
      "var(--decho-status-on-track,",
    );
  });

  it("lets the wording be overridden but not the colour", () => {
    const markup = html(<StatusChip status="noData">Awaiting load</StatusChip>);
    expect(markup).toContain("Awaiting load");
    expect(markup).not.toContain("No data");
  });
});

describe("StatusDot", () => {
  it("carries the state in its accessible name when it has no label", () => {
    const markup = html(<StatusDot status="complete" />);
    expect(markup).toContain('aria-label="Complete"');
    expect(markup).toContain('role="img"');
  });

  it("hides itself from the reader when the label is already visible", () => {
    const markup = html(<StatusDot status="complete" label="Complete" />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/Complete/g) ?? []).toHaveLength(1);
  });
});

describe("MetricTile and KpiTile", () => {
  it("are plain divs when they do nothing", () => {
    expect(html(<MetricTile label="Objects" value={412} />)).not.toContain(
      "<button",
    );
  });

  it("are real buttons when they do something", () => {
    const markup = html(
      <MetricTile label="Objects" value={412} onClick={() => {}} selected />,
    );
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it("set tabular figures, so a polled number does not reflow", () => {
    expect(html(<MetricTile label="Objects" value={412} />)).toContain(
      "tabular-nums",
    );
  });

  it("wash the KPI icon with the accentSoft token, not an alpha-appended hex", () => {
    const markup = html(<KpiTile label="Runs" value={12} icon="▣" tokens={sap} />);
    expect(markup).toContain(sap.color.accentSoft);
    // The estate wrote `${accent}18`; that cannot survive a var() value and is
    // the reason this token exists.
    expect(markup).not.toContain(`${sap.color.accent}18`);
  });

  it("hides a decorative icon from the reader", () => {
    expect(html(<KpiTile label="Runs" value={12} icon="▣" />)).toContain(
      'aria-hidden="true"',
    );
  });
});

describe("StackedBar", () => {
  const segments = [
    { label: "Complete", value: 30, status: "complete" as const },
    { label: "In flight", value: 10, status: "onTrack" as const },
  ];

  it("puts the label, count and share in each band's accessible name", () => {
    const markup = html(<StackedBar segments={segments} />);
    expect(markup).toContain('aria-label="Complete: 30 (75%)"');
    expect(markup).toContain('aria-label="In flight: 10 (25%)"');
  });

  it("makes the bands buttons only when they are selectable", () => {
    expect(html(<StackedBar segments={segments} />)).not.toContain("<button");
    const selectable = html(<StackedBar segments={segments} onSelect={() => {}} />);
    expect(selectable).toContain('type="button"');
  });

  it("shares against an explicit total, so a part-measured whole is honest", () => {
    const markup = html(<StackedBar segments={segments} total={80} />);
    expect(markup).toContain("(38%)");
  });

  it("drops empty segments rather than drawing a zero-width band", () => {
    const markup = html(
      <StackedBar segments={[...segments, { label: "Blocked", value: 0 }]} />,
    );
    expect(markup).not.toContain("Blocked: 0");
  });
});

describe("Legend", () => {
  it("takes its wording from the state it is keying", () => {
    expect(html(<Legend items={[{ status: "atRisk" }]} />)).toContain("At risk");
  });

  it("carries which entries are active as a pressed state, not as opacity alone", () => {
    const markup = html(
      <Legend
        items={[{ status: "atRisk" }, { status: "onTrack" }]}
        active={["At risk"]}
        onSelect={() => {}}
      />,
    );
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
  });
});

describe("Callout", () => {
  it("interrupts for danger and stays quiet otherwise", () => {
    expect(html(<Callout tone="danger">Load failed</Callout>)).toContain(
      'role="alert"',
    );
    expect(html(<Callout tone="warning">Partial data</Callout>)).not.toContain(
      "role=",
    );
  });
});

describe("EmptyState", () => {
  it("renders the words it is given and nothing of its own", () => {
    const markup = html(
      <EmptyState
        title="No object set"
        description="Connect one in the widget configuration."
      />,
    );
    expect(markup).toContain("No object set");
    expect(markup).toContain("Connect one in the widget configuration.");
  });

  it("distinguishes configured-but-empty with an outline", () => {
    expect(html(<EmptyState title="No rows" outlined />)).toContain("dashed");
  });
});

describe("SectionHeader", () => {
  it("renders a real heading at the level it is told", () => {
    expect(html(<SectionHeader title="Workstreams" level={3} />)).toContain(
      "<h3",
    );
  });

  it("keeps the level and the size independent", () => {
    const markup = html(<SectionHeader title="Workstreams" level={2} size="label" />);
    expect(markup).toContain("<h2");
    expect(markup).toContain("uppercase");
  });
});

describe("Skeleton", () => {
  it("announces that it is loading", () => {
    const markup = html(<Skeleton lines={3} />);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Loading");
  });

  it("can render with no animation at all, for a host that forbids one", () => {
    expect(html(<Skeleton animated={false} />)).not.toContain("animation");
  });
});

describe("Tooltip", () => {
  it("describes its trigger rather than merely drawing next to it", () => {
    // Closed on the server: the tooltip is hover/focus state, and a static
    // render is the closed case — which is also what a crawler should see.
    const markup = html(
      <Tooltip content="The last successful load">
        <button type="button">Loaded</button>
      </Tooltip>,
    );
    expect(markup).toContain("<button");
    expect(markup).not.toContain('role="tooltip"');
  });
});

describe("every one of them", () => {
  it("emits var() references, so it is themed by an ancestor and correct without one", () => {
    for (const node of [
      <ProgressBar key="p" value={10} />,
      <StatusChip key="s" status="onTrack" />,
      <MetricTile key="m" label="X" value={1} />,
      <KpiTile key="k" label="X" value={1} />,
      <StackedBar key="b" segments={[{ label: "A", value: 1 }]} />,
      <Legend key="l" items={[{ label: "A" }]} />,
      <Callout key="c">x</Callout>,
      <EmptyState key="e" title="x" />,
      <SectionHeader key="h" title="x" />,
      <Skeleton key="sk" />,
    ]) {
      expect(html(node)).toContain("var(--decho-");
    }
  });
});
