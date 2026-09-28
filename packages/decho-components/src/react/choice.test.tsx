/**
 * Checkbox, RadioGroup, Toggle — tested on the things that make them
 * controls rather than pictures of controls.
 *
 * All three paint a box and hide a real input behind it, which is the standard
 * technique and also the one with a standard way of going wrong: the painted
 * box ends up focusable too, or the real input ends up `display: none` and
 * stops existing for the keyboard. Both are asserted against here.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import React from "react";
import { Checkbox } from "./Checkbox.js";
import { RadioGroup } from "./RadioGroup.js";
import { Toggle } from "./Toggle.js";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("Checkbox", () => {
  it("is a real checkbox with a real label", () => {
    const markup = html(<Checkbox label="Include archived" />);
    expect(markup).toContain('type="checkbox"');
    const forId = /for="([^"]+)"/.exec(markup)?.[1];
    expect(forId).toBeDefined();
    expect(markup).toContain(`id="${forId}"`);
  });

  it("announces the third state as mixed rather than as unchecked", () => {
    // "Some rows are selected" read as "none" in the estate's select-all
    // headers, so the next click selected everything instead of clearing.
    const markup = html(<Checkbox label="Select all" indeterminate />);
    expect(markup).toContain('aria-checked="mixed"');
  });

  it("hides the input without removing it from the keyboard", () => {
    // `display:none` or `visibility:hidden` would take it out of the
    // accessibility tree and out of the tab order — the box would be
    // decoration with nothing behind it.
    const markup = html(<Checkbox label="On" />);
    const input = /<input[^>]*>/.exec(markup)?.[0] ?? "";
    expect(input).toContain("clip:rect(0 0 0 0)");
    expect(input).not.toContain("display:none");
    expect(input).not.toContain("visibility:hidden");
  });

  it("keeps the painted box out of the accessibility tree", () => {
    // Otherwise there are two things here, and Tab visits both.
    expect(html(<Checkbox label="On" checked />)).toContain('aria-hidden="true"');
  });

  it("describes itself with its description", () => {
    const markup = html(
      <Checkbox label="Notify owners" description="Sends one email per object." />,
    );
    const describes = /aria-describedby="([^"]+)"/.exec(markup)?.[1];
    expect(describes).toBeDefined();
    expect(markup).toContain(`id="${describes}"`);
  });
});

describe("RadioGroup", () => {
  const options = [
    { value: "all", label: "All objects" },
    { value: "mine", label: "Mine", description: "Owned by me" },
    { value: "none", label: "None", disabled: true },
  ];

  it("is a fieldset with a legend, so the question is announced", () => {
    const markup = html(
      <RadioGroup label="Scope" options={options} value="all" onValueChange={() => {}} />,
    );
    expect(markup).toContain("<fieldset");
    expect(markup).toContain("<legend");
    expect(markup).toContain("Scope");
  });

  it("gives every button the same name, which is what makes it a group", () => {
    const markup = html(
      <RadioGroup name="scope" options={options} value="all" onValueChange={() => {}} />,
    );
    expect(markup.match(/name="scope"/g)).toHaveLength(3);
  });

  it("checks exactly the selected option", () => {
    const markup = html(
      <RadioGroup name="scope" options={options} value="mine" onValueChange={() => {}} />,
    );
    expect(markup.match(/checked=""/g)).toHaveLength(1);
  });

  it("disables one option without disabling the group", () => {
    const markup = html(
      <RadioGroup name="scope" options={options} value="all" onValueChange={() => {}} />,
    );
    expect(markup.match(/disabled=""/g)).toHaveLength(1);
  });

  it("does not clip its inputs", () => {
    // A clipped radio, when arrow keys move focus to it, can scroll the page
    // to the top-left corner. Radios are hidden by opacity for that reason.
    const markup = html(
      <RadioGroup name="scope" options={options} value="all" onValueChange={() => {}} />,
    );
    expect(markup).not.toContain("clip:rect(0 0 0 0)");
    expect(markup).toContain("opacity:0");
  });

  it("announces an error against the group", () => {
    const markup = html(
      <RadioGroup
        label="Scope"
        options={options}
        value={null}
        error="Choose a scope."
        onValueChange={() => {}}
      />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-invalid="true"');
  });
});

describe("Toggle", () => {
  it("is a switch, not a checkbox, so it says on and off", () => {
    const markup = html(<Toggle label="Terrain" checked onCheckedChange={() => {}} />);
    expect(markup).toContain('role="switch"');
  });

  it("says it is applying, and refuses a second click while it is", () => {
    const markup = html(<Toggle label="Terrain" checked busy onCheckedChange={() => {}} />);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("disabled");
  });

  it("describes itself in both layouts", () => {
    // The `spread` variant used to reference an id that existed only in the
    // other branch of the render — a description of nothing.
    for (const spread of [false, true]) {
      const markup = html(
        <Toggle
          label="Terrain"
          description="Loads DEM chunks."
          checked={false}
          spread={spread}
          onCheckedChange={() => {}}
        />,
      );
      const describes = /aria-describedby="([^"]+)"/.exec(markup)?.[1];
      expect(describes, `spread=${spread}`).toBeDefined();
      expect(markup, `spread=${spread}`).toContain(`id="${describes}"`);
    }
  });
});
