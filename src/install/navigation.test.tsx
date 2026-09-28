/**
 * The route from the demo to the instructions.
 *
 * The design system's page is what convinces somebody to use the package; the
 * install guide is what they need thirty seconds later. That hop is a link
 * with a query string in it, which is exactly the sort of thing that survives
 * a refactor as a link to the wrong page — /install with no package lands on
 * whichever guide happens to be first, and reads as "this button is broken".
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import InstallPage from "@/install/InstallPage";
import StylingPage from "@/PackageApps/dechoStyling/StylingPage";

const DEEP_LINK = "/install?package=@acc/decho-styling";

describe("getting from the design system to its instructions", () => {
  it("offers the link on the demo page", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <StylingPage />
      </MemoryRouter>,
    );
    expect(markup).toContain("Install &amp; use ›");
    expect(markup).toContain("How to install ›");
  });

  it("lands on the design system's own guide, not the first one", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={[DEEP_LINK]}>
        <InstallPage />
      </MemoryRouter>,
    );
    // The install command is the unambiguous proof of which guide rendered.
    expect(markup).toContain("npm install @acc/decho-styling");
    expect(markup).not.toContain("npm install @acc/decho-basemap");
    // And that it is the expanded usage section, not the three-line stub.
    expect(markup).toContain("Choose a theme once, at your root");
  });

  it("falls back to a real guide if the package is unknown", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/install?package=@acc/nope"]}>
        <InstallPage />
      </MemoryRouter>,
    );
    // A bad link should still render a page, not throw.
    expect(markup).toContain("npm install @acc/");
  });
});
