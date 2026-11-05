import { describe, expect, it } from "vitest";
import {
  defaultKeepId,
  editThreshold,
  findDuplicatePairs,
  groupPairsByKind,
  markContained,
  markDifference,
  mergeTagsAndNotes,
  pairKey,
  shouldMoveBookmark,
  type DuplicateCandidate,
} from "./findDuplicateHighlights";

const LONG = "The quick brown fox jumps over the lazy dog while the rest of the village sleeps soundly";
let n = 0;
const row = (quote: string, book: string | null, created = "2026-01-01T00:00:00Z", id?: string): DuplicateCandidate => ({
  id: id ?? `h${++n}`,
  quote,
  book_id: book,
  created_at: created,
});

describe("findDuplicatePairs: same book", () => {
  it("finds near-identical saves that differ only in case, spacing and punctuation", () => {
    const a = row(LONG, "b1", "2026-01-01T00:00:00Z", "old");
    const b = row("  " + LONG.toUpperCase() + "!  ", "b1", "2026-02-01T00:00:00Z", "new");
    expect(findDuplicatePairs([b, a])).toEqual([{ kind: "near_identical", first: "old", second: "new" }]);
  });

  it("finds a small edit as near-identical, older first", () => {
    const a = row(LONG, "b1", "2026-03-01T00:00:00Z", "newer");
    const b = row(LONG.replace("quick", "quik"), "b1", "2026-01-01T00:00:00Z", "older");
    const pairs = findDuplicatePairs([a, b]);
    expect(pairs).toEqual([{ kind: "near_identical", first: "older", second: "newer" }]);
  });

  it("does not call a big edit near-identical", () => {
    const a = row(LONG, "b1");
    const b = row(LONG.replace("quick brown fox jumps", "slow grey cat walks"), "b1");
    expect(findDuplicatePairs([a, b])).toEqual([]);
  });

  it("finds a shorter save contained anywhere in the longer one, shorter first", () => {
    const short = row("jumps over the lazy dog while the rest of the village", "b1", "2026-01-01T00:00:00Z", "short");
    const long = row(LONG + " and the night goes on and on forever", "b1", "2026-02-01T00:00:00Z", "long");
    expect(findDuplicatePairs([long, short])).toEqual([{ kind: "contained", first: "short", second: "long" }]);
  });

  it("prefers contained over near-identical when one text extends the other", () => {
    const short = row(LONG, "b1", "2026-02-01T00:00:00Z", "short");
    const long = row(LONG + " ok yes", "b1", "2026-01-01T00:00:00Z", "long");
    expect(findDuplicatePairs([short, long])).toEqual([{ kind: "contained", first: "short", second: "long" }]);
  });

  it("ignores contained text under 30 characters", () => {
    const short = row("lazy dog while the rest", "b1");
    const long = row(LONG, "b1");
    expect(findDuplicatePairs([short, long])).toEqual([]);
  });

  it("does not pair unrelated highlights", () => {
    expect(findDuplicatePairs([row(LONG, "b1"), row("A completely different sentence about money and time", "b1")])).toEqual([]);
  });
});

describe("findDuplicatePairs: other books", () => {
  it("reports equal text in two books, older first", () => {
    const a = row(LONG, "b1", "2026-02-01T00:00:00Z", "later");
    const b = row(LONG, "b2", "2026-01-01T00:00:00Z", "earlier");
    expect(findDuplicatePairs([a, b])).toEqual([{ kind: "other_book", first: "earlier", second: "later" }]);
  });

  it("reports contained text across books, shorter first", () => {
    const short = row("jumps over the lazy dog while the rest of the village", "b1", undefined, "s");
    const long = row(LONG, "b2", undefined, "l");
    expect(findDuplicatePairs([short, long])).toEqual([{ kind: "other_book", first: "s", second: "l" }]);
  });

  it("never edit-distance-matches across books", () => {
    expect(findDuplicatePairs([row(LONG, "b1"), row(LONG.replace("quick", "quik"), "b2")])).toEqual([]);
  });

  it("treats rows without a book as different books", () => {
    const a = row(LONG, null, undefined, "x");
    const b = row(LONG, null, undefined, "y");
    expect(findDuplicatePairs([a, b]).map((p) => p.kind)).toEqual(["other_book"]);
  });
});

describe("findDuplicatePairs: robustness", () => {
  it("skips empty quotes and handles an empty library", () => {
    expect(findDuplicatePairs([])).toEqual([]);
    expect(findDuplicatePairs([row("", "b1"), row("   ", "b1")])).toEqual([]);
  });

  it("stays fast for about 1,500 highlights", () => {
    // Distinct pseudo-random 14-word quotes, 60 books of 25 highlights each.
    const vocab = Array.from({ length: 400 }, (_, i) => "w" + (i * 2654435761).toString(36).slice(0, 6) + i);
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    const rows: DuplicateCandidate[] = [];
    for (let i = 0; i < 1500; i++) {
      const words = Array.from({ length: 14 }, () => vocab[next() % vocab.length]);
      rows.push(row(words.join(" "), "book" + (i % 60)));
    }
    const start = Date.now();
    const pairs = findDuplicatePairs(rows);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(pairs).toEqual([]);
  });
});

