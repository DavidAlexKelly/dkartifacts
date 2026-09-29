import { describe, expect, it } from "vitest";

import {
  FoundryAccessError,
  FoundryBytesError,
  FoundryNotConfiguredError,
  FoundryNotFoundError,
  FoundryTransferError,
  describeFoundryError,
  errorForResponse,
  isAbortError,
} from "./errors.js";

const RID = "ri.foundry.main.dataset.c7e99de1";
const PATH = "z12/c091_r018.pmtiles";

describe("errorForResponse", () => {
  it("classifies 401 and 403 as access denied", () => {
    for (const status of [401, 403]) {
      const err = errorForResponse(status, "Forbidden", RID, PATH);
      expect(err).toBeInstanceOf(FoundryAccessError);
      expect(err.kind).toBe("access-denied");
      expect(err.status).toBe(status);
    }
  });

  it("classifies 404 as not found", () => {
    const err = errorForResponse(404, "Not Found", RID, PATH);
    expect(err).toBeInstanceOf(FoundryNotFoundError);
    expect(err.kind).toBe("not-found");
  });

  it("classifies anything else as a transfer failure", () => {
    const err = errorForResponse(503, "Service Unavailable", RID, PATH);
    expect(err).toBeInstanceOf(FoundryTransferError);
    expect(err.kind).toBe("transfer");
    expect(err.status).toBe(503);
  });

  it("carries the rid and path so a consumer can name the resource", () => {
    const err = errorForResponse(403, "Forbidden", RID, PATH);
    expect(err.rid).toBe(RID);
    expect(err.path).toBe(PATH);
  });

  it("produces real Errors that survive instanceof both ways", () => {
    const err = errorForResponse(403, "Forbidden", RID, PATH);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FoundryBytesError);
    expect(err.name).toBe("FoundryAccessError");
  });
});

describe("describeFoundryError", () => {
  it("tells the user to add the dataset as a Resource on a 403", () => {
    // This is the failure everyone hits first, and the one where a generic
    // message wastes the most time.
    const guidance = describeFoundryError(
      new FoundryAccessError(RID, PATH, 403),
    );
    expect(guidance.title).toBe("Access denied");
    expect(guidance.remediation).toMatch(/Resources/);
    expect(guidance.remediation).toMatch(/scopes alone are not sufficient/);
    expect(guidance.rid).toBe(RID);
  });

  it("points at the chunking transform on a 404", () => {
    const guidance = describeFoundryError(
      new FoundryNotFoundError(RID, "manifest.json"),
    );
    expect(guidance.title).toBe("Data not found");
    expect(guidance.remediation).toMatch(/manifest/);
  });

  it("names the missing setup call when unconfigured", () => {
    const guidance = describeFoundryError(
      new FoundryNotConfiguredError("decho-basemap is not configured."),
    );
    expect(guidance.remediation).toMatch(/configureFoundryBytes/);
  });

  it("degrades to a plain message for an unknown error", () => {
    const guidance = describeFoundryError(new Error("socket hang up"));
    expect(guidance.title).toBe("Data unavailable");
    expect(guidance.detail).toBe("socket hang up");
    expect(guidance.remediation).toBeUndefined();
  });

  it("handles a thrown non-Error without crashing the overlay", () => {
    expect(describeFoundryError("just a string").detail).toBe("just a string");
    expect(describeFoundryError(undefined).detail).toBe("undefined");
  });
});

describe("isAbortError", () => {
  it("recognises a cancellation", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
  });

  it("does not mistake a real failure for a cancellation", () => {
    expect(isAbortError(new Error("boom"))).toBe(false);
    expect(isAbortError(errorForResponse(403, "Forbidden", RID, PATH))).toBe(
      false,
    );
    expect(isAbortError(null)).toBe(false);
  });
});
