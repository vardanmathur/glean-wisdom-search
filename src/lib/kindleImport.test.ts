import { describe, it, expect } from "vitest";
import {
  attachNotesAndFilter,
  autoResolveTruncated,
  booksNeedingAttention,
  collapseNoteChains,
  defaultReviewStatus,
  detectDuplicatesLevel1,
  findRenamePairs,
  importBlockReason,
  isTruncatedSave,
  levenshtein,
  levenshteinWithin,
  loadMatchPool,
  matchAgainstLibrary,
  normaliseQuote,
  NOTE_CHAIN_GAP_MS,
  planRenameSkip,
  planReviewChange,
  reviewVersionViews,
  splitReviewCards,
  undecidedPendingIds,
  toMatchPool,
  type LibraryHighlight,
  type ParsedHighlight,
  type RawLibraryRow,
  type RenameCheckRow,
  type ReviewAction,
  type ReviewStatus,
  type ReviewVersion,
  type StagingRowDraft,
} from "@/lib/kindleImport";

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

let draftCounter = 0;
const draft = (quote: string, title = "Book A", status: StagingRowDraft["status"] = "pending"): StagingRowDraft => ({
  client_id: `d${++draftCounter}`,
  quote,
  book_title: title,
  author: null,
  kindle_location: null,
  kindle_timestamp: null,
  my_notes: null,
  status,
  duplicate_of_client_id: null,
});
const lib = (id: string, quote: string, title = "Book A", scope?: "library" | "shared"): LibraryHighlight => ({
  id,
  quote,
  book_title: title,
  scope,
});
const matchOf = (d: StagingRowDraft, pool: LibraryHighlight[]) => matchAgainstLibrary([d], pool).get(d.client_id);

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const randomLetters = (rand: () => number, len: number) =>
  Array.from({ length: len }, () => String.fromCharCode(97 + Math.floor(rand() * 26))).join("");
const mutate = (rand: () => number, s: string, edits: number) => {
  const chars = s.split("");
  for (let i = 0; i < edits; i++) {
    const pos = Math.floor(rand() * chars.length);
    const kind = Math.floor(rand() * 3);
    if (kind === 0) chars[pos] = String.fromCharCode(97 + ((chars[pos].charCodeAt(0) - 97 + 1 + Math.floor(rand() * 25)) % 26));
    else if (kind === 1) chars.splice(pos, 0, String.fromCharCode(97 + Math.floor(rand() * 26)));
    else if (chars.length > 1) chars.splice(pos, 1);
  }
  return chars.join("");
};
const substituteFirst = (s: string, k: number) =>
  s
    .split("")
    .map((c, i) => (i < k ? String.fromCharCode(97 + ((c.charCodeAt(0) - 97 + 1) % 26)) : c))
    .join("");

// The matching rules as they were before normalisation and the banded distance (same-title bucket).
function originalRule(a: string, b: string): boolean {
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const maxLen = Math.max(a.length, b.length);
  const minLen = Math.min(a.length, b.length);
  if ((maxLen - minLen) / maxLen > 0.15) return false;
  return 1 - levenshtein(a, b) / maxLen > 0.85;
}

describe("normaliseQuote", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normaliseQuote("  The   Quick\nBrown\tFox  ")).toBe("the quick brown fox");
  });

  it("unifies curly and straight quotes", () => {
    expect(normaliseQuote("It’s “fine” today")).toBe(normaliseQuote("It's \"fine\" today"));
    expect(normaliseQuote("It’s ‘fine’ today")).toBe(normaliseQuote("It's 'fine' today"));
  });

  it("unifies dashes", () => {
    const plain = normaliseQuote("a well-known idea");
    expect(normaliseQuote("a well–known idea")).toBe(plain);
    expect(normaliseQuote("a well—known idea")).toBe(plain);
  });

  it("strips surrounding punctuation but keeps inner punctuation", () => {
    expect(normaliseQuote("\"Hello, world.\"")).toBe("hello, world");
    expect(normaliseQuote("…and so on…")).toBe("and so on");
  });

  it("treats non-breaking spaces, zero-width characters and soft hyphens as invisible or plain", () => {
    expect(normaliseQuote(`a${String.fromCharCode(160)}b`)).toBe("a b");
    expect(normaliseQuote(`ab${String.fromCharCode(8203)}c`)).toBe("abc");
    expect(normaliseQuote(`ab${String.fromCharCode(173)}c`)).toBe("abc");
  });

  it("returns an empty string for punctuation-only text", () => {
    expect(normaliseQuote("—…!")).toBe("");
  });
});

describe("levenshteinWithin", () => {
  it("equals the original distance when within the limit and maxDist + 1 otherwise", () => {
    const rand = rng(12345);
    for (let n = 0; n < 400; n++) {
      const len = 5 + Math.floor(rand() * 120);
      const a = randomLetters(rand, len);
      const b = n % 4 === 0 ? randomLetters(rand, len + Math.floor(rand() * 6)) : mutate(rand, a, Math.floor(rand() * len * 0.3));
      const maxLen = Math.max(a.length, b.length);
      for (const maxDist of [0, 1, 2, 5, Math.ceil(0.15 * maxLen), maxLen]) {
        expect(levenshteinWithin(a, b, maxDist)).toBe(Math.min(levenshtein(a, b), maxDist + 1));
      }
    }
  });
});

describe("matchAgainstLibrary: same decisions as the original rules", () => {
  it("agrees with the original rule on random near-duplicates and unrelated text", () => {
    const rand = rng(777);
    let matches = 0;
    for (let n = 0; n < 400; n++) {
      const len = 8 + Math.floor(rand() * 150);
      const a = randomLetters(rand, len);
      const b = n % 5 === 0 ? randomLetters(rand, len) : mutate(rand, a, Math.floor(rand() * len * 0.3));
      const got = !!matchOf(draft(a), [lib("x", b)]);
      expect(got).toBe(originalRule(a, b));
      if (got) matches++;
    }
    expect(matches).toBeGreaterThan(50);
  });

  it("sits exactly on the 15% boundary: similarity of exactly 0.85 is not a match", () => {
    const rand = rng(99);
    for (const [len, matchK, noMatchK] of [
      [20, 2, 3],
      [40, 5, 6],
      [60, 8, 9],
      [100, 14, 15],
    ] as const) {
      const a = randomLetters(rand, len);
      expect(matchOf(draft(a), [lib("x", substituteFirst(a, matchK))])).toBeDefined();
      expect(matchOf(draft(a), [lib("x", substituteFirst(a, noMatchK))])).toBeUndefined();
    }
  });
});

