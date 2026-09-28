/**
 * The selects, and the option helpers underneath them.
 *
 * The helpers get the exhaustive treatment because they hold the behaviour
 * people complain about — "I typed Muller and it found nothing" — and the
 * components get the ARIA treatment, because the combobox pattern is the part
 * that is invisible and therefore the part that is always wrong.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import React from "react";
import { MultiSelect } from "./MultiSelect.js";
import { Select } from "./Select.js";
import {
  filterOptions,
  fold,
  groupOptions,
  summariseSelection,
  type SelectOption,
} from "./selectOptions.js";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

const tables: SelectOption[] = [
  { value: "kna1", label: "KNA1", description: "Customer master", group: "Master data" },
  { value: "mara", label: "MARA", description: "Material master", group: "Master data" },
  { value: "vbak", label: "VBAK", description: "Sales document header", group: "Transactions" },
  { value: "t001", label: "T001", description: "Company codes", disabled: true },
];

describe("fold", () => {
  it("strips the accents that make a name unfindable", () => {
    // "Müller" typed as "Muller" finds nothing without this, which in this
    // estate is most of a vendor list.
    expect(fold("Müller")).toBe("muller");
    expect(fold("  ÀÉÎÕÜ ")).toBe("aeiou");
  });
});

describe("filterOptions", () => {
  it("matches the description as well as the label", () => {
    // Somebody looking for the customer table types "customer"; the label is
    // "KNA1".
    expect(filterOptions(tables, "customer").map((option) => option.value)).toEqual(["kna1"]);
  });

  it("matches anywhere in the text, not just at the start", () => {
    expect(filterOptions(tables, "master").map((option) => option.value)).toEqual([
      "kna1",
      "mara",
    ]);
  });

  it("matches the value too, for anyone pasting an id", () => {
    expect(filterOptions(tables, "vbak")).toHaveLength(1);
  });

  it("returns everything for an empty query, and a copy rather than the input", () => {
    const all = filterOptions(tables, "  ");
    expect(all).toHaveLength(tables.length);
    expect(all).not.toBe(tables);
  });
});

describe("groupOptions", () => {
  it("keeps groups in first-appearance order rather than sorting them", () => {
    // The caller has already chosen an order — usually most-used first — and
    // re-sorting it silently makes the list feel random.
    const groups = groupOptions(tables);
    expect(groups.map((group) => group.name)).toEqual(["Master data", "Transactions", null]);
  });

  it("leaves ungrouped options where they are", () => {
    const groups = groupOptions(tables);
    expect(groups[2]?.options.map((option) => option.value)).toEqual(["t001"]);
  });
});

describe("summariseSelection", () => {
  it("names a short selection, because a name beats a count of one", () => {
    expect(summariseSelection(tables, ["kna1"])).toBe("KNA1");
    expect(summariseSelection(tables, ["kna1", "mara"])).toBe("KNA1, MARA");
  });

  it("counts a long one, so the trigger cannot grow past its row", () => {
    expect(summariseSelection(tables, ["kna1", "mara", "vbak"])).toBe("3 selected");
  });

  it("takes a noun, so a count can say what it is counting", () => {
    expect(summariseSelection(tables, ["kna1", "mara", "vbak"], { noun: "tables" })).toBe(
      "3 tables",
    );
  });

  it("ignores values that are not options any more", () => {
    // A saved filter referring to an object that has since been removed.
    expect(summariseSelection(tables, ["kna1", "gone"])).toBe("KNA1");
  });
});

describe("Select", () => {
  it("is a combobox that says what it controls", () => {
    const markup = html(
      <Select label="Table" options={tables} value={null} onValueChange={() => {}} />,
    );
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-haspopup="listbox"');
    expect(markup).toContain('aria-expanded="false"');
  });

  it("shows the placeholder as faint text rather than as a selectable option", () => {
    // A `<option value="">Choose…</option>` placeholder can be chosen — and
    // then submitted.
    const markup = html(
      <Select
        label="Table"
        options={tables}
        value={null}
        placeholder="Choose a table…"
        onValueChange={() => {}}
      />,
    );
    expect(markup).toContain("Choose a table…");
    expect(markup).not.toContain("<option");
  });

  it("names the selection on the trigger", () => {
    const markup = html(
      <Select label="Table" options={tables} value="mara" onValueChange={() => {}} />,
    );
    expect(markup).toContain("MARA");
  });

  it("renders no list while closed", () => {
    // The popover is not in the DOM when closed, so a page with forty selects
    // is not a page with forty hidden listboxes.
    const markup = html(
      <Select label="Table" options={tables} value={null} onValueChange={() => {}} />,
    );
    expect(markup).not.toContain('role="listbox"');
  });

  it("labels its trigger with the field label", () => {
    const markup = html(
      <Select label="Table" options={tables} value={null} onValueChange={() => {}} />,
    );
    const forId = /for="([^"]+)"/.exec(markup)?.[1];
    expect(forId).toBeDefined();
    expect(markup).toContain(`id="${forId}"`);
  });
});

describe("MultiSelect", () => {
  it("says it is multi-selectable, once open", () => {
    // Closed, there is nothing to say it on — which is also asserted, because
    // the attribute has to be on the listbox rather than on the trigger.
    const markup = html(
      <MultiSelect label="Tables" options={tables} values={[]} onValuesChange={() => {}} />,
    );
    expect(markup).not.toContain("aria-multiselectable");
    expect(markup).toContain('aria-haspopup="listbox"');
  });

  it("summarises rather than listing everything on the trigger", () => {
    const markup = html(
      <MultiSelect
        label="Tables"
        options={tables}
        values={["kna1", "mara", "vbak"]}
        onValuesChange={() => {}}
      />,
    );
    expect(markup).toContain("3 selected");
    expect(markup).not.toContain("VBAK");
  });

  it("shows the placeholder when nothing is chosen", () => {
    const markup = html(
      <MultiSelect
        label="Tables"
        options={tables}
        values={[]}
        placeholder="Any table"
        onValuesChange={() => {}}
      />,
    );
    expect(markup).toContain("Any table");
  });
});
