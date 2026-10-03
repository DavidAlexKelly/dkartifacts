import { describe, expect, it, vi } from "vitest";
import type { ExtensionContext, ExtensionMap } from "@acc/decho-basemap";

import { fixtureFiles } from "../testing/fixture.js";
import { countries, type CountriesController, type CountrySelection } from "./index.js";
import { annotate, DEFAULT_APPEARANCE, layerIds } from "./layers.js";
import { loadCountries } from "../core/load.js";

const ctx = { basemapSourceId: "protomaps", basemapMaxZoom: 14, maplibregl: {} } as unknown as ExtensionContext;
const store = () => ({ kind: "files" as const, files: fixtureFiles() });
const ids = layerIds("countries");

/** Enough of a MapLibre map to drive the extension and see what it did. */
function stubMap(contributed: Record<string, unknown>, layers: Array<{ id: string; source?: string }>) {
  const handlers: Record<string, Array<(e: unknown) => void>> = {};
  const data: Record<string, unknown> = { ...contributed };
  const filters: Record<string, unknown> = {};
  const camera: unknown[] = [];
  let zoom = 1;
  let covering = false;
  const map = {
    getZoom: () => zoom,
    on: (type: string, fn: (e: unknown) => void) => void (handlers[type] ??= []).push(fn),
    off: (type: string, fn: (e: unknown) => void) => void (handlers[type] = (handlers[type] ?? []).filter((h) => h !== fn)),
    getSource: (id: string) => ({ setData: (value: unknown) => void (data[id] = value) }),
    setFilter: (id: string, filter: unknown) => void (filters[id] = filter),
    getStyle: () => ({ layers }),
    queryRenderedFeatures: (_point: unknown, options?: { layers?: string[] }) =>
      covering && options?.layers?.includes("events-point") ? [{ layer: { id: "events-point" } }] : [],
    fitBounds: (...args: unknown[]) => void camera.push(["fitBounds", ...args]),
    flyTo: (...args: unknown[]) => void camera.push(["flyTo", ...args]),
  };
  return {
    map: map as unknown as ExtensionMap,
    data,
    filters,
    camera,
    handlers,
    setZoom: (value: number) => {
      zoom = value;
      for (const fn of handlers.zoomend ?? []) {fn({});}
    },
    cover: (value: boolean) => void (covering = value),
    fire: (type: string, lng: number, lat: number) => {
      for (const fn of handlers[type] ?? []) {fn({ lngLat: { lng, lat }, point: { x: 0, y: 0 } });}
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(options: Parameters<typeof countries>[0] = {}) {
  const selections: Array<CountrySelection | null> = [];
  let controller: CountriesController | undefined;
  const extension = countries({
    store: store(),
    ...options,
    onSelect: (s) => selections.push(s),
    onReady: (c) => void (controller = c),
  });
  const contribution = await extension.style!(ctx);
  const sources = contribution.sources ?? {};
  const layers = [
    { id: "land", source: "protomaps" },
    ...(contribution.layers ?? []).map((layer: { id: string; source: string }) => ({ id: layer.id, source: layer.source })),
    { id: "events-point", source: "events" },
    { id: "place-labels", source: "protomaps" },
  ];
  const stub = stubMap(Object.fromEntries(Object.entries(sources).map(([id, s]) => [id, (s as { data: unknown }).data])), layers);
  const dispose = (await extension.attach!(stub.map, ctx)) as () => void;
  await settle();
  return { extension, contribution, stub, selections, controller: controller!, dispose };
}

describe("the countries extension", () => {
  it("contributes one source and its layers, under the labels", async () => {
    const { contribution } = await mount();
    expect(Object.keys(contribution.sources!)).toEqual([ids.source]);
    expect(contribution.layers!.map((l: { id: string }) => l.id)).toEqual([ids.fill, ids.hover, ids.border, ids.selected]);
    expect(contribution.before).toBe("labels");
  });

  it("selects the country clicked, and clears on the sea", async () => {
    const { stub, selections } = await mount();
    stub.fire("click", 5, 5);
    expect(selections.at(-1)).toMatchObject({ kind: "country", country: { id: "A" }, region: { id: "North" } });
    expect(stub.filters[ids.selected]).toEqual(["==", ["get", "id"], "A"]);
    stub.fire("click", 50, 5);
    expect(selections.at(-1)).toBeNull();
  });

  it("leaves a click alone when something drawn above the countries is under it", async () => {
    const { stub, selections } = await mount();
    stub.cover(true);
    stub.fire("click", 5, 5);
    expect(selections).toEqual([]);
  });

  it("picks whole regions in regions mode, and in auto mode when zoomed out", async () => {
    const regions = await mount({ mode: "regions" });
    regions.stub.fire("mousemove", 22, 5);
    expect(regions.stub.filters[ids.hover]).toEqual(["==", ["get", "region"], "North"]);
    regions.stub.fire("click", 22, 5);
    expect(regions.selections.at(-1)).toMatchObject({ kind: "region", region: { id: "North", countries: ["A", "B", "D"] } });

    const auto = await mount({ mode: "auto", regionsBelowZoom: 3 });
    auto.stub.fire("click", 5, 5);
    expect(auto.selections.at(-1)?.kind).toBe("region");
    auto.stub.setZoom(4);
    auto.stub.fire("click", 5, 5);
    expect(auto.selections.at(-1)?.kind).toBe("country");
  });

  it("switches view: new outlines, and a selection the view no longer draws is dropped", async () => {
    const { stub, controller, selections } = await mount();
    controller.select({ kind: "country", id: "D" });
    await controller.setView("claimed");
    const drawn = stub.data[ids.source] as { features: Array<{ properties: { id: string } }> };
    expect(drawn.features.map((f) => f.properties.id)).toEqual(["A", "B", "C"]);
    expect(selections.at(-1)).toBeNull();
    stub.fire("click", 22, 5);
    expect(selections.at(-1)).toMatchObject({ country: { id: "B" } });
    expect(controller.countryAt(22, 5)?.id).toBe("B");
  });

  it("loads the finer outlines once the map zooms past where they start", async () => {
    const { stub } = await mount();
    const before = stub.data[ids.source];
    stub.setZoom(5);
    await settle();
    expect(stub.data[ids.source]).not.toBe(before);
  });

  it("recolours by another region scheme without a rebuild", async () => {
    const { stub, controller } = await mount();
    controller.setRegionScheme("pairs");
    const drawn = stub.data[ids.source] as { features: Array<{ properties: { id: string; region: string } }> };
    expect(Object.fromEntries(drawn.features.map((f) => [f.properties.id, f.properties.region]))).toEqual({ A: "One", B: "", D: "", C: "One" });
  });

  it("frames a country or a region", async () => {
    const { stub, controller } = await mount();
    controller.fitTo({ kind: "country", id: "B" });
    controller.fitTo({ kind: "region", id: "North" });
    expect(stub.camera.map((call) => (call as unknown[])[1])).toEqual([[[10, 0], [20, 10]], [[0, 0], [25, 10]]]);
  });

  it("keeps view, scheme and selection across a map rebuild, without reading the data again", async () => {
    const files = fixtureFiles();
    const read = vi.fn();
    const counting = new Proxy(files, { get: (t, k: string) => (read(k), t[k]) });
    let controller: CountriesController | undefined;
    const extension = countries({ store: { kind: "files", files: counting }, onReady: (c) => void (controller = c) });
    await extension.style!(ctx);
    let stub = stubMap({}, []);
    await extension.attach!(stub.map, ctx);
    await settle();
    controller!.setRegionScheme("pairs");
    controller!.select({ kind: "country", id: "C" });
    await controller!.setView("claimed");
    const readsBefore = read.mock.calls.filter(([k]) => k === "manifest.json").length;

    const second = await extension.style!(ctx);
    stub = stubMap({}, []);
    await extension.attach!(stub.map, ctx);
    await settle();
    expect(read.mock.calls.filter(([k]) => k === "manifest.json").length).toBe(readsBefore);
    expect(controller!.view.id).toBe("claimed");
    expect(controller!.regionScheme?.id).toBe("pairs");
    expect(controller!.selection).toMatchObject({ country: { id: "C" } });
    const firstDrawn = (second.sources![ids.source] as { data: { features: Array<{ properties: { region: string } }> } }).data;
    expect(firstDrawn.features.some((f) => f.properties.region === "One")).toBe(true);
  });

  it("contributes nothing and reports when the data cannot be read, without failing the map", async () => {
    const onError = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const extension = countries({ store: { kind: "files", files: {} }, onError });
    expect(await extension.style!(ctx)).toEqual({});
    expect(onError).toHaveBeenCalledOnce();
    expect(extension.attach!(stubMap({}, []).map, ctx)).toBeUndefined();
    warn.mockRestore();
  });

  it("stops listening when detached", async () => {
    const { stub, dispose, selections } = await mount();
    dispose();
    stub.fire("click", 5, 5);
    expect(selections).toEqual([]);
    expect(Object.values(stub.handlers).every((list) => list.length === 0)).toBe(true);
  });
});

describe("fill colours", () => {
  it("colour by region, by a function of the record, or not at all", async () => {
    const data = await loadCountries(store());
    const outlines = await data.geometry();
    const colours = (fill: typeof DEFAULT_APPEARANCE.fill) =>
      Object.fromEntries(annotate(outlines, data, "half", { ...DEFAULT_APPEARANCE, fill, palette: ["red", "blue"] }).features.map((f) => [f.properties.id, (f.properties as { colour: string }).colour]));
    expect(colours("region")).toEqual({ A: "red", B: "red", D: "red", C: "blue" });
    expect(colours((record) => ((record.figures.population?.value ?? 0) > 150 ? "black" : null))).toEqual({
      A: "rgba(0,0,0,0)", B: "black", D: "rgba(0,0,0,0)", C: "rgba(0,0,0,0)",
    });
    expect(new Set(Object.values(colours("none")))).toEqual(new Set(["rgba(0,0,0,0)"]));
  });
});