describe("matchAgainstLibrary: behaviour", () => {
  const passage = "The garden needs patience and a steady hand every single morning of the year.";

  it("catches a duplicate whose book was renamed", () => {
    const m = matchOf(draft(passage, "Original Title"), [lib("L1", passage, "Renamed Title")]);
    expect(m?.highlight_id).toBe("L1");
    expect(m?.sameTitle).toBe(false);
    expect(m?.scope).toBe("library");
    expect(m?.book_title).toBe("Renamed Title");
  });

  it("reports sameTitle for a match under the same title, ignoring case", () => {
    expect(matchOf(draft(passage, "book a"), [lib("L1", passage, "Book A")])?.sameTitle).toBe(true);
  });

  it("matches a typed or dictated copy that differs in quotes, dashes and capitalisation", () => {
    const kindle = "“The garden needs patience—and a steady hand,” she said every single morning.";
    const typed = "the garden needs patience - and a steady hand, she said every single morning";
    expect(matchOf(draft(kindle, "Book A"), [lib("L1", typed, "Book A")])).toBeDefined();
  });

  it("does not match unrelated quotes", () => {
    expect(matchOf(draft(passage), [lib("L1", "Completely different words that share nothing with it at all today.")])).toBeUndefined();
  });

  it("prefers your own library over a shared copy, whatever the order", () => {
    const pool = [lib("S1", passage, "Book A", "shared"), lib("M1", passage, "Other Title", "library")];
    const m = matchOf(draft(passage, "Book A"), pool);
    expect(m?.highlight_id).toBe("M1");
    expect(m?.scope).toBe("library");
  });

  it("only matches drafts that are still pending", () => {
    expect(matchOf(draft(passage, "Book A", "near_duplicate"), [lib("L1", passage)])).toBeUndefined();
  });

  it("never matches on empty normalised text", () => {
    expect(matchOf(draft("—…!"), [lib("L1", "...")])).toBeUndefined();
  });

  it("any-title pass needs at least 25 characters of contained text; same-title does not", () => {
    const filler = " lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et";
    const long30 = "the quick brown fox jumps over";
    const short19 = "the quick brown fox";
    expect(matchOf(draft(long30), [lib("L1", long30 + filler, "Other Title")])).toBeDefined();
    expect(matchOf(draft(short19), [lib("L1", short19 + filler, "Other Title")])).toBeUndefined();
    expect(matchOf(draft(short19), [lib("L1", short19 + filler, "Book A")])).toBeDefined();
  });
});

describe("toMatchPool", () => {
  const rows: RawLibraryRow[] = [
    { id: "own-private", quote: "q1", user_id: "me", visibility: "private", book_title: "B" },
    { id: "own-public", quote: "q2", user_id: "me", visibility: "public", book_title: "B" },
    { id: "own-null", quote: "q3", user_id: "me", visibility: null, book_title: null },
    { id: "other-public", quote: "q4", user_id: "you", visibility: "public", book_title: "B" },
    { id: "other-private", quote: "q5", user_id: "you", visibility: "private", book_title: "B" },
    { id: "other-null", quote: "q6", user_id: "you", visibility: null, book_title: "B" },
    { id: "unowned-public", quote: "q7", user_id: null, visibility: "public", book_title: "B" },
    { id: "unowned-private", quote: "q8", user_id: null, visibility: "private", book_title: "B" },
    { id: "unowned-null", quote: "q9", user_id: null, visibility: null, book_title: "B" },
  ];

  it("keeps your rows in any visibility and other rows only when exactly public", () => {
    const pool = toMatchPool(rows, "me");
    expect(pool.map((p) => p.id)).toEqual(["own-private", "own-public", "own-null", "other-public", "unowned-public"]);
    expect(pool.map((p) => p.scope)).toEqual(["library", "library", "library", "shared", "shared"]);
    expect(pool[2].book_title).toBe("");
  });

  it("labels nothing as your library when there is no signed-in id", () => {
    const pool = toMatchPool(rows, "");
    expect(pool.map((p) => p.id)).toEqual(["own-public", "other-public", "unowned-public"]);
    expect(pool.every((p) => p.scope === "shared")).toBe(true);
  });

  it("another user's private row is never matched, even for identical text", () => {
    const text = "A sentence that only exists in someone else's private library, word for word.";
    const privateRows: RawLibraryRow[] = [{ id: "p1", quote: text, user_id: "you", visibility: "private", book_title: "Book A" }];
    expect(matchOf(draft(text, "Book A"), toMatchPool(privateRows, "me"))).toBeUndefined();
    const publicRows: RawLibraryRow[] = [{ id: "p2", quote: text, user_id: "you", visibility: "public", book_title: "Book A" }];
    expect(matchOf(draft(text, "Book A"), toMatchPool(publicRows, "me"))?.scope).toBe("shared");
  });
});

describe("defaultReviewStatus", () => {
  it("skips a shared match under the same title", () => {
    expect(defaultReviewStatus({ scope: "shared", sameTitle: true })).toBe("skipped");
  });
  it("keeps a shared match under a different title for a decision", () => {
    expect(defaultReviewStatus({ scope: "shared", sameTitle: false })).toBe("near_duplicate");
  });
  it("keeps a match in your own library for a decision, same title or not", () => {
    expect(defaultReviewStatus({ scope: "library", sameTitle: true })).toBe("near_duplicate");
    expect(defaultReviewStatus({ scope: "library", sameTitle: false })).toBe("near_duplicate");
  });
  it("applies to real matches", () => {
    const text = "A shared passage that appears word for word in another reader's public library.";
    const shared = [lib("S1", text, "Book A", "shared")];
    const same = matchOf(draft(text, "Book A"), shared);
    const other = matchOf(draft(text, "Different Book"), shared);
    expect(same && defaultReviewStatus(same)).toBe("skipped");
    expect(other && defaultReviewStatus(other)).toBe("near_duplicate");
  });
});

