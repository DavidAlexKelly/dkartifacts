import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { loadCountries } from "../core/load.js";
import { fixtureFiles } from "../testing/fixture.js";
import { CountryCard } from "./CountryCard.js";

describe("CountryCard", () => {
  it("shows a country's flag, capital-free facts, derived figures and the credit line", async () => {
    const data = await loadCountries({ kind: "files", files: fixtureFiles() });
    const html = renderToStaticMarkup(
      <CountryCard
        selection={{ kind: "country", country: data.country("A")!, region: data.regionOf("A") }}
        sources={data.manifest.sources}
      />,
    );
    expect(html).toContain("Aland");
    expect(html).toContain("🇦🇦");
    expect(html).toContain("Population");
    expect(html).toContain("(2020)");
    expect(html).toContain("Population density");
    expect(html).toContain("Sources: Test (CC0)");
  });

  it("shows a region's sums and member count", async () => {
    const data = await loadCountries({ kind: "files", files: fixtureFiles() });
    const html = renderToStaticMarkup(
      <CountryCard selection={{ kind: "region", region: data.regionOf("A")!, scheme: data.regionScheme()! }} />,
    );
    expect(html).toContain("North");
    expect(html).toContain("Halves · 3 countries");
    expect(html).toContain("300");
  });

  it("renders nothing without a selection", () => {
    expect(renderToStaticMarkup(<CountryCard selection={null} />)).toBe("");
  });
});
