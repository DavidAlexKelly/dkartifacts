/**
 * Load a countries dataset in a component.
 *
 *   const { data, error } = useCountries({ kind: "dataset", datasetRid });
 *
 * For lists, search and lookups beside a map — the map add-on loads its own
 * data, and reaches it through its controller's `data`.
 */

import { useEffect, useState } from "react";

import { loadCountries, type CountriesData, type CountriesStore } from "../core/load.js";

export interface UseCountriesResult {
  data: CountriesData | null;
  error: unknown;
  loading: boolean;
}

export function useCountries(store: CountriesStore = { kind: "builtin" }): UseCountriesResult {
  // Keyed on content, so an inline object literal does not reload every render.
  const key = store.kind === "dataset" ? `dataset:${store.datasetRid}:${store.manifestPath ?? ""}` : store.kind;
  const [result, setResult] = useState<UseCountriesResult>({ data: null, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    setResult({ data: null, error: null, loading: true });
    loadCountries(store).then(
      (data) => {
        if (!cancelled) {setResult({ data, error: null, loading: false });}
      },
      (error: unknown) => {
        if (!cancelled) {setResult({ data: null, error, loading: false });}
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return result;
}
