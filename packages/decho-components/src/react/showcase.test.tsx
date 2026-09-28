/**
 * The showcase, tested for the only thing a showcase can get badly wrong:
 * being out of date.
 *
 * A gallery that lists thirty of thirty-four components is worse than no
 * gallery, because the four it omits are the four somebody rebuilds by hand —
 * which is the exact failure this library was assembled to end. So the list of
 * components is not read from this file: it is read from the package's own
 * entry point, and compared.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import React from "react";
import { tokensFor } from "@acc/decho-styling";
import * as library from "../index.js";
import { ComponentShowcase } from "./ComponentShowcase.js";
import { SHOWCASE_GROUPS, SHOWCASE_SPECIMENS } from "./showcaseSpecimens.js";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

/**
 * Every exported React component, by name.
 *
 * A function whose name begins with a capital — which is React's own rule for
 * what a component is, and therefore the only definition that cannot drift
 * from a hand-kept list. The recipes (`cardStyle`) and the hooks
 * (`useDismiss`) are camelCase and so fall out on their own.
 */
const EXPORTED_COMPONENTS = Object.entries(library)
  .filter(([name, value]) => typeof value === "function" && name[0] === name[0].toUpperCase())
  .map(([name]) => name)
  // The showcase does not show itself. It would render, and it would recurse.
  .filter((name) => name !== "ComponentShowcase");

const COVERED = new Set(
  SHOWCASE_SPECIMENS.flatMap((specimen) => [specimen.name, ...(specimen.also ?? [])]),
);

describe("the specimen list", () => {
  it("covers every component the package exports", () => {
    const missing = EXPORTED_COMPONENTS.filter((name) => !COVERED.has(name));
    // Named, not counted: the failure should say which component was added
    // without a specimen, because that is the whole of the fix.
    expect(missing).toEqual([]);
  });

  it("shows nothing that is not exported", () => {
    // Every export, not just the components: an `also` list legitimately names
    // a hook (`useToast` is half of what the toast card demonstrates), and the
    // thing this guards against is a specimen pointing at something that no
    // longer exists — which is true of a renamed hook as much as a renamed
    // component.
    const exported = new Set(Object.keys(library));
    const unknown = [...COVERED].filter((name) => !exported.has(name));
    expect(unknown).toEqual([]);
  });

  it("gives every specimen a group that exists, and a description", () => {
    for (const specimen of SHOWCASE_SPECIMENS) {
      expect(SHOWCASE_GROUPS, specimen.name).toContain(specimen.group);
      expect(specimen.description.length, `${specimen.name} description`).toBeGreaterThan(10);
    }
  });

  it("names each component once per shelf", () => {
    // Once per shelf rather than once overall: `DataTable` earns a second
    // card under Grids for the virtualised variant, which is a different
    // capability shown with 800 rows rather than four. Twice on the SAME
    // shelf would be a copy-paste mistake, and that is what this catches.
    const keys = SHOWCASE_SPECIMENS.map((specimen) => `${specimen.group}/${specimen.name}`);
    expect(keys.length).toBe(new Set(keys).size);
  });
});

describe("ComponentShowcase", () => {
  it("renders every specimen, so a broken example fails here and not in a demo", () => {
    // The assertion that matters is that this does not throw: each specimen is
    // a real render of a real component with real props.
    const markup = html(<ComponentShowcase />);
    for (const specimen of SHOWCASE_SPECIMENS) {
      expect(markup, specimen.name).toContain(specimen.name);
    }
  });

  it("takes a theme as values, and everything below follows it", () => {
    const sap = tokensFor("accenture-sap");
    const markup = html(<ComponentShowcase tokens={sap} />);
    // Read from the token set rather than written out: a theme is allowed to
    // retune its accent, and a test that pins the hex would fail for that.
    expect(markup).toContain(`--decho-color-accent:${sap.color.accent}`);
    expect(markup).toContain(`--decho-color-accent-tint:${sap.color.accentTint}`);
  });

  it("filters by name", () => {
    const markup = html(<ComponentShowcase query="progress" controls={false} />);
    expect(markup).toContain("ProgressBar");
    expect(markup).not.toContain("DonutChart");
  });

  it("filters by what a component does, not only by what it is called", () => {
    // Someone looking for the empty-table message does not know it is called
    // EmptyState, which is the case a name-only search gets wrong.
    expect(html(<ComponentShowcase query="nothing to show" controls={false} />)).toContain(
      "EmptyState",
    );
  });

  it("says so when nothing matches, rather than rendering an empty page", () => {
    const markup = html(<ComponentShowcase query="kubernetes" controls={false} />);
    expect(markup).toContain("No component matches");
  });

  it("can be narrowed to one shelf", () => {
    const markup = html(<ComponentShowcase groups={["Charts"]} controls={false} />);
    expect(markup).toContain("Sparkline");
    expect(markup).not.toContain("DataTable");
  });
});