describe("loadMatchPool", () => {
  const row = (id: string, user_id: string | null, visibility: string | null): RawLibraryRow => ({
    id,
    quote: `placeholder passage ${id}`,
    user_id,
    visibility,
    book_title: "Book A",
  });
  const mine = (n: number) =>
    Array.from({ length: n }, (_, i) => row(`r${String(i + 1).padStart(2, "0")}`, "me", "private"));

  // A fake server: rows ordered by id, at most `cap` rows per page, only ids greater than the one asked for.
  function fakeServer(all: RawLibraryRow[], cap: number) {
    const sorted = [...all].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const calls: (string | null)[] = [];
    const fetchPage = async (afterId: string | null) => {
      calls.push(afterId);
      return { data: sorted.filter((r) => afterId === null || r.id > afterId).slice(0, cap), error: null };
    };
    return { fetchPage, calls };
  }

  it("keeps paging with the last id seen until a page comes back empty", async () => {
    const { fetchPage, calls } = fakeServer(mine(7), 3);
    const pool = await loadMatchPool(fetchPage, "me");
    expect(pool.map((p) => p.id)).toEqual(["r01", "r02", "r03", "r04", "r05", "r06", "r07"]);
    expect(calls).toEqual([null, "r03", "r06", "r07"]);
  });

  it("continues after a first page smaller than the nominal page size", async () => {
    const { fetchPage, calls } = fakeServer(mine(5), 2);
    const pool = await loadMatchPool(fetchPage, "me");
    expect(pool).toHaveLength(5);
    expect(calls).toHaveLength(4);
  });

  it("an error on page 2 throws and returns nothing", async () => {
    const calls: (string | null)[] = [];
    const fetchPage = async (afterId: string | null) => {
      calls.push(afterId);
      return calls.length === 2 ? { data: null, error: new Error("boom") } : { data: mine(3), error: null };
    };
    await expect(loadMatchPool(fetchPage, "me")).rejects.toThrow("boom");
    expect(calls).toHaveLength(2);
  });

  it("wraps a non-Error page error in a generic error", async () => {
    const fetchPage = async () => ({ data: null, error: { message: "x" } });
    await expect(loadMatchPool(fetchPage, "me")).rejects.toThrow("Library page failed to load");
  });

  it("never lets another user's non-public rows into the pool", async () => {
    const all = [
      row("a1", "me", "private"),
      row("a2", "me", null),
      row("b1", "you", "public"),
      row("b2", "you", "private"),
      row("b3", "you", null),
      row("c1", null, "private"),
      row("c2", null, null),
    ];
    const { fetchPage } = fakeServer(all, 2);
    const pool = await loadMatchPool(fetchPage, "me");
    expect(pool.map((p) => p.id)).toEqual(["a1", "a2", "b1"]);
    expect(pool.map((p) => p.scope)).toEqual(["library", "library", "shared"]);
  });

  it("an empty library gives an empty pool after one call", async () => {
    const { fetchPage, calls } = fakeServer([], 5);
    expect(await loadMatchPool(fetchPage, "me")).toEqual([]);
    expect(calls).toEqual([null]);
  });

  it("refuses to loop forever if paging does not advance", async () => {
    const fetchPage = async () => ({ data: mine(2), error: null });
    await expect(loadMatchPool(fetchPage, "me")).rejects.toThrow("did not advance");
  });
});

describe("matchAgainstLibrary: trigram pre-filter keeps every decision", () => {
  it("600 pairs, including the 15% threshold and strings too short for the filter, match the original rule", () => {
    const rand = rng(4242);
    let pairs = 0;
    let atThreshold = 0;
    let tooShortForFilter = 0;
    let matched = 0;
    const check = (a: string, b: string) => {
      const longest = Math.max(a.length, b.length);
      if (longest - 2 - 3 * Math.ceil(0.15 * longest) <= 0) tooShortForFilter++;
      if (Math.abs(levenshtein(a, b) - 0.15 * longest) < 1) atThreshold++;
      const got = !!matchOf(draft(a), [lib("x", b)]);
      expect(got).toBe(originalRule(a, b));
      pairs++;
      if (got) matched++;
    };

    // Pairs built to sit on the threshold: lengths that are multiples of 20, so 0.15 * length is a whole number.
    for (let len = 20; len <= 400; len += 20) {
      const a = randomLetters(rand, len);
      for (const delta of [-1, 0, 1]) check(a, substituteFirst(a, Math.round(0.15 * len) + delta));
    }
    // Short strings, where the filter's requirement is zero or negative and the filter is skipped.
    for (let n = 0; n < 150; n++) {
      const len = 3 + Math.floor(rand() * 7);
      const a = randomLetters(rand, len);
      check(a, n % 3 === 0 ? randomLetters(rand, len) : mutate(rand, a, Math.floor(rand() * 3)));
    }
    // Lengths 80 to 400 with edit counts straddling the threshold, and some unrelated pairs.
    for (let n = 0; n < 390; n++) {
      const len = 80 + Math.floor(rand() * 321);
      const a = randomLetters(rand, len);
      const edits = Math.max(0, Math.ceil(0.15 * len) + Math.floor(rand() * 9) - 4);
      check(a, n % 6 === 0 ? randomLetters(rand, len) : mutate(rand, a, edits));
    }

    expect(pairs).toBe(600);
    expect(atThreshold).toBeGreaterThan(40);
    expect(tooShortForFilter).toBeGreaterThan(40);
    expect(matched).toBeGreaterThan(100);
  });
});

