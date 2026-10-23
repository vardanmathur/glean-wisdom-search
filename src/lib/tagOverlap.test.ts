import { describe, expect, it } from "vitest";
import {
  decideCurrent,
  fitHint,
  initReview,
  isReviewDone,
  sharePercent,
  skipCurrent,
  splitUnusedUnlisted,
  undoLast,
  type TagOverlapHighlight,
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
