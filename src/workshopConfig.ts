/**
 * The Workshop iframe config for this app.
 *
 * This harness is hosted as a website, which means Workshop can embed it as an
 * iframe widget pointed at any of its routes. When it does, the module author
 * gets the variables declared here — the same mechanism Mapplications uses,
 * and the same shape (`inputOutput`, so Workshop can drive the value and the
 * app can write it back) as its `mockDemo`.
 *
 *  artifactSwitching — bidirectional boolean, surfaced in Workshop as
 *                      "artifact-switching".
 *
 *    true (default) — the header offers the example switcher, and the embedded
 *                     app is a browsable catalogue of everything in packages/.
 *    false          — no switcher. The widget is pinned to the route it was
 *                     embedded on, which is what a module wants when it is
 *                     showing one app as part of a workflow rather than
 *                     offering the whole set.
 *
 * ── Why there is no special case for "not embedded" ─────────────────────────
 *
 * Outside an iframe, `useWorkshopContext` does not stay pending: it returns
 * LOADED immediately, populated with the defaults declared below. So the
 * hosted site and the dev server both see `artifactSwitching === true` through
 * exactly the same path as an unconfigured Workshop widget, and the switcher —
 * which is the only navigation the harness has — is there by default
 * everywhere.
 *
 * Worth knowing if the default is ever flipped back to false: that would also
 * strip the standalone demo of its navigation, and telling "not embedded"
 * apart from "embedded and switched off" needs `isInsideIframe()` from this
 * package, which deliberately reports false inside a Foundry container so a
 * Code Workspace preview counts as standalone.
 */

import {
  useWorkshopContext,
  type IAsyncValue,
  type IConfigDefinition,
  type IWorkshopContext,
} from "@osdk/workshop-iframe-custom-widget";

export const ARTIFACT_SHELL_CONFIG = [
  {
    fieldId: "artifactSwitching",
    field: {
      type: "single" as const,
      label: "artifact-switching",
      helperText:
        "Shows the dropdown in the header for switching between the example " +
        "apps — one per package in this repo. Turn it off to pin the widget " +
        "to the app it was embedded on.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "boolean" as const, defaultValue: true },
      },
    },
  },
] as const satisfies IConfigDefinition;

export type ArtifactShellContext = IAsyncValue<
  IWorkshopContext<typeof ARTIFACT_SHELL_CONFIG>
>;

/**
 * The decision, as a plain function of the context.
 *
 * Separated from the hook so it can be tested without standing up a DOM, and
 * so the one non-obvious case — what to do before Workshop has answered — is
 * written down somewhere a test can reach.
 */
export function resolveArtifactSwitching(context: ArtifactShellContext): boolean {
  if (context.status !== "LOADED" && context.status !== "RELOADING") {
    // Still negotiating with Workshop, which only happens when embedded.
    // Hide it: a module that turned the switcher off should not see it appear
    // for a frame and then vanish, and a late control is less alarming than a
    // disappearing one.
    return false;
  }

  const field = context.value.artifactSwitching.fieldValue;
  return field.status === "LOADED" ? field.value ?? true : true;
}

/** Whether the header should offer the example switcher. */
export function useArtifactSwitching(): boolean {
  return resolveArtifactSwitching(
    useWorkshopContext<typeof ARTIFACT_SHELL_CONFIG>(ARTIFACT_SHELL_CONFIG),
  );
}