describe("detectDuplicatesLevel1: banded distance and trigram filter keep every decision", () => {
  // The within-file step exactly as it was before the speedup: full edit distance, no pre-filter.
  function referenceLevel1(highlights: ParsedHighlight[]) {
    const exactMap = new Map<string, ParsedHighlight>();
    for (const h of highlights) {
      const key = JSON.stringify([h.book_title, h.quote]);
      const existing = exactMap.get(key);
      if (!existing || (h.kindle_timestamp?.getTime() ?? 0) > (existing.kindle_timestamp?.getTime() ?? 0)) exactMap.set(key, h);
    }
    const rows = Array.from(exactMap.values()).map((h, i) => ({
      id: i,
      quote: h.quote,
      title: h.book_title,
      status: "pending" as "pending" | "near_duplicate",
      winner: -1,
    }));
    const buckets = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.title.toLowerCase();
      buckets.set(key, [...(buckets.get(key) ?? []), r]);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => b.quote.length - a.quote.length);
      for (let i = 0; i < list.length; i++) {
        if (list[i].status !== "pending") continue;
        for (let j = i + 1; j < list.length; j++) {
          if (list[j].status !== "pending") continue;
          const a = list[i].quote;
          const b = list[j].quote;
          let flag = a.includes(b);
          if (!flag) {
            const maxLen = Math.max(a.length, b.length);
            const minLen = Math.min(a.length, b.length);
            if (maxLen !== 0 && (maxLen - minLen) / maxLen <= 0.15) flag = 1 - levenshtein(a, b) / maxLen > 0.85;
          }
          if (flag) {
            list[j].status = "near_duplicate";
            list[j].winner = list[i].id;
          }
        }
      }
    }
    return rows;
  }

  const highlightAt = (title: string, quote: string, seconds: number): ParsedHighlight =>
    entry({ entry_type: "Highlight", book_title: title, quote, kindle_location: "Location 1-2", kindle_timestamp: at(seconds) });

  function randomBook(rand: () => number, title: string): ParsedHighlight[] {
    const items: ParsedHighlight[] = [];
    const stamp = () => Math.floor(rand() * 100000);
    const bases = Array.from({ length: 3 + Math.floor(rand() * 3) }, () => randomLetters(rand, 20 + Math.floor(rand() * 280)));
    bases.push(randomLetters(rand, 3 + Math.floor(rand() * 7))); // short: the filter's requirement is zero or negative
    for (const base of bases) {
      const len = base.length;
      const onThreshold = Math.round(0.15 * len);
      items.push(highlightAt(title, base, stamp()));
      items.push(highlightAt(title, base, stamp())); // exact repeat, different time
      for (const edits of [onThreshold - 1, onThreshold, onThreshold + 1, 1, 2]) {
        items.push(highlightAt(title, mutate(rand, base, Math.max(0, edits)), stamp()));
      }
      items.push(highlightAt(title, base.slice(0, Math.max(1, Math.floor(len * (0.5 + rand() * 0.5)))), stamp())); // truncation
    }
    items.push(highlightAt(title, randomLetters(rand, 40 + Math.floor(rand() * 200)), stamp())); // unrelated
    return items;
  }

  it("matches the pre-speedup step row for row on random books", () => {
    const rand = rng(8675309);
    let flagged = 0;
    let atThreshold = 0;
    let shortPairs = 0;
    for (let round = 0; round < 3; round++) {
      const all: ParsedHighlight[] = [];
      for (let b = 0; b < 4; b++) all.push(...randomBook(rand, `Book ${b}`));
      all.sort(() => rand() - 0.5);

      const expected = referenceLevel1(all);
      const actual = detectDuplicatesLevel1(all).rows;
      expect(actual).toHaveLength(expected.length);
      const indexOf = new Map(actual.map((r, i) => [r.client_id, i]));
      expected.forEach((e, i) => {
        const a = actual[i];
        expect(a.quote).toBe(e.quote);
        expect(a.status).toBe(e.status);
        expect(a.duplicate_of_client_id ? indexOf.get(a.duplicate_of_client_id) : -1).toBe(e.winner);
        if (e.status === "near_duplicate") flagged++;
      });

      // guard counts: how many same-book pairs sit on the 15% threshold, and how many are tiny
      const byBook = new Map<string, string[]>();
      for (const e of expected) byBook.set(e.title, [...(byBook.get(e.title) ?? []), e.quote]);
      for (const quotes of byBook.values()) {
        for (let x = 0; x < quotes.length; x++) {
          for (let y = x + 1; y < quotes.length; y++) {
            const longest = Math.max(quotes[x].length, quotes[y].length);
            if (longest <= 8) shortPairs++;
            const d = levenshteinWithin(quotes[x], quotes[y], Math.ceil(0.15 * longest) + 1);
            if (Math.abs(d - 0.15 * longest) < 1) atThreshold++;
          }
        }
      }
    }
    expect(flagged).toBeGreaterThan(100);
    expect(atThreshold).toBeGreaterThan(40);
    expect(shortPairs).toBeGreaterThan(20);
  });
});

