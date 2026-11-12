import { describe, expect, it } from "vitest";
import {
  decideCurrent,
  fitHint,
  initReview,
  isReviewDone,
  parseStoredPairSort,
  replaceCurrent,
  sharePercent,
  skipCurrent,
  sortPairs,
  splitUnusedUnlisted,
  undoLast,
  type TagOverlapHighlight,
  type TagOverlapPair,
} from "./tagOverlap";

const hl = (id: string, tags: string[] = ["Family", "Marriage", "Love"]): TagOverlapHighlight => ({
  highlight_id: id,
  quote: `Quote ${id}`,
  my_notes: null,
  tags,
  book_title: "Book",
  book_author: "Author",
  fit_a: 0.9,
  fit_b: 0.8,
});

describe("fitHint", () => {
  it("names the better-fitting tag when the gap is at least 0.02", () => {
    expect(fitHint(0.91, 0.84, "Money", "Risk")).toBe("Reads more like Money");
    expect(fitHint(0.7, 0.72, "Money", "Risk")).toBe("Reads more like Risk");
  });

  it("says both fit similarly under the gap", () => {
    expect(fitHint(0.8, 0.81, "Money", "Risk")).toBe("Both fit similarly");
    expect(fitHint(0.8, 0.8, "Money", "Risk")).toBe("Both fit similarly");
  });

  it("handles missing fits", () => {
    expect(fitHint(null, 0.8, "Money", "Risk")).toBe("No fingerprint to compare");
  });
});

describe("sharePercent", () => {
  it("rounds a share to a whole percent", () => {
    expect(sharePercent(0.87)).toBe(87);
    expect(sharePercent(1)).toBe(100);
    expect(sharePercent(0.333)).toBe(33);
  });
});

describe("splitUnusedUnlisted", () => {
  it("separates unused taxonomy tags from used tags missing from the taxonomy", () => {
    const rows = [
      { tag: "Money", count: 10, inTaxonomy: true },
      { tag: "Spare", count: 0, inTaxonomy: true },
      { tag: "stray tag", count: 3, inTaxonomy: false },
    ];
    const { unused, unlisted } = splitUnusedUnlisted(rows);
    expect(unused.map((r) => r.tag)).toEqual(["Spare"]);
    expect(unlisted.map((r) => r.tag)).toEqual(["stray tag"]);
  });
});

describe("review queue", () => {
  it("advances on decide and skip, and finishes", () => {
    let s = initReview([hl("a"), hl("b"), hl("c")]);
    s = decideCurrent(s, null);
    s = skipCurrent(s);
    expect(s.pos).toBe(2);
    expect(s.skipped).toBe(1);
    expect(isReviewDone(s)).toBe(false);
    s = decideCurrent(s, "Family");
    expect(isReviewDone(s)).toBe(true);
    expect(s.decided.map((d) => d.index)).toEqual([0, 2]);
  });

  it("removing a tag updates only that card's tags", () => {
    const s = decideCurrent(initReview([hl("a"), hl("b")]), "Marriage");
    expect(s.items[0].tags).toEqual(["Family", "Love"]);
    expect(s.items[1].tags).toEqual(["Family", "Marriage", "Love"]);
  });

  it("undo brings the last decided card back with the restored tags", () => {
    let s = initReview([hl("a"), hl("b"), hl("c")]);
    s = decideCurrent(s, "Marriage");
    s = decideCurrent(s, null);
    s = undoLast(s, ["Family", "Marriage", "Love"]);
    expect(s.pos).toBe(1);
    expect(s.decided).toHaveLength(1);
    s = undoLast(s, ["Family", "Marriage", "Love"]);
    expect(s.pos).toBe(0);
    expect(s.items[0].tags).toEqual(["Family", "Marriage", "Love"]);
    expect(undoLast(s, []).pos).toBe(0);
  });

  it("decide and skip do nothing past the end", () => {
    const s = initReview([hl("a")]);
    const done = decideCurrent(s, null);
    expect(decideCurrent(done, null)).toBe(done);
    expect(skipCurrent(done)).toBe(done);
  });
});

describe("replaceCurrent", () => {
  it("shows the updated version of the current highlight", () => {
    let s = initReview([hl("a"), hl("b"), hl("c")]);
    s = decideCurrent(s, null);
    const edited = { ...hl("b"), quote: "Edited quote", tags: ["Family", "Marriage"] };
    s = replaceCurrent(s, edited);
    expect(s.items[1].quote).toBe("Edited quote");
    expect(s.pos).toBe(1);
    expect(s.decided).toHaveLength(1);
  });

  it("drops the current highlight when it no longer has both tags", () => {
    let s = initReview([hl("a"), hl("b"), hl("c")]);
    s = decideCurrent(s, null);
    s = replaceCurrent(s, null);
    expect(s.items.map((i) => i.highlight_id)).toEqual(["a", "c"]);
    expect(s.pos).toBe(1);
    expect(s.items[s.pos].highlight_id).toBe("c");
    expect(s.decided.map((d) => d.index)).toEqual([0]);
  });

  it("finishes the queue when the last card is dropped, and ignores a finished queue", () => {
    let s = initReview([hl("a")]);
    s = replaceCurrent(s, null);
    expect(isReviewDone(s)).toBe(true);
    expect(replaceCurrent(s, hl("z"))).toBe(s);
  });
});

const pair = (a: string, b: string, shared: number, share: number): TagOverlapPair => ({
  tag_a: a,
  tag_b: b,
  count_a: 10,
  count_b: 20,
  shared,
  to_review: shared,
  share_of_smaller: share,
  meaning_similarity: null,
});

describe("sortPairs", () => {
  const pairs = [pair("A", "B", 10, 0.5), pair("C", "D", 40, 0.2), pair("E", "F", 25, 0.9), pair("G", "H", 25, 0.4)];

  it("overlap: highest share of the smaller tag first, then more shared", () => {
    expect(sortPairs(pairs, "overlap").map((p) => p.tag_a)).toEqual(["E", "A", "G", "C"]);
  });

  it("shared: most shared highlights first, then overlap", () => {
    expect(sortPairs(pairs, "shared").map((p) => p.tag_a)).toEqual(["C", "E", "G", "A"]);
  });

  it("breaks full ties by tag names and does not change the input", () => {
    const tied = [pair("Z", "Y", 5, 0.5), pair("A", "B", 5, 0.5)];
    expect(sortPairs(tied, "overlap").map((p) => p.tag_a)).toEqual(["A", "Z"]);
    expect(tied[0].tag_a).toBe("Z");
  });

  it("parses the remembered choice, defaulting to overlap", () => {
    expect(parseStoredPairSort("shared")).toBe("shared");
    expect(parseStoredPairSort("overlap")).toBe("overlap");
    expect(parseStoredPairSort(null)).toBe("overlap");
    expect(parseStoredPairSort("zzz")).toBe("overlap");
  });
});
