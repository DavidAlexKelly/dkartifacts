/**
 * The install guide is only worth having if it is right.
 *
 * A wrong install page is worse than no install page: the reader has no way to
 * tell a stale RID from a permissions problem, and will spend an afternoon on
 * the second while looking at the first. The manifest-derived fields cannot be
 * checked by eye — nobody re-reads a version string — so they are checked here.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXAMPLE_APPS } from "@/PackageApps/apps";
import {
  PACKAGE_GUIDES,
  REGISTRIES,
  guideFor,
  installFlow,
} from "@/install/guides";

describe("install guides", () => {
  it("covers every publishable package in the repo", () => {
    // The count is asserted rather than the list, so adding a package to
    // packages/ without adding it here fails loudly instead of the page
    // quietly omitting it.
    expect(PACKAGE_GUIDES).toHaveLength(8);
  });

  it("parsed a real Artifacts repository RID for each", () => {
    for (const guide of PACKAGE_GUIDES) {
      // "(unpublished)" is what the parser returns when publishConfig.registry
      // is missing or has changed shape — the failure mode that would put a
      // blank where the RID should be.
      expect(guide.registryRid, guide.name).toMatch(
        /^ri\.artifacts\.main\.repository\.[0-9a-f-]+$/,
      );
    }
  });

  it("points every package at one of the two registries it documents", () => {
    const known = REGISTRIES.map((registry) => registry.rid);
    expect(new Set(known).size).toBe(2);
    for (const guide of PACKAGE_GUIDES) {
      expect(known, guide.name).toContain(guide.registryRid);
    }
  });

  it("reads a version and a summary from each manifest", () => {
    for (const guide of PACKAGE_GUIDES) {
      expect(guide.version, guide.name).toMatch(/^\d+\.\d+\.\d+/);
      expect(guide.summary.length, guide.name).toBeGreaterThan(20);
    }
  });

  it("names subpaths a consumer can actually import", () => {
    for (const guide of PACKAGE_GUIDES) {
      expect(guide.subpaths.length, guide.name).toBeGreaterThan(0);
      for (const subpath of guide.subpaths) {
        // The root export is shown as the bare package name, never "@acc/x/.".
        expect(subpath, guide.name).toMatch(/^@acc\/[a-z0-9-]+(\/[\w./*-]+)?$/);
      }
    }
  });

  it("only links to examples this app actually routes", () => {
    const paths = EXAMPLE_APPS.map((app) => app.path);
    for (const guide of PACKAGE_GUIDES) {
      if (guide.examplePath != null) {
        expect(paths, guide.name).toContain(guide.examplePath);
      }
    }
  });

  it("gives every package something to copy", () => {
    for (const guide of PACKAGE_GUIDES) {
      expect(guide.usage.length, guide.name).toBeGreaterThan(0);
      for (const step of guide.usage) {
        // A snippet that does not mention the package is a snippet that drifted
        // off the package it is filed under.
        expect(
          guide.usage.some((s) => s.code.includes(guide.name)),
          `${guide.name} · ${step.title}`,
        ).toBe(true);
      }
    }
  });

  it("throws rather than guessing for an unknown package", () => {
    expect(() => guideFor("@acc/not-a-package")).toThrow();
  });
});

describe("the install flow", () => {
  it("is the same four steps whichever package you pick", () => {
    for (const guide of PACKAGE_GUIDES) {
      expect(installFlow(guide), guide.name).toHaveLength(4);
    }
  });

  /**
   * The screenshots are imported, so a missing file is a build error rather
   * than a broken image — but an import that resolves to an empty string would
   * still render a blank frame, and that is what a mis-handled base path did
   * once already.
   */
  it("has a usable URL for every screenshot", () => {
    for (const step of installFlow(PACKAGE_GUIDES[0])) {
      if (step.image != null) {
        expect(step.image.src.length, step.image.alt).toBeGreaterThan(0);
        // Whatever the bundler hands back, the one thing it must not be is a
        // path this file guessed at.
        expect(step.image.src, step.image.alt).not.toContain("public/");
      }
    }
  });

  it("still has all four screenshot files on disk", () => {
    const dir = join(process.cwd(), "src", "install", "screenshots");
    for (const file of [
      "install-1-libraries-search.png",
      "install-2-add-package.png",
      "install-3-reorder-libraries.png",
      "install-4-npm-install.png",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }
  });

  it("describes every screenshot for a reader who cannot see it", () => {
    for (const step of installFlow(PACKAGE_GUIDES[0])) {
      if (step.image != null) {
        // jsx-a11y enforces that alt exists; nothing enforces that it says
        // anything, and "screenshot.png" is the usual result.
        expect(step.image.alt.length, step.title).toBeGreaterThan(40);
      }
    }
  });

  it("ends in a plain npm install, with no registry override", () => {
    for (const guide of PACKAGE_GUIDES) {
      const last = installFlow(guide)[3];
      expect(last.code, guide.name).toBe(`npm install ${guide.name}`);
      // The override is the symptom of skipping the Libraries panel, and the
      // reason the old copy of these instructions was slow and fragile.
      expect(last.code, guide.name).not.toContain("--registry");
    }
  });
});