describe("planReviewChange", () => {
  const pair: ReviewVersion[] = [
    { id: "winner", role: "winner" },
    { id: "short", role: "loser" },
  ];
  const group = (losers: number): ReviewVersion[] => [
    { id: "winner", role: "winner" },
    ...Array.from({ length: losers }, (_, i) => ({ id: `short${i + 1}`, role: "loser" as const })),
  ];
  const statuses = (changes: { id: string; status: ReviewStatus }[]) => Object.fromEntries(changes.map((c) => [c.id, c.status]));
  const standalone: ReviewVersion[] = [{ id: "row", role: "loser" }];

  it("importing the shorter version skips the longer one", () => {
    expect(statuses(planReviewChange(pair, { kind: "import", id: "short" }))).toEqual({ short: "pending", winner: "skipped" });
  });

  it("importing the longer version skips the shorter one", () => {
    expect(statuses(planReviewChange(pair, { kind: "import", id: "winner" }))).toEqual({ short: "skipped", winner: "pending" });
  });

  it("skip both skips every version", () => {
    expect(statuses(planReviewChange(pair, { kind: "skipAll" }))).toEqual({ short: "skipped", winner: "skipped" });
  });

  it("reset returns the pair to its default: the longer staged to import, the shorter undecided", () => {
    expect(statuses(planReviewChange(pair, { kind: "reset" }))).toEqual({ short: "near_duplicate", winner: "pending" });
  });

  it.each([3, 4])("in a group of %i versions, importing any one skips all the others", (size) => {
    const versions = group(size - 1);
    for (const chosen of versions) {
      const result = statuses(planReviewChange(versions, { kind: "import", id: chosen.id }));
      expect(Object.values(result).filter((s) => s === "pending")).toHaveLength(1);
      expect(result[chosen.id]).toBe("pending");
      expect(Object.values(result).filter((s) => s === "skipped")).toHaveLength(size - 1);
    }
  });

  it("every plan covers every version exactly once", () => {
    const versions = group(3);
    for (const action of [{ kind: "import", id: "short2" }, { kind: "skipAll" }, { kind: "reset" }] as ReviewAction[]) {
      expect(planReviewChange(versions, action).map((c) => c.id)).toEqual(versions.map((v) => v.id));
    }
  });

  it("a standalone library row: import adds it, skip drops it, reset makes it undecided", () => {
    expect(statuses(planReviewChange(standalone, { kind: "import", id: "row" }))).toEqual({ row: "pending" });
    expect(statuses(planReviewChange(standalone, { kind: "skipAll" }))).toEqual({ row: "skipped" });
    expect(statuses(planReviewChange(standalone, { kind: "reset" }))).toEqual({ row: "near_duplicate" });
  });

  it("property: at most one version in a group is ever pending, and reset always restores the default", () => {
    const rand = rng(5150);
    for (let round = 0; round < 300; round++) {
      const versions = group(1 + Math.floor(rand() * 3));
      const current: Record<string, ReviewStatus> = Object.fromEntries(
        versions.map((v) => [v.id, v.role === "winner" ? "pending" : "near_duplicate"])
      );
      const steps = 1 + Math.floor(rand() * 12);
      for (let step = 0; step < steps; step++) {
        const roll = rand();
        const action: ReviewAction =
          roll < 0.6
            ? { kind: "import", id: versions[Math.floor(rand() * versions.length)].id }
            : roll < 0.8
              ? { kind: "skipAll" }
              : { kind: "reset" };
        for (const c of planReviewChange(versions, action)) current[c.id] = c.status;
        expect(Object.values(current).filter((s) => s === "pending").length).toBeLessThanOrEqual(1);
        if (action.kind === "reset") {
          expect(current.winner).toBe("pending");
          for (const v of versions.filter((x) => x.role === "loser")) expect(current[v.id]).toBe("near_duplicate");
        }
      }
    }
  });
});

describe("findRenamePairs", () => {
  type Scope = "library" | "shared" | "import";
  const lookup = (entries: Record<string, [Scope, string]>) =>
    Object.fromEntries(Object.entries(entries).map(([id, [scope, book_title]]) => [id, { scope, book_title }]));
  const row = (id: string, book: string, ref: string | null, status = "near_duplicate"): RenameCheckRow => ({
    id,
    book_title: book,
    status,
    duplicate_of: ref,
  });
  const three = (book = "Old Name") => [row("1", book, "a"), row("2", book, "b"), row("3", book, "c")];
  const toNew = (scope: Scope = "library", title = "New Name") =>
    lookup({ a: [scope, title], b: [scope, title], c: [scope, title] });

  it("two matches give no pair", () => {
    expect(findRenamePairs([row("1", "Old Name", "a"), row("2", "Old Name", "b")], toNew())).toEqual([]);
  });

  it("three matches give a pair", () => {
    expect(findRenamePairs(three(), toNew())).toEqual([
      { fileTitle: "Old Name", libraryTitle: "New Name", rowIds: ["1", "2", "3"] },
    ]);
  });

  it("shared and import-scope matches are ignored", () => {
    expect(findRenamePairs(three(), toNew("shared"))).toEqual([]);
    expect(findRenamePairs(three(), toNew("import"))).toEqual([]);
  });

  it("one file book matching two library books gives two separate pairs", () => {
    const rows = ["a", "b", "c", "d", "e", "f"].map((ref, i) => row(String(i), "Old Name", ref));
    const table = lookup({
      a: ["library", "First Book"], b: ["library", "First Book"], c: ["library", "First Book"],
      d: ["library", "Second Book"], e: ["library", "Second Book"], f: ["library", "Second Book"],
    });
    expect(findRenamePairs(rows, table).map((p) => [p.libraryTitle, p.rowIds.length])).toEqual([
      ["First Book", 3],
      ["Second Book", 3],
    ]);
  });

  it("a case-only title difference is not a pair", () => {
    const table = lookup({ a: ["library", "OLD NAME"], b: ["library", "old name"], c: ["library", "Old name"] });
    expect(findRenamePairs(three(), table)).toEqual([]);
  });

  it("50% rule: 3 matches in a book with many flagged rows give no pair", () => {
    const others = (n: number) => Array.from({ length: n }, (_, i) => row(`o${i}`, "Old Name", "elsewhere"));
    expect(findRenamePairs([...three(), ...others(4)], toNew())).toEqual([]); // 3 of 7
    expect(findRenamePairs([...three(), ...others(3)], toNew()).length).toBe(1); // 3 of 6 is exactly half
  });

  it("the share is per file book, and decided rows still count in the denominator", () => {
    const decided = Array.from({ length: 4 }, (_, i) => row(`d${i}`, "Old Name", "elsewhere", "skipped"));
    expect(findRenamePairs([...three(), ...decided], toNew())).toEqual([]);
    const otherBook = Array.from({ length: 10 }, (_, i) => row(`x${i}`, "Another Book", "elsewhere"));
    expect(findRenamePairs([...three(), ...otherBook], toNew()).length).toBe(1);
  });

  it("a pair whose rows are already decided disappears", () => {
    const decided = three().map((r) => ({ ...r, status: "skipped" }));
    expect(findRenamePairs(decided, toNew())).toEqual([]);
  });

  it("ignores rows with no usable match reference or an empty library title", () => {
    const rows = [row("1", "Old Name", null), row("2", "Old Name", "missing"), row("3", "Old Name", "blank")];
    expect(findRenamePairs(rows, lookup({ blank: ["library", ""] }))).toEqual([]);
  });

  it("sorts bigger pairs first", () => {
    const rows = [
      row("s1", "Small Book", "a"), row("s2", "Small Book", "b"), row("s3", "Small Book", "c"),
      row("b1", "Big Book", "d"), row("b2", "Big Book", "e"), row("b3", "Big Book", "f"), row("b4", "Big Book", "g"),
    ];
    const table = lookup({
      a: ["library", "X"], b: ["library", "X"], c: ["library", "X"],
      d: ["library", "Y"], e: ["library", "Y"], f: ["library", "Y"], g: ["library", "Y"],
    });
    expect(findRenamePairs(rows, table).map((p) => p.fileTitle)).toEqual(["Big Book", "Small Book"]);
  });
});

