import { describe, it, expect } from "vitest";
import { attachNotesAndFilter, collapseNoteChains, NOTE_CHAIN_GAP_MS, type ParsedHighlight } from "@/lib/kindleImport";

const at = (seconds: number) => new Date(2020, 0, 1, 12, 0, seconds);
const entry = (over: Partial<ParsedHighlight> & Pick<ParsedHighlight, "entry_type" | "quote">): ParsedHighlight => ({
  book_title: "Book A",
  author: "Author A",
  author_unknown: false,
  kindle_location: "Location 10",
  kindle_timestamp: at(0),
  my_notes: null,
  ...over,
});
const note = (quote: string, seconds: number, over: Partial<ParsedHighlight> = {}) =>
  entry({ entry_type: "Note", quote, kindle_timestamp: at(seconds), ...over });
const highlight = (quote: string, seconds = 0) =>
  entry({ entry_type: "Highlight", quote, kindle_location: "Location 1-2", kindle_timestamp: at(seconds) });
const quotes = (list: ParsedHighlight[]) => list.map((e) => e.quote);
const DAY = 86400;

describe("collapseNoteChains: gap rule", () => {
  it("uses a 60 second gap", () => {
    expect(NOTE_CHAIN_GAP_MS).toBe(60_000);
  });

  it("keeps only the latest note of a chain", () => {
    expect(quotes(collapseNoteChains([note("a", 0), note("a b", 5), note("a b c", 9)]))).toEqual(["a b c"]);
  });

  it("a gap of exactly 60s joins the chain, 61s with unrelated text does not", () => {
    expect(quotes(collapseNoteChains([note("one", 0), note("two", 60)]))).toEqual(["two"]);
    expect(quotes(collapseNoteChains([note("one", 0), note("two", 61)]))).toEqual(["one", "two"]);
  });

  it("measures the gap between consecutive notes, not the whole chain", () => {
    expect(quotes(collapseNoteChains([note("p", 0), note("q", 50), note("r", 100)]))).toEqual(["r"]);
  });
});

describe("collapseNoteChains: prefix rule", () => {
  it("a later note that starts with an earlier note's text supersedes it whatever the gap", () => {
    expect(quotes(collapseNoteChains([note("idea", 0), note("idea, expanded", 3 * DAY)]))).toEqual(["idea, expanded"]);
  });

  it("collapses when the next character is punctuation or whitespace", () => {
    expect(quotes(collapseNoteChains([note("Yes", 0), note("Yes, but", 3 * DAY)]))).toEqual(["Yes, but"]);
    expect(quotes(collapseNoteChains([note("Yes", 0), note("Yes but", 3 * DAY)]))).toEqual(["Yes but"]);
  });

  it("collapses identical text", () => {
    expect(quotes(collapseNoteChains([note("idea", 0), note("idea", 3 * DAY)]))).toEqual(["idea"]);
  });

  it("ignores trailing whitespace on the earlier note", () => {
    expect(quotes(collapseNoteChains([note("idea  ", 0), note("idea, expanded", 3 * DAY)]))).toEqual(["idea, expanded"]);
    expect(quotes(collapseNoteChains([note("idea  ", 0), note("ideal thing", 3 * DAY)]))).toEqual(["idea  ", "ideal thing"]);
  });

  it("does not collapse when the match ends in the middle of a word", () => {
    expect(quotes(collapseNoteChains([note("a", 0), note("also revisit this", 3 * DAY)]))).toEqual(["a", "also revisit this"]);
    expect(quotes(collapseNoteChains([note("Yes", 0), note("Yesterday I thought", 3 * DAY)]))).toEqual(["Yes", "Yesterday I thought"]);
    expect(quotes(collapseNoteChains([note("caf", 0), note("café menu", 3 * DAY)]))).toEqual(["caf", "café menu"]);
  });

  it("targets the matching earlier note, not just the latest", () => {
    expect(quotes(collapseNoteChains([note("alpha", 0), note("unrelated", 7200), note("alpha plus", 3 * DAY)]))).toEqual([
      "unrelated",
      "alpha plus",
    ]);
  });
});

describe("collapseNoteChains: notes that must stay separate", () => {
  it("different location", () => {
    expect(quotes(collapseNoteChains([note("same", 0, { kindle_location: "Location 11" }), note("same more", 5)]))).toEqual([
      "same",
      "same more",
    ]);
  });

  it("different book", () => {
    expect(quotes(collapseNoteChains([note("same", 0, { book_title: "Book B" }), note("same more", 5)]))).toEqual([
      "same",
      "same more",
    ]);
  });

  it("missing timestamp on either note, even when the text extends", () => {
    expect(quotes(collapseNoteChains([note("x", 0, { kindle_timestamp: null }), note("x y", 5)]))).toEqual(["x", "x y"]);
    expect(quotes(collapseNoteChains([note("x", 0), note("x y", 5, { kindle_timestamp: null })]))).toEqual(["x", "x y"]);
    expect(quotes(collapseNoteChains([note("idea", 0), note("idea more", 0, { kindle_timestamp: null })]))).toEqual([
      "idea",
      "idea more",
    ]);
  });

  it("missing or empty location", () => {
    expect(
      quotes(collapseNoteChains([note("x", 0, { kindle_location: null }), note("x y", 5, { kindle_location: null })]))
    ).toEqual(["x", "x y"]);
    expect(
      quotes(collapseNoteChains([note("x", 0, { kindle_location: "" }), note("x y", 5, { kindle_location: "" })]))
    ).toEqual(["x", "x y"]);
  });

  it("out-of-order timestamps, with or without a text match", () => {
    expect(quotes(collapseNoteChains([note("p", 100), note("q", 50)]))).toEqual(["p", "q"]);
    expect(quotes(collapseNoteChains([note("x", 100), note("x more", 50)]))).toEqual(["x", "x more"]);
  });
});

describe("collapseNoteChains: pass-through", () => {
  it("keeps highlights and bookmarks in order and does not mutate its input", () => {
    const bookmark = entry({ entry_type: "Bookmark", quote: "" });
    const input = [highlight("h1"), note("n1", 1), note("n1 n2", 3), bookmark, highlight("h2")];
    const before = [...input];
    expect(quotes(collapseNoteChains(input))).toEqual(["h1", "n1 n2", "", "h2"]);
    expect(input).toEqual(before);
  });
});

describe("attachNotesAndFilter with chains", () => {
  it("attaches only the final note of a keystroke chain", () => {
    const out = attachNotesAndFilter([highlight("a passage long enough"), note("a", 1), note("ab", 3), note("abc", 5)]);
    expect(out).toHaveLength(1);
    expect(out[0].my_notes).toBe("abc");
  });

  it("still joins genuinely separate notes with a newline", () => {
    const out = attachNotesAndFilter([highlight("a passage long enough"), note("first thought", 1), note("second thought", 200)]);
    expect(out[0].my_notes).toBe("first thought\nsecond thought");
  });
});
