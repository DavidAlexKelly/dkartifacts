/**
 * The version check, which is the part of `doctor` that has to be right.
 *
 * It exists because of a real incident: package.json asked for ^0.4.1, npm had
 * a cached packument and installed 0.3.0, and the mismatch surfaced three
 * steps later as a PostCSS "missing specifier" error that looked like a bug in
 * this package. The rule that catches it is the unintuitive one — on 0.x a
 * caret pins the MINOR, so ^0.4.1 does not accept 0.5.0 and certainly not
 * 0.3.0 — and it is worth a test precisely because most people, and most
 * hand-written comparisons, get it wrong.
 */
import { describe, expect, it } from "vitest";
import { satisfiesCaret } from "./doctor.mjs";

describe("satisfiesCaret", () => {
  it("pins the minor on 0.x", () => {
    expect(satisfiesCaret("^0.4.1", "0.4.1")).toBe(true);
    expect(satisfiesCaret("^0.4.1", "0.4.7")).toBe(true);
    // The incident: an older minor claiming to satisfy the range.
    expect(satisfiesCaret("^0.4.1", "0.3.0")).toBe(false);
    // And the other direction — 0.5.0 is a breaking change under 0.x rules.
    expect(satisfiesCaret("^0.4.1", "0.5.0")).toBe(false);
    expect(satisfiesCaret("^0.4.1", "0.4.0")).toBe(false);
  });

  it("allows any newer minor above 1.0", () => {
    expect(satisfiesCaret("^1.2.0", "1.3.0")).toBe(true);
    expect(satisfiesCaret("^1.2.0", "1.2.0")).toBe(true);
    expect(satisfiesCaret("^1.2.0", "2.0.0")).toBe(false);
    expect(satisfiesCaret("^1.2.0", "1.1.9")).toBe(false);
  });

  it("treats an exact range as exact", () => {
    expect(satisfiesCaret("0.4.1", "0.4.1")).toBe(true);
    expect(satisfiesCaret("0.4.1", "0.4.2")).toBe(false);
  });

  it("says 'I do not know' rather than guessing for ranges it cannot parse", () => {
    // "*", "next", a git URL: doctor must not report a false mismatch and
    // send someone chasing a problem that is not there.
    expect(satisfiesCaret("*", "0.4.1")).toBe(null);
    expect(satisfiesCaret("^0.4.1", "next")).toBe(null);
  });
});
