// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { fixtureFiles } from "../testing/fixture.js";
import type { CountriesStore } from "../core/load.js";
import { useCountries, type UseCountriesResult } from "./useCountries.js";

// React 18 asks for this flag before act() is used outside a test renderer.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Render the hook and record every result it returns. */
async function renderHook(initial: CountriesStore) {
  const results: UseCountriesResult[] = [];
  function Probe({ store }: { store: CountriesStore }) {
    results.push(useCountries(store));
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe store={initial} />));
  return {
    results,
    rerender: (store: CountriesStore) => act(async () => root.render(<Probe store={store} />)),
    unmount: () => act(() => root.unmount()),
  };
}

describe("useCountries", () => {
  it("is loading, then has the data", async () => {
    const files = fixtureFiles();
    const { results, unmount } = await renderHook({ kind: "files", files });
    expect(results[0]).toEqual({ data: null, error: null, loading: true });
    const last = results.at(-1)!;
    expect(last.loading).toBe(false);
    expect(last.data?.records.map((r) => r.id)).toEqual(["A", "B", "C", "D"]);
    await unmount();
  });

  it("does not reload when re-rendered with an equal store", async () => {
    const files = fixtureFiles();
    const { results, rerender, unmount } = await renderHook({ kind: "files", files });
    const loaded = results.at(-1)!.data;
    const loadingRenders = results.filter((r) => r.loading).length;
    await rerender({ kind: "files", files });
    expect(results.at(-1)!.data).toBe(loaded);
    expect(results.filter((r) => r.loading).length).toBe(loadingRenders);
    await unmount();
  });

  it("reports a dataset it cannot read", async () => {
    const { results, unmount } = await renderHook({ kind: "files", files: {} });
    const last = results.at(-1)!;
    expect(last.loading).toBe(false);
    expect(last.data).toBeNull();
    expect(String(last.error)).toMatch(/no file "manifest.json"/);
    await unmount();
  });

  it("keeps the newer result when the store changes before the first load finishes", async () => {
    const first = fixtureFiles();
    const second = fixtureFiles();
    (second["countries.json"] as { countries: Array<{ name: string }> }).countries[0].name = "Second";
    const results: UseCountriesResult[] = [];
    function Probe({ store }: { store: CountriesStore }) {
      results.push(useCountries(store));
      return null;
    }
    const root = createRoot(document.createElement("div"));
    // Both renders before either load settles: the first must not land last.
    await act(async () => {
      root.render(<Probe store={{ kind: "files", files: first }} />);
      root.render(<Probe store={{ kind: "files", files: second }} />);
    });
    expect(results.at(-1)!.data?.records.some((r) => r.name === "Second")).toBe(true);
    await act(() => root.unmount());
  });
});
