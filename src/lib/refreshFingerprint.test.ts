import { describe, expect, it } from "vitest";
import { applyFingerprintUpdates, shouldRefreshFingerprint } from "./refreshFingerprint";

const base = { quote: "A quote", tags: ["Money", "Risk"], my_notes: "a note" };

describe("shouldRefreshFingerprint", () => {
  it("refreshes a new highlight that has tags", () => {
    expect(shouldRefreshFingerprint(base, null)).toBe(true);
  });

  it("skips a new highlight with no tags", () => {
    expect(shouldRefreshFingerprint({ ...base, tags: [] }, null)).toBe(false);
    expect(shouldRefreshFingerprint({ ...base, tags: null }, null)).toBe(false);
  });

  it("skips an unchanged highlight", () => {
    expect(shouldRefreshFingerprint({ ...base }, base)).toBe(false);
  });

  it("refreshes when the quote changes", () => {
    expect(shouldRefreshFingerprint({ ...base, quote: "A different quote" }, base)).toBe(true);
  });

  it("refreshes when the tags change", () => {
    expect(shouldRefreshFingerprint({ ...base, tags: ["Money"] }, base)).toBe(true);
    expect(shouldRefreshFingerprint({ ...base, tags: ["Money", "Risk", "Habits"] }, base)).toBe(true);
  });

  it("refreshes when the notes change, treating empty and null as the same", () => {
    expect(shouldRefreshFingerprint({ ...base, my_notes: "changed" }, base)).toBe(true);
    expect(shouldRefreshFingerprint({ ...base, my_notes: null }, { ...base, my_notes: "" })).toBe(false);
    expect(shouldRefreshFingerprint({ ...base, my_notes: null }, base)).toBe(true);
  });

  it("treats a pure tag reorder and whitespace-only edits as unchanged", () => {
    expect(shouldRefreshFingerprint({ ...base, tags: ["Risk", "Money"] }, base)).toBe(false);
    expect(shouldRefreshFingerprint({ ...base, quote: "  A quote  " }, base)).toBe(false);
  });

  it("skips when the last tag was removed", () => {
    expect(shouldRefreshFingerprint({ ...base, tags: [] }, base)).toBe(false);
  });
});

describe("applyFingerprintUpdates", () => {
  it("keeps untouched fields and applies the ones given", () => {
    expect(applyFingerprintUpdates(base, { visibility: "private" })).toEqual(base);
    expect(applyFingerprintUpdates(base, { tags: ["Money"], my_notes: null })).toEqual({
      quote: "A quote",
      tags: ["Money"],
      my_notes: null,
    });
  });
});