describe("helpers", () => {
  it("edit threshold is 3% of the longer text, capped at 10", () => {
    expect(editThreshold(20)).toBe(0);
    expect(editThreshold(100)).toBe(3);
    expect(editThreshold(2000)).toBe(10);
  });

  it("builds the same key whichever way round the ids come", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
    expect(pairKey("a", "b")).not.toBe(pairKey("a", "c"));
  });

  it("keeps the older save for near-identical and the longer text otherwise", () => {
    expect(defaultKeepId({ kind: "near_identical", first: "old", second: "new" })).toBe("old");
    expect(defaultKeepId({ kind: "contained", first: "short", second: "long" })).toBe("long");
    expect(defaultKeepId({ kind: "other_book", first: "short", second: "long" })).toBe("long");
  });

  it("groups pairs by kind", () => {
    const g = groupPairsByKind([
      { kind: "contained", first: "a", second: "b" },
      { kind: "other_book", first: "c", second: "d" },
      { kind: "contained", first: "e", second: "f" },
    ]);
    expect(g.near_identical).toHaveLength(0);
    expect(g.contained).toHaveLength(2);
    expect(g.other_book).toHaveLength(1);
  });
});

describe("mergeTagsAndNotes", () => {
  it("unions tags without repeating, keeping the kept copy's first", () => {
    const m = mergeTagsAndNotes({ tags: ["Money", "Risk"], my_notes: null }, { tags: ["risk", "Habits"], my_notes: null });
    expect(m.tags).toEqual(["Money", "Risk", "Habits"]);
    expect(m.changed).toBe(true);
  });

  it("appends the other copy's notes under a --- line", () => {
    const m = mergeTagsAndNotes({ tags: ["A"], my_notes: "mine" }, { tags: ["A"], my_notes: "theirs" });
    expect(m.my_notes).toBe("mine" + String.fromCharCode(10, 10) + "---" + String.fromCharCode(10, 10) + "theirs");
    expect(m.changed).toBe(true);
  });

  it("takes the other notes when the kept copy has none, and ignores identical notes", () => {
    expect(mergeTagsAndNotes({ tags: null, my_notes: null }, { tags: null, my_notes: "only here" }).my_notes).toBe("only here");
    const same = mergeTagsAndNotes({ tags: ["A"], my_notes: " same " }, { tags: ["a"], my_notes: "same" });
    expect(same.my_notes).toBe("same");
    expect(same.changed).toBe(false);
  });

  it("reports no change when the other copy adds nothing", () => {
    const m = mergeTagsAndNotes({ tags: ["A"], my_notes: "n" }, { tags: ["A"], my_notes: null });
    expect(m.changed).toBe(false);
    expect(m.tags).toEqual(["A"]);
  });
});

describe("highlighting", () => {
  it("marks the shorter text inside the longer one", () => {
    expect(markContained("one two three four", "two three")).toEqual({ before: "one ", match: "two three", after: " four" });
    expect(markContained("one two", "nope")).toBeNull();
    expect(markContained("one two", "  ")).toBeNull();
  });

  it("marks only what differs between two near-identical texts", () => {
    const d = markDifference("The quick fox", "The quik fox");
    expect(d.a).toEqual({ before: "The qui", match: "c", after: "k fox" });
    expect(d.b).toEqual({ before: "The qui", match: "", after: "k fox" });
  });

  it("handles identical and fully different texts", () => {
    expect(markDifference("same", "same").a.match).toBe("");
    expect(markDifference("abc", "xyz").a).toEqual({ before: "", match: "abc", after: "" });
  });
});

describe("shouldMoveBookmark", () => {
  it("moves the bookmark when only the deleted copy is saved", () => {
    expect(shouldMoveBookmark(["gone"], "gone", "kept")).toBe(true);
    expect(shouldMoveBookmark(new Set(["gone", "other"]), "gone", "kept")).toBe(true);
  });

  it("does nothing when the kept copy is already saved", () => {
    expect(shouldMoveBookmark(["gone", "kept"], "gone", "kept")).toBe(false);
    expect(shouldMoveBookmark(["kept"], "gone", "kept")).toBe(false);
  });

  it("does nothing when the deleted copy was never saved", () => {
    expect(shouldMoveBookmark([], "gone", "kept")).toBe(false);
    expect(shouldMoveBookmark(["something-else"], "gone", "kept")).toBe(false);
  });
});
