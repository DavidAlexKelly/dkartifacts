/**
 * The Workshop config, and the rule it drives.
 *
 * Two things worth freezing. The config is a contract with Workshop — the
 * fieldId is what a module binds a variable to, so renaming it silently
 * unbinds every module that already did. And the rule has one case that is not
 * obvious: what to show before Workshop has answered, which is the only moment
 * the app has to guess.
 */

import { describe, expect, it } from "vitest";
import {
  ARTIFACT_SHELL_CONFIG,
  resolveArtifactSwitching,
  resolveEventCategories,
  resolveEventSources,
  resolveSelectedEvent,
  type ArtifactShellContext,
} from "@/workshopConfig";

/** A context in the shape the hook gets back, with the value we want to test. */
function loadedWith(value: boolean | undefined): ArtifactShellContext {
  return {
    status: "LOADED",
    value: {
      artifactSwitching: {
        fieldValue: { status: "LOADED", value },
      },
    },
  } as ArtifactShellContext;
}

describe("the Workshop config", () => {
  it("declares its fields under the names modules will bind to", () => {
    // Renaming any of these unbinds every module that already bound it.
    expect(ARTIFACT_SHELL_CONFIG.map((f) => [f.fieldId, f.field.label])).toEqual([
      ["artifactSwitching", "artifact-switching"],
      ["eventDatasetRids", "event-monitor-dataset-rids"],
      ["eventMediaSetInputs", "event-monitor-media-set-inputs"],
      ["eventStreamRids", "event-monitor-stream-rids"],
      ["eventCategories", "event-monitor-categories"],
      ["selectedEvent", "selected-event"],
    ]);
  });

  it("takes the event monitor's sources and categories as string lists, empty by default", () => {
    for (const field of ARTIFACT_SHELL_CONFIG.slice(1, 5)) {
      expect(field.field.fieldValue.type, field.fieldId).toBe("inputOutput");
      expect(field.field.fieldValue.variableType.type, field.fieldId).toBe("string-list");
      const variableType = field.field.fieldValue.variableType as { defaultValue?: unknown };
      expect(variableType.defaultValue, field.fieldId).toEqual([]);
    }
  });

  it("is a bidirectional boolean defaulting to true", () => {
    const { fieldValue } = ARTIFACT_SHELL_CONFIG[0].field;
    // inputOutput, not input: Workshop drives it and the app can write it back,
    // matching how Mapplications declares its own flags.
    expect(fieldValue.type).toBe("inputOutput");
    expect(fieldValue.variableType.type).toBe("boolean");
    // Also what the hosted site and the dev server get, since the context
    // loads with these defaults when nothing is embedding the app.
    expect(fieldValue.variableType.defaultValue).toBe(true);
  });

  it("explains itself to whoever finds it in Workshop", () => {
    for (const field of ARTIFACT_SHELL_CONFIG) {
      expect(field.field.helperText.length, field.fieldId).toBeGreaterThan(40);
    }
  });
});

describe("resolveArtifactSwitching", () => {
  it("shows the switcher by default", () => {
    // The standalone case too: outside an iframe the context arrives LOADED
    // carrying the declared default, through this same branch.
    expect(resolveArtifactSwitching(loadedWith(true))).toBe(true);
  });

  it("hides it when a module turns it off", () => {
    expect(resolveArtifactSwitching(loadedWith(false))).toBe(false);
  });

  it("treats an unset value as the default", () => {
    expect(resolveArtifactSwitching(loadedWith(undefined))).toBe(true);
  });

  it("hides it while Workshop is still negotiating, rather than flashing it", () => {
    // Only reachable when embedded. A module that switched the dropdown off
    // should never see it, not even for a frame.
    expect(resolveArtifactSwitching({ status: "LOADING" })).toBe(false);
    expect(resolveArtifactSwitching({ status: "NOT_STARTED" })).toBe(false);
    expect(resolveArtifactSwitching({ status: "FAILED", error: "rejected" })).toBe(
      false,
    );
  });

  it("keeps showing the last value while reloading", () => {
    expect(
      resolveArtifactSwitching({
        status: "RELOADING",
        value: { artifactSwitching: { fieldValue: { status: "LOADED", value: true } } },
      } as ArtifactShellContext),
    ).toBe(true);
  });
});

const DATASET = "ri.foundry.main.dataset.0f0e6b1a-3c7a-4a52-9d49-0a1b2c3d4e5f";
const MEDIA_SET = "ri.mio.main.media-set.0f0e6b1a-3c7a-4a52-9d49-0a1b2c3d4e5f";

