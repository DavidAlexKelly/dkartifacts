/**
 * Accordion, SplitPane, Stepper, Timeline, Pagination, the date inputs, the
 * avatars and the small buttons.
 *
 * Named `tierOne` rather than `structure` because `structure.test.tsx` was
 * already taken by the Tabs/Toolbar/FacetGroup tests — and because these
 * arrived together as one batch, which is the honest grouping.
 *
 * The date helpers get the most attention, because a date-only value that
 * round-trips through a `Date` is one timezone away from being a day out — and
 * the readiness dashboard has actually shown a cutover a day early.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import React from "react";
import { Accordion } from "./Accordion.js";
import { Avatar, AvatarGroup } from "./Avatar.js";
import { initialsOf } from "./initials.js";
import { CopyButton, FilterSummary, RefreshButton } from "./ActionButtons.js";
import { DateInput, DateRangeInput } from "./DateInput.js";
import { Pagination } from "./Pagination.js";
import { SplitPane } from "./SplitPane.js";
import { Stepper } from "./Stepper.js";
import { Timeline } from "./Timeline.js";
import {
  addDays,
  clampDate,
  daysBetween,
  daysInMonth,
  formatDate,
  isIsoDate,
  normaliseRange,
  relativeTime,
  today,
} from "./dateValue.js";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("dateValue", () => {
  it("accepts a real date and rejects a shaped-but-impossible one", () => {
    expect(isIsoDate("2026-03-01")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("01/03/2026")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("knows about leap years", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
  });

  it("adds days across a month and a year boundary without drifting", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days inclusively, because a one-day cutover is one day", () => {
    expect(daysBetween("2026-03-01", "2026-03-01")).toBe(1);
    expect(daysBetween("2026-03-01", "2026-03-14")).toBe(14);
  });

  it("formats without shifting the day", () => {
    // The bug this module exists for: a UTC midnight formatted in a local
    // timezone prints the day before.
    expect(formatDate("2026-03-01", { day: "numeric", month: "short", year: "numeric" }, "en-GB")).toBe(
      "1 Mar 2026",
    );
    expect(formatDate("not-a-date")).toBe("");
  });

  it("takes today from the local calendar, not from UTC", () => {
    const fixed = new Date(2026, 0, 5, 23, 30);
    expect(today(fixed)).toBe("2026-01-05");
  });

  it("clamps into a range", () => {
    expect(clampDate("2026-01-01", "2026-02-01", "2026-03-01")).toBe("2026-02-01");
    expect(clampDate("2026-04-01", "2026-02-01", "2026-03-01")).toBe("2026-03-01");
    expect(clampDate("2026-02-15", "2026-02-01", "2026-03-01")).toBe("2026-02-15");
  });

  it("pushes the other end rather than swapping an out-of-order range", () => {
    expect(normaliseRange(["2026-03-10", "2026-03-01"], 0)).toEqual([
      "2026-03-10",
      "2026-03-10",
    ]);
    expect(normaliseRange(["2026-03-10", "2026-03-01"], 1)).toEqual([
      "2026-03-01",
      "2026-03-01",
    ]);
  });

  it("leaves a half-empty range alone", () => {
    expect(normaliseRange(["2026-03-10", null], 0)).toEqual(["2026-03-10", null]);
  });
});

describe("DateInput", () => {
  it("is a native date field with the field furniture around it", () => {
    const markup = html(
      <DateInput label="Cutover" value="2026-03-01" onValueChange={() => {}} />,
    );
    expect(markup).toContain('type="date"');
    expect(markup).toContain('value="2026-03-01"');
    expect(markup).toContain("Cutover");
  });

  it("treats an invalid value as empty rather than passing it on", () => {
    // The input would ignore it and show a blank field while the caller still
    // believed it held something.
    const markup = html(<DateInput label="Cutover" value="01/03/2026" onValueChange={() => {}} />);
    expect(markup).toContain('value=""');
  });

  it("asks the browser for a picker in the right colour scheme", () => {
    expect(html(<DateInput value={null} onValueChange={() => {}} />)).toContain("color-scheme");
  });
});

describe("DateRangeInput", () => {
  it("constrains each end with the other", () => {
    const markup = html(
      <DateRangeInput value={["2026-03-01", "2026-03-31"]} onValueChange={() => {}} />,
    );
    expect(markup).toContain('max="2026-03-31"');
    expect(markup).toContain('min="2026-03-01"');
  });

  it("names both fields even though only the pair has a label", () => {
    const markup = html(
      <DateRangeInput label="Window" value={[null, null]} onValueChange={() => {}} />,
    );
    expect(markup).toContain('aria-label="Window: from"');
    expect(markup).toContain('aria-label="Window: to"');
  });

  it("says how long the range is", () => {
    const markup = html(
      <DateRangeInput value={["2026-03-01", "2026-03-14"]} onValueChange={() => {}} />,
    );
    expect(markup).toContain("14 days");
  });
});

describe("Accordion", () => {
  const sections = [
    { key: "a", title: "General", content: <p>general</p> },
    { key: "b", title: "Advanced", content: <p>advanced</p> },
  ];

  it("is a disclosure: a button that says what it controls", () => {
    const markup = html(<Accordion sections={sections} defaultOpen={["a"]} />);
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('role="region"');
  });

  it("does not mount a closed section", () => {
    // A closed section that is merely hidden keeps its subscriptions and its
    // timers, so five heavy sections cost five sections' work to show one.
    const markup = html(<Accordion sections={sections} defaultOpen={["a"]} />);
    expect(markup).toContain("general");
    expect(markup).not.toContain("advanced");
  });

  it("points at a region only while the region exists", () => {
    const markup = html(<Accordion sections={sections} open={[]} />);
    expect(markup).not.toContain("aria-controls");
  });
});

describe("SplitPane", () => {
  it("is a keyboard-operable separator with its position announced", () => {
    const markup = html(
      <SplitPane split={40}>
        {[<div key="a">list</div>, <div key="b">detail</div>]}
      </SplitPane>,
    );
    expect(markup).toContain('role="separator"');
    expect(markup).toContain('aria-valuenow="40"');
    expect(markup).toContain('aria-orientation="vertical"');
    expect(markup).toContain('tabindex="0"');
  });
});

describe("Stepper", () => {
  const steps = [
    { key: "design", label: "Design" },
    { key: "load", label: "Load" },
    { key: "ready", label: "Readiness" },
  ];

  it("marks the current step as a step, not just as coloured", () => {
    const markup = html(<Stepper steps={steps} current={1} />);
    expect(markup).toContain('aria-current="step"');
  });

  it("says each state in words as well as in colour", () => {
    const markup = html(<Stepper steps={steps} current={1} />);
    expect(markup).toContain("(complete)");
    expect(markup).toContain("(current)");
    expect(markup).toContain("(upcoming)");
  });

  it("is only clickable when there is something to click", () => {
    expect(html(<Stepper steps={steps} current={1} />)).not.toContain("<button");
    expect(html(<Stepper steps={steps} current={1} onStepSelect={() => {}} />)).toContain(
      "<button",
    );
  });
});

describe("Timeline", () => {
  it("keeps the exact timestamp while showing a human one", () => {
    const markup = html(
      <Timeline
        events={[
          { key: "1", title: "Signed off", at: "2026-03-01T09:14:00Z", when: "2 hours ago" },
        ]}
      />,
    );
    // Case-insensitive: React 19 emits `dateTime` rather than lower-casing it
    // to `datetime`, as it did in 18. HTML attribute names are
    // case-insensitive, so this is a rendering detail of React and not
    // something the component should be pinned to.
    expect(markup).toMatch(/datetime="2026-03-01T09:14:00Z"/i);
    expect(markup).toContain("2 hours ago");
  });
});

describe("relativeTime", () => {
  it("picks a sensible unit", () => {
    const now = new Date("2026-03-01T12:00:00Z");
    expect(relativeTime("2026-03-01T10:00:00Z", now, "en-GB")).toBe("2 hours ago");
    expect(relativeTime("2026-02-27T12:00:00Z", now, "en-GB")).toBe("2 days ago");
    expect(relativeTime("2026-03-01T11:59:30Z", now, "en-GB")).toBe("30 seconds ago");
  });

  it("returns nothing for a value it cannot read", () => {
    expect(relativeTime("nonsense")).toBe("");
  });
});

describe("Pagination", () => {
  it("is a named landmark, so two pagers are distinguishable", () => {
    const markup = html(
      <Pagination page={1} pageSize={20} total={96} noun="objects" onPageChange={() => {}} />,
    );
    expect(markup).toContain('aria-label="objects pagination"');
  });

  it("announces where you are, not just that a button was pressed", () => {
    const markup = html(
      <Pagination page={1} pageSize={20} total={96} noun="objects" onPageChange={() => {}} />,
    );
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("21–40 of 96 objects");
  });

  it("marks the current page as current", () => {
    const markup = html(<Pagination page={1} pageSize={20} total={96} onPageChange={() => {}} />);
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="Page 2"');
  });

  it("disables the arrows at the ends", () => {
    const first = html(<Pagination page={0} pageSize={20} total={96} onPageChange={() => {}} />);
    expect(first).toContain('aria-label="First page" disabled=""');
    const last = html(<Pagination page={4} pageSize={20} total={96} onPageChange={() => {}} />);
    expect(last).toContain('aria-label="Last page" disabled=""');
  });
});

describe("initialsOf", () => {
  it("takes the first and last name, not the first two letters", () => {
    // "Dana Okafor" as "DA" is what the hand-rolled versions produce.
    expect(initialsOf("Dana Okafor")).toBe("DO");
  });

  it("skips particles", () => {
    expect(initialsOf("Maria del Carmen Rodríguez")).toBe("MR");
    expect(initialsOf("Ludwig van Beethoven")).toBe("LB");
  });

  it("handles one name, and empty input", () => {
    expect(initialsOf("Prince")).toBe("P");
    expect(initialsOf("   ")).toBe("");
  });

  it("does not split a character in half", () => {
    // `slice(0, 1)` on an astral-plane character gives half a surrogate pair,
    // which renders as a box.
    expect(initialsOf("李雷")).toBe("李");
    expect([...initialsOf("𠜎 Wong")]).toHaveLength(2);
  });
});

describe("Avatar", () => {
  it("names the person once, on the wrapper", () => {
    const markup = html(<Avatar name="Dana Okafor" />);
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Dana Okafor"');
    expect(markup).toContain("DO");
  });

  it("says who the hidden ones are", () => {
    // A "+3" nobody can resolve is a count of people nobody can identify.
    const markup = html(
      <AvatarGroup
        max={1}
        people={[{ name: "A One" }, { name: "B Two" }, { name: "C Three" }]}
      />,
    );
    expect(markup).toContain("+2");
    expect(markup).toContain("and 2 more: B Two, C Three");
  });
});

describe("the small buttons", () => {
  it("gives Copy a live region for its confirmation", () => {
    // A `title` change is announced by nothing.
    const markup = html(<CopyButton value="abc-123" what="request id" />);
    expect(markup).toContain('aria-label="Copy request id"');
    expect(markup).toContain('aria-live="polite"');
  });

  it("shows when the data is from, beside Refresh", () => {
    const markup = html(<RefreshButton onRefresh={() => {}} lastUpdated="09:14" />);
    expect(markup).toContain("09:14");
  });

  it("names each filter, and offers to remove it", () => {
    const markup = html(
      <FilterSummary
        filters={[
          { key: "ws", label: "Workstream", value: "Finance", onRemove: () => {} },
          { key: "st", label: "Status", value: "At risk", onRemove: () => {} },
        ]}
        onClearAll={() => {}}
      />,
    );
    expect(markup).toContain("Workstream:");
    expect(markup).toContain('aria-label="Remove Workstream filter"');
    expect(markup).toContain("Clear all");
  });

  it("offers no clear-all for a single filter", () => {
    const markup = html(
      <FilterSummary filters={[{ key: "ws", label: "Workstream", value: "Finance" }]} />,
    );
    expect(markup).not.toContain("Clear all");
  });
});