describe("planRenameSkip", () => {
  it("skips the pair rows plus every shorter version flagged against a longest version", () => {
    const rows = [
      { id: "w1", status: "near_duplicate", duplicate_of: "lib-a" }, // longest version, matches the library
      { id: "l1", status: "near_duplicate", duplicate_of: "w1" },
      { id: "l2", status: "near_duplicate", duplicate_of: "w1" },
      { id: "p2", status: "near_duplicate", duplicate_of: "lib-b" }, // standalone pair row
      { id: "other", status: "pending", duplicate_of: null },
      { id: "elsewhere", status: "near_duplicate", duplicate_of: "w9" },
    ];
    expect(planRenameSkip(["w1", "p2"], rows).sort()).toEqual(["l1", "l2", "p2", "w1"]);
  });

  it("leaves rows that are already skipped out of the update", () => {
    const rows = [
      { id: "w1", status: "near_duplicate", duplicate_of: "lib-a" },
      { id: "l1", status: "skipped", duplicate_of: "w1" },
    ];
    expect(planRenameSkip(["w1"], rows)).toEqual(["w1"]);
  });
});

describe("exact own-library duplicates are skipped by default", () => {
  const passage = "The quick brown fox jumps over the lazy dog near the riverbank today";
  const mk = (quote: string, title: string) => ({
    ...draft(quote, title),
  });

  it("flags an identical copy under the same title as exact and skips it by default", () => {
    const m = matchOf(mk(passage, "Book A"), [lib("L1", passage, "Book A")]);
    expect(m).toMatchObject({ scope: "library", sameTitle: true, exact: true });
    expect(m && defaultReviewStatus(m)).toBe("skipped");
  });

  it("counts differences in case, spacing and quote style as identical", () => {
    const messy = `  “The  QUICK brown fox jumps over the lazy dog near the riverbank today” `;
    const m = matchOf(mk(messy, "book a"), [lib("L1", passage, "Book A")]);
    expect(m?.exact).toBe(true);
    expect(m && defaultReviewStatus(m)).toBe("skipped");
  });

  it("an identical copy under a different title still needs a decision", () => {
    const m = matchOf(mk(passage, "Book B"), [lib("L1", passage, "Book A")]);
    expect(m).toMatchObject({ sameTitle: false, exact: true });
    expect(m && defaultReviewStatus(m)).toBe("near_duplicate");
  });

  it("a merely similar copy under the same title still needs a decision", () => {
    const similar = passage + " and then some more words";
    const m = matchOf(mk(similar, "Book A"), [lib("L1", passage, "Book A")]);
    expect(m).toMatchObject({ sameTitle: true, exact: false });
    expect(m && defaultReviewStatus(m)).toBe("near_duplicate");
  });

  it("prefers the identical copy when a similar one is listed first", () => {
    const similar = passage + " and";
    const m = matchOf(mk(passage, "Book A"), [lib("L1", similar, "Book A"), lib("L2", passage, "Book A")]);
    expect(m?.highlight_id).toBe("L2");
    expect(m?.exact).toBe(true);
  });

  it("defaultReviewStatus: only exact, same-title, own-library matches are newly skipped", () => {
    expect(defaultReviewStatus({ scope: "library", sameTitle: true, exact: true })).toBe("skipped");
    expect(defaultReviewStatus({ scope: "library", sameTitle: true, exact: false })).toBe("near_duplicate");
    expect(defaultReviewStatus({ scope: "library", sameTitle: false, exact: true })).toBe("near_duplicate");
    expect(defaultReviewStatus({ scope: "shared", sameTitle: true, exact: false })).toBe("skipped");
    expect(defaultReviewStatus({ scope: "shared", sameTitle: false, exact: true })).toBe("near_duplicate");
  });
});