/** A loaded context carrying these string lists. */
function withSources(lists: {
  datasets?: string[];
  media?: string[];
  streams?: string[];
  categories?: string[];
  selected?: string;
}): ArtifactShellContext {
  const field = (value: string[] | undefined) => ({ fieldValue: { status: "LOADED", value } });
  return {
    status: "LOADED",
    value: {
      artifactSwitching: field(undefined),
      eventDatasetRids: field(lists.datasets),
      eventMediaSetInputs: field(lists.media),
      eventStreamRids: field(lists.streams),
      eventCategories: field(lists.categories),
      selectedEvent: { fieldValue: { status: "LOADED", value: lists.selected } },
    },
  } as unknown as ArtifactShellContext;
}

describe("resolveEventSources", () => {
  it("reads each variable as its own kind of source", () => {
    const { status, sources, invalid } = resolveEventSources(
      withSources({
        datasets: [DATASET],
        media: [`${MEDIA_SET}::zones/incidents.geojson`],
        streams: [DATASET],
      }),
    );
    expect(status).toBe("ready");
    expect(invalid).toEqual([]);
    expect(sources).toEqual([
      { kind: "dataset", rid: DATASET, category: undefined },
      { kind: "mediaset", rid: MEDIA_SET, item: "zones/incidents.geojson", category: undefined },
      { kind: "stream", rid: DATASET, category: undefined },
    ]);
  });

  it("reports entries that are not valid for their variable, and skips blanks", () => {
    const { sources, invalid } = resolveEventSources(
      withSources({ datasets: [DATASET, "", "  ", "not-a-rid"], media: [MEDIA_SET] }),
    );
    expect(sources).toHaveLength(1);
    expect(invalid.map((i) => [i.variable, i.entry])).toEqual([
      ["event-monitor-dataset-rids", "not-a-rid"],
      ["event-monitor-media-set-inputs", MEDIA_SET],
    ]);
    expect(invalid[1].error).toContain("::");
  });

  it("treats unset variables as empty", () => {
    expect(resolveEventSources(withSources({}))).toEqual({ status: "ready", sources: [], invalid: [] });
  });

  it("is pending while Workshop negotiates, and gives up waiting on a rejection", () => {
    expect(resolveEventSources({ status: "LOADING" }).status).toBe("pending");
    expect(resolveEventSources({ status: "NOT_STARTED" }).status).toBe("pending");
    expect(resolveEventSources({ status: "FAILED", error: "rejected" }).status).toBe("ready");
  });
});

describe("resolveEventCategories", () => {
  it("reads each entry as a custom category, reporting bad and repeated ones", () => {
    const { categories, invalid } = resolveEventCategories(
      withSources({ categories: ["Frontline|#ff0000|battle*", "", "Aid", "frontline", "Bad|blue"] }),
    );
    expect(categories.map((c) => [c.id, c.colour])).toEqual([
      ["custom:frontline", "#ff0000"],
      ["custom:aid", categories[1].colour],
    ]);
    expect(invalid.map((i) => i.entry)).toEqual(["frontline", "Bad|blue"]);
  });

  it("is empty until Workshop answers, and when unset", () => {
    expect(resolveEventCategories({ status: "LOADING" })).toEqual({ categories: [], invalid: [] });
    expect(resolveEventCategories(withSources({}))).toEqual({ categories: [], invalid: [] });
  });
});

describe("the selected-event variable", () => {
  it("is a bidirectional string", () => {
    const field = ARTIFACT_SHELL_CONFIG.find((f) => f.fieldId === "selectedEvent")!;
    expect(field.field.fieldValue.type).toBe("inputOutput");
    expect(field.field.fieldValue.variableType.type).toBe("string");
  });

  it("reads the key, treating empty as nothing selected", () => {
    expect(resolveSelectedEvent(withSources({ selected: "FAKE1005" }))).toEqual({ status: "ready", value: "FAKE1005" });
    expect(resolveSelectedEvent(withSources({ selected: "" }))).toEqual({ status: "ready", value: undefined });
    expect(resolveSelectedEvent(withSources({}))).toEqual({ status: "ready", value: undefined });
  });

  it("is pending until Workshop answers", () => {
    expect(resolveSelectedEvent({ status: "LOADING" })).toEqual({ status: "pending", value: undefined });
  });
});
