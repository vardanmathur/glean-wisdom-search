import { describe, expect, it } from "vitest";
import { describeInspireLine, inspireShows, randomOffset, rowToHighlight, type InspireRow } from "./inspire";

const row = (over: Partial<InspireRow> = {}): InspireRow => ({
  id: "h1",
  quote: "A quote",
  tags: ["Money"],
  my_notes: null,
  source: "curated",
  visibility: "public",
  user_id: null,
  book_id: "b1",
  books: {
    title: "A Book",
    author: "An Author",
    cover_image_url: "cover.png",
    cover_cached_url: "stored.png",
    cover_cached_from: "cover.png",
  },
  user_profiles: null,
  ...over,
});

describe("randomOffset", () => {
  it("stays inside [0, count)", () => {
    expect(randomOffset(1500, () => 0)).toBe(0);
    expect(randomOffset(1500, () => 0.5)).toBe(750);
    expect(randomOffset(1500, () => 0.999999)).toBe(1499);
  });

  it("clamps when rand returns exactly 1, and handles an empty library", () => {
    expect(randomOffset(10, () => 1)).toBe(9);
    expect(randomOffset(0)).toBe(0);
  });

  it("covers every position evenly over a sweep of rand values", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(randomOffset(100, () => (i + 0.5) / 100));
    expect(seen.size).toBe(100);
  });
});

describe("rowToHighlight", () => {
  it("maps a full row", () => {
    expect(rowToHighlight(row({ my_notes: "note", user_id: "u1", user_profiles: { display_name: "Vardan" } }))).toEqual({
      id: "h1",
      text: "A quote",
      bookTitle: "A Book",
      author: "An Author",
      tags: ["Money"],
      bookId: "b1",
      coverImageUrl: "cover.png",
      coverCachedUrl: "stored.png",
      coverCachedFrom: "cover.png",
      myNotes: "note",
      source: "curated",
      userId: "u1",
      displayName: "Vardan",
      visibility: "public",
    });
  });

  it("falls back for a missing book, tags, source and notes", () => {
    const h = rowToHighlight(row({ books: null, tags: null, source: null, book_id: null, visibility: null }));
    expect(h.bookTitle).toBe("Unknown");
    expect(h.author).toBe("Unknown");
    expect(h.tags).toEqual([]);
    expect(h.source).toBe("curated");
    expect(h.bookId).toBeUndefined();
    expect(h.myNotes).toBeUndefined();
    expect(h.visibility).toBeUndefined();
  });
});

describe("inspireShows", () => {
  it("reads the embedded stats row in any shape", () => {
    expect(inspireShows({ times_shown: 4 })).toBe(4);
    expect(inspireShows([{ times_shown: 2 }])).toBe(2);
    expect(inspireShows(null)).toBe(0);
    expect(inspireShows([])).toBe(0);
    expect(inspireShows(undefined)).toBe(0);
    expect(inspireShows({ times_shown: "x" })).toBe(0);
  });
});

describe("describeInspireLine", () => {
  it("is one compact line", () => {
    expect(
      describeInspireLine({
        public_total: 1500,
        shown_at_least_once: 375,
        never_shown: 1125,
        min_shown: 0,
        max_shown: 3,
        total_shows: 420,
      }),
    ).toBe("Inspire: 375 of 1500 shown at least once · min 0 / max 3");
  });
});
