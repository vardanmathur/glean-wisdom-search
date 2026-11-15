import { describe, expect, it } from "vitest";
import { filterOptions, multiSelectLabel, toggleId } from "./multiSelect";

const options = [
  { id: "b1", label: "Atomic Habits" },
  { id: "b2", label: "The Habit of Winning" },
  { id: "b3", label: "Deep Work" },
];

describe("multiSelectLabel", () => {
  it("says All books when nothing is selected", () => {
    expect(multiSelectLabel([], options, "All books", "Books")).toBe("All books");
  });

  it("shows the book's title when one is selected", () => {
    expect(multiSelectLabel(["b3"], options, "All books", "Books")).toBe("Deep Work");
  });

  it("shows a count when several are selected", () => {
    expect(multiSelectLabel(["b1", "b3"], options, "All books", "Books")).toBe("Books (2)");
    expect(multiSelectLabel(["b1", "b2", "b3"], options, "All books", "Books")).toBe("Books (3)");
  });

  it("falls back to a count when the one selected book is not in the list yet", () => {
    expect(multiSelectLabel(["zzz"], options, "All books", "Books")).toBe("Books (1)");
    expect(multiSelectLabel(["b1"], [], "All books", "Books")).toBe("Books (1)");
  });
});

describe("toggleId", () => {
  it("adds and removes an id without touching the others", () => {
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleId([], "a")).toEqual(["a"]);
  });
});

describe("filterOptions", () => {
  it("returns everything for an empty search", () => {
    expect(filterOptions(options, "  ")).toBe(options);
  });

  it("matches anywhere in the title, ignoring case, and puts titles that start with it first", () => {
    expect(filterOptions(options, "habit").map((o) => o.id)).toEqual(["b1", "b2"]);
    expect(filterOptions(options, "the").map((o) => o.id)).toEqual(["b2"]);
    expect(filterOptions(options, "work").map((o) => o.id)).toEqual(["b3"]);
    expect(filterOptions(options, "nothing")).toEqual([]);
  });
});