describe("truncated saves", () => {
  const full = "Lanterns are the slow ledger of evening harbours and they reward attention across seasons";
  const draftOf = (client_id: string, quote: string, over: Partial<StagingRowDraft> = {}): StagingRowDraft => ({
    ...draft(quote, "Book A"),
    client_id,
    ...over,
  });

  it("isTruncatedSave: the longer text starts with all of the shorter text", () => {
    expect(isTruncatedSave("Lanterns are the slow ledger", full)).toBe(true);
    expect(isTruncatedSave("lanterns are the slow ledger of evening harbours,", full)).toBe(true); // punctuation and case
    expect(isTruncatedSave("Lanterns are the slow led", full)).toBe(true); // cut mid-word
    expect(isTruncatedSave(full, full)).toBe(true);
  });

  it("isTruncatedSave: text in the middle or at the end does not count", () => {
    expect(isTruncatedSave("slow ledger of evening harbours", full)).toBe(false); // middle
    expect(isTruncatedSave("and they reward attention across seasons", full)).toBe(false); // end
    expect(isTruncatedSave("Real sentence goes here and continues", "it. Real sentence goes here and continues")).toBe(false); // junk prefix
    expect(isTruncatedSave("", full)).toBe(false);
    expect(isTruncatedSave(full + " and more", full)).toBe(false); // longer-than-longer
  });

  it("autoResolveTruncated skips a prefix loser and leaves the winner alone", () => {
    const winner = draftOf("w", full, { status: "pending" });
    const loser = draftOf("l", "Lanterns are the slow ledger", { status: "near_duplicate", duplicate_of_client_id: "w" });
    const resolved = autoResolveTruncated([winner, loser]);
    expect(resolved).toEqual([loser]);
    expect(loser.status).toBe("skipped");
    expect(winner.status).toBe("pending");
  });

  it("autoResolveTruncated leaves end and middle losers for review", () => {
    const winner = draftOf("w", full, { status: "pending" });
    const end = draftOf("e", "and they reward attention across seasons", { status: "near_duplicate", duplicate_of_client_id: "w" });
    const middle = draftOf("m", "slow ledger of evening harbours", { status: "near_duplicate", duplicate_of_client_id: "w" });
    const prefix = draftOf("p", "Lanterns are the slow ledger", { status: "near_duplicate", duplicate_of_client_id: "w" });
    expect(autoResolveTruncated([winner, end, middle, prefix]).map((d) => d.client_id)).toEqual(["p"]);
    expect([end.status, middle.status, prefix.status]).toEqual(["near_duplicate", "near_duplicate", "skipped"]);
  });

  it("autoResolveTruncated ignores drafts that are not flagged losers", () => {
    const a = draftOf("a", "Lanterns are the slow ledger", { status: "pending" });
    const b = draftOf("b", full, { status: "pending" });
    const orphan = draftOf("o", "Lanterns are", { status: "near_duplicate", duplicate_of_client_id: "missing" });
    expect(autoResolveTruncated([a, b, orphan])).toEqual([]);
  });

  it("through detectDuplicatesLevel1: a real truncated save is resolved, a junk-prefixed one is not", () => {
    const rows = [
      highlight(full, 0),
      highlight("Lanterns are the slow ledger of evening harbours", 10),
      highlight("it. " + full, 20),
    ];
    const detected = detectDuplicatesLevel1(attachNotesAndFilter(rows));
    const resolved = autoResolveTruncated(detected.rows);
    // every resolved row is a prefix of its winner, and no row is skipped without being one
    const byClient = new Map(detected.rows.map((r) => [r.client_id, r]));
    for (const r of resolved) expect(isTruncatedSave(r.quote, byClient.get(r.duplicate_of_client_id!)!.quote)).toBe(true);
    for (const r of detected.rows.filter((x) => x.status === "near_duplicate")) {
      expect(isTruncatedSave(r.quote, byClient.get(r.duplicate_of_client_id!)!.quote)).toBe(false);
    }
  });
});

describe("reviewVersionViews", () => {
  it("a pair with the longer version staged to import and the shorter one waiting shows both as undecided", () => {
    expect(reviewVersionViews([{ id: "long", status: "pending" }, { id: "short", status: "near_duplicate" }])).toEqual({
      long: "undecided",
      short: "undecided",
    });
  });

  it("a pair where both are waiting shows both as undecided (same as the one above)", () => {
    expect(reviewVersionViews([{ id: "long", status: "near_duplicate" }, { id: "short", status: "near_duplicate" }])).toEqual({
      long: "undecided",
      short: "undecided",
    });
  });

  it("once decided, the statuses are shown as they are", () => {
    expect(reviewVersionViews([{ id: "long", status: "pending" }, { id: "short", status: "skipped" }])).toEqual({ long: "import", short: "skip" });
    expect(reviewVersionViews([{ id: "long", status: "skipped" }, { id: "short", status: "pending" }])).toEqual({ long: "skip", short: "import" });
    expect(reviewVersionViews([{ id: "long", status: "skipped" }, { id: "short", status: "skipped" }])).toEqual({ long: "skip", short: "skip" });
  });

  it("in a group with one version still waiting, skipped versions stay skipped and the rest are undecided", () => {
    const views = reviewVersionViews([
      { id: "a", status: "pending" },
      { id: "b", status: "skipped" },
      { id: "c", status: "near_duplicate" },
    ]);
    expect(views).toEqual({ a: "undecided", b: "skip", c: "undecided" });
  });

  it("a single row: waiting, importing, skipped", () => {
    expect(reviewVersionViews([{ id: "x", status: "near_duplicate" }]).x).toBe("undecided");
    expect(reviewVersionViews([{ id: "x", status: "pending" }]).x).toBe("import");
    expect(reviewVersionViews([{ id: "x", status: "skipped" }]).x).toBe("skip");
  });

  it("property: every state reached through planReviewChange is drawn consistently", () => {
    const rand = rng(8675);
    const group = (losers: number): ReviewVersion[] => [
      { id: "winner", role: "winner" },
      ...Array.from({ length: losers }, (_, i) => ({ id: `short${i + 1}`, role: "loser" as const })),
    ];
    for (let round = 0; round < 300; round++) {
      const versions = group(1 + Math.floor(rand() * 3));
      const current: Record<string, ReviewStatus> = Object.fromEntries(
        versions.map((v) => [v.id, v.role === "winner" ? "pending" : "near_duplicate"])
      );
      for (let step = 0; step < 6; step++) {
        const roll = rand();
        const action: ReviewAction =
          roll < 0.5
            ? { kind: "import", id: versions[Math.floor(rand() * versions.length)].id }
            : roll < 0.75
              ? { kind: "skipAll" }
              : { kind: "reset" };
        for (const c of planReviewChange(versions, action)) current[c.id] = c.status;
        const views = reviewVersionViews(versions.map((v) => ({ id: v.id, status: current[v.id] })));
        const anyWaiting = Object.values(current).includes("near_duplicate");
        // a version is only drawn as "import" when nothing in the group is waiting, and at most one is
        if (anyWaiting) expect(Object.values(views)).not.toContain("import");
        expect(Object.values(views).filter((x) => x === "import").length).toBeLessThanOrEqual(1);
        for (const v of versions) if (current[v.id] === "skipped") expect(views[v.id]).toBe("skip");
      }
    }
  });
});

