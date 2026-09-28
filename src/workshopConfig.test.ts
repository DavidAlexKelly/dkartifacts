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
  it("declares exactly one field, bound to the name modules will use", () => {
    expect(ARTIFACT_SHELL_CONFIG).toHaveLength(1);
    expect(ARTIFACT_SHELL_CONFIG[0].fieldId).toBe("artifactSwitching");
    expect(ARTIFACT_SHELL_CONFIG[0].field.label).toBe("artifact-switching");
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
    expect(ARTIFACT_SHELL_CONFIG[0].field.helperText.length).toBeGreaterThan(40);
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
