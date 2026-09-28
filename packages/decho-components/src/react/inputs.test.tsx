/**
 * The fields, tested at the level where they went wrong: the markup.
 *
 * `renderToStaticMarkup` rather than Testing Library, as the rest of the
 * package does — these are presentational components, so the attributes ARE
 * the behaviour, and the attributes are what every hand-rolled form in the
 * estate is missing.
 *
 * What is asserted is deliberately narrow: that a label is a label, that a
 * hint is referenced rather than merely displayed, and that an error is
 * announced. Not "the padding is 5px".
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import React from "react";
import { Field } from "./Field.js";
import { Icon, ICON_NAMES } from "./Icon.js";
import { NumberInput } from "./NumberInput.js";
import { TextArea } from "./TextArea.js";
import { TextInput } from "./TextInput.js";
import { describedBy } from "./fieldAria.js";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

/**
 * The value of an attribute, so tests can match a `for` up with an `id`.
 *
 * String scanning rather than `new RegExp(name + '="...')`: the code scanner
 * blocks a RegExp built from a non-literal (ReDoS), and arguing that this
 * particular one is safe is a worse use of everyone's time than not building
 * it. It is also simpler.
 */
const attr = (markup: string, name: string): string | undefined => {
  const needle = `${name}="`;
  const start = markup.indexOf(needle);
  if (start < 0) {
    return undefined;
  }
  const from = start + needle.length;
  const end = markup.indexOf('"', from);
  return end < 0 ? undefined : markup.slice(from, end);
};

describe("describedBy", () => {
  it("is undefined rather than empty when there is nothing to describe", () => {
    // `aria-describedby=""` is a broken reference, not an absent one, and
    // some screen readers then announce nothing for the control at all.
    expect(describedBy([])).toBeUndefined();
    expect(describedBy([undefined, false, null, ""])).toBeUndefined();
  });

  it("joins the ids that are there", () => {
    expect(describedBy(["a", false, "b"])).toBe("a b");
  });
});

describe("TextInput", () => {
  it("labels the input with a real label element", () => {
    const markup = html(<TextInput label="Object name" />);
    const forId = attr(markup, "for");
    expect(forId).toBeDefined();
    expect(markup).toContain(`id="${forId}"`);
  });

  it("references the hint rather than only showing it", () => {
    const markup = html(<TextInput label="Name" hint="As it appears in SAP" />);
    const describes = attr(markup, "aria-describedby");
    expect(describes).toBeDefined();
    expect(markup).toContain(`id="${describes}"`);
    expect(markup).toContain("As it appears in SAP");
  });

  it("announces an error and marks the control invalid", () => {
    const markup = html(<TextInput label="Name" error="A name is required." />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-invalid="true"');
  });

  it("keeps the hint in the description while the error is on screen", () => {
    // The format is still what the user needs in order to fix the error.
    const markup = html(<TextInput label="Code" hint="Four letters" error="Too short" />);
    const describes = attr(markup, "aria-describedby") ?? "";
    expect(describes.split(" ")).toHaveLength(2);
    expect(markup).toContain("Four letters");
  });

  it("says required in words as well as with an asterisk", () => {
    const markup = html(<TextInput label="Owner" required />);
    expect(markup).toContain("(required)");
    expect(markup).toContain('aria-required="true"');
  });

  it("does not claim to be valid when it has nothing to say", () => {
    // `aria-invalid="false"` on every field is noise on every focus.
    expect(html(<TextInput label="Name" />)).not.toContain("aria-invalid");
  });

  it("refuses to be a number or date field at the type level", () => {
    // @ts-expect-error — NumberInput and DateInput exist for these.
    const bad = <TextInput label="Qty" type="number" />;
    expect(bad).toBeTruthy();
  });
});

describe("TextArea", () => {
  it("describes the counter as well as the hint", () => {
    const markup = html(
      <TextArea label="Notes" hint="Markdown is fine" counter maxLength={200} value="abc" />,
    );
    const describes = attr(markup, "aria-describedby") ?? "";
    expect(describes.split(" ")).toHaveLength(2);
  });

  it("gives the counter a form a screen reader can read", () => {
    const markup = html(<TextArea label="Notes" counter maxLength={200} value="abc" />);
    expect(markup).toContain("3 / 200");
    expect(markup).toContain("3 of 200 characters used");
  });
});

describe("NumberInput", () => {
  it("is a spinbutton with its range announced", () => {
    const markup = html(
      <NumberInput label="Weight" value={5} min={0} max={10} onValueChange={() => {}} />,
    );
    expect(markup).toContain('role="spinbutton"');
    expect(markup).toContain('aria-valuenow="5"');
    expect(markup).toContain('aria-valuemin="0"');
    expect(markup).toContain('aria-valuemax="10"');
  });

  it("renders an empty field for null rather than a zero", () => {
    const markup = html(<NumberInput label="Minimum" value={null} onValueChange={() => {}} />);
    expect(markup).toContain('value=""');
    expect(markup).not.toContain('value="0"');
  });

  // Matched case-insensitively: React 19 emits `inputMode="numeric"` rather
  // than lower-casing it as React 18 did. HTML attribute names are
  // case-insensitive so the browser does not care, but a test that pins the
  // casing fails on a React upgrade and looks like a component regression.
  it("is not a native number input, whatever it looks like", () => {
    const markup = html(<NumberInput label="Qty" value={1} onValueChange={() => {}} />);
    expect(markup).toContain('type="text"');
    expect(markup).toMatch(/inputmode="numeric"/i);
  });

  it("asks for a decimal keypad when the step has decimals", () => {
    const markup = html(
      <NumberInput label="Weight" value={1} step={0.1} onValueChange={() => {}} />,
    );
    expect(markup).toMatch(/inputmode="decimal"/i);
  });

  it("marks a value outside its bounds invalid without being told", () => {
    const markup = html(
      <NumberInput label="Share" value={140} max={100} onValueChange={() => {}} />,
    );
    expect(markup).toContain('aria-invalid="true"');
  });

  it("labels its steppers with verbs", () => {
    const markup = html(
      <NumberInput label="Qty" value={1} steppers onValueChange={() => {}} />,
    );
    expect(markup).toContain('aria-label="Increase"');
    expect(markup).toContain('aria-label="Decrease"');
  });
});

describe("Field", () => {
  it("hands the wiring to the control at the call site", () => {
    const markup = html(
      <Field label="Centre" hint="Decimal degrees">
        {(aria) => <input {...aria} />}
      </Field>,
    );
    const forId = attr(markup, "for");
    expect(markup).toContain(`id="${forId}"`);
    expect(markup).toContain("aria-describedby");
  });
});

describe("Icon", () => {
  it("is decoration unless it is given a name", () => {
    expect(html(<Icon name="check" />)).toContain('aria-hidden="true"');
    const labelled = html(<Icon name="check" label="Complete" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain("<title>Complete</title>");
  });

  it("draws every glyph it advertises", () => {
    // The set is small and closed; this is what stops a name existing in the
    // type and nowhere in the file.
    for (const name of ICON_NAMES) {
      const markup = html(<Icon name={name} />);
      expect(markup, name).toContain("<path");
      expect(markup, name).not.toContain('d=""');
    }
  });
});