describe("splitReviewCards", () => {
  const card = (key: string, ...statuses: string[]) => ({
    key,
    members: statuses.map((status, i) => ({ id: `${key}-${i}`, status })),
  });
  const keys = (cards: { key: string }[]) => cards.map((c) => c.key);

  it("an open pair (longer staged to import, shorter waiting) needs a decision", () => {
    expect(keys(splitReviewCards([card("a", "pending", "near_duplicate")]).needsDecision)).toEqual(["a"]);
  });

  it("a pair with the longer version staged and the shorter auto-skipped is decided", () => {
    const split = splitReviewCards([card("a", "pending", "skipped")]);
    expect(keys(split.decided)).toEqual(["a"]);
    expect(split.needsDecision).toEqual([]);
  });

  it("a skipped library card is decided, a waiting one is not, and an imported-as-copy one is decided", () => {
    const split = splitReviewCards([card("skipped", "skipped"), card("waiting", "near_duplicate"), card("copy", "pending")]);
    expect(keys(split.decided)).toEqual(["skipped", "copy"]);
    expect(keys(split.needsDecision)).toEqual(["waiting"]);
  });

  it("a group of 3 with one version still waiting needs a decision", () => {
    expect(keys(splitReviewCards([card("g", "pending", "skipped", "near_duplicate")]).needsDecision)).toEqual(["g"]);
  });

  it("an undone card goes back to needing a decision", () => {
    const before = card("a", "skipped", "pending");
    expect(keys(splitReviewCards([before]).decided)).toEqual(["a"]);
    const after = card("a", "pending", "near_duplicate"); // reset: longer pending, shorter waiting
    expect(keys(splitReviewCards([after]).needsDecision)).toEqual(["a"]);
  });

  it("keeps the original order in both lists", () => {
    const split = splitReviewCards([
      card("1", "near_duplicate"), card("2", "skipped"), card("3", "near_duplicate"), card("4", "pending"), card("5", "skipped"),
    ]);
    expect(keys(split.needsDecision)).toEqual(["1", "3"]);
    expect(keys(split.decided)).toEqual(["2", "4", "5"]);
  });
});

describe("booksNeedingAttention", () => {
  const row = (id: string, book_title: string, author: string | null, status: string) => ({ id, book_title, author, status });
  const none = new Set<string>();

  it("a book whose rows are all skipped is absent", () => {
    expect(booksNeedingAttention([row("1", "Book A", null, "skipped"), row("2", "Book A", null, "skipped")], none)).toEqual([]);
  });

  it("a book whose only staged row sits in an undecided card is absent", () => {
    expect(booksNeedingAttention([row("1", "Book A", null, "pending")], new Set(["1"]))).toEqual([]);
  });

  it("a book with a decided row to import and no author is present", () => {
    expect(booksNeedingAttention([row("1", "Book A", null, "pending"), row("2", "Book A", null, "skipped")], none)).toEqual(["Book A"]);
    expect(booksNeedingAttention([row("1", "Book A", "   ", "pending")], none)).toEqual(["Book A"]);
  });

  it("a garbled title is present even when it has an author, and a clean titled book with an author is not", () => {
    expect(booksNeedingAttention([row("1", "some_garbled_title", "Author A", "pending"), row("2", "Book B", "Author B", "pending")], none)).toEqual([
      "some_garbled_title",
    ]);
  });

  it("is sorted and unique", () => {
    const rows = [row("1", "Book B", null, "pending"), row("2", "Book A", null, "pending"), row("3", "Book B", null, "pending")];
    expect(booksNeedingAttention(rows, none)).toEqual(["Book A", "Book B"]);
  });

  it("re-evaluates as decisions are made", () => {
    const waiting = { members: [{ id: "1", status: "pending" }, { id: "2", status: "near_duplicate" }] };
    const rows = [row("1", "Book A", null, "pending"), row("2", "Book A", null, "near_duplicate")];
    expect(booksNeedingAttention(rows, undecidedPendingIds([waiting]))).toEqual([]); // still undecided: not listed
    const imported = { members: [{ id: "1", status: "pending" }, { id: "2", status: "skipped" }] };
    const rowsAfterImport = [row("1", "Book A", null, "pending"), row("2", "Book A", null, "skipped")];
    expect(booksNeedingAttention(rowsAfterImport, undecidedPendingIds([imported]))).toEqual(["Book A"]); // now it will import
    const skippedAll = { members: [{ id: "1", status: "skipped" }, { id: "2", status: "skipped" }] };
    const rowsAfterSkip = [row("1", "Book A", null, "skipped"), row("2", "Book A", null, "skipped")];
    expect(booksNeedingAttention(rowsAfterSkip, undecidedPendingIds([skippedAll]))).toEqual([]); // skipped everything: gone
  });
});

describe("undecidedPendingIds", () => {
  it("lists only staged rows in cards that still wait, not decided ones", () => {
    const ids = undecidedPendingIds([
      { members: [{ id: "w1", status: "pending" }, { id: "l1", status: "near_duplicate" }] },
      { members: [{ id: "w2", status: "pending" }, { id: "l2", status: "skipped" }] },
      { members: [{ id: "x", status: "near_duplicate" }] },
    ]);
    expect([...ids]).toEqual(["w1"]);
  });
});

describe("importBlockReason", () => {
  const base = { cardsLeft: 0, rowsLeft: 0, booksNeedingAttention: 0, pendingCount: 5 };

  it("names cards first, with singular and plural", () => {
    expect(importBlockReason({ ...base, cardsLeft: 18, rowsLeft: 20, booksNeedingAttention: 2 })).toBe("18 cards still need a decision");
    expect(importBlockReason({ ...base, cardsLeft: 1 })).toBe("1 card still needs a decision");
  });

  it("falls back to rows, then books, then nothing to import", () => {
    expect(importBlockReason({ ...base, rowsLeft: 2 })).toBe("2 highlights still need a decision");
    expect(importBlockReason({ ...base, rowsLeft: 1 })).toBe("1 highlight still needs a decision");
    expect(importBlockReason({ ...base, booksNeedingAttention: 2 })).toBe("2 books need author info");
    expect(importBlockReason({ ...base, booksNeedingAttention: 1 })).toBe("1 book needs author info");
    expect(importBlockReason({ ...base, pendingCount: 0 })).toBe("Nothing is set to import");
  });

  it("is null when nothing blocks the import", () => {
    expect(importBlockReason(base)).toBeNull();
  });
});
