import { describe, expect, it } from "vitest";
import {
  buildNewBookItems,
  countUndecided,
  findBookByTitle,
  resolveTitle,
  suggestExistingBook,
  titleKey,
  unresolvedBooks,
  type AliasRef,
  type BookRef,
} from "./bookAliases";

const book = (id: string, title: string, author: string | null = null): BookRef => ({ id, title, author });
const alias = (book_id: string, alias_title: string): AliasRef => ({ book_id, alias_title });

const books = [
  book("b1", "The 7 Habits of Highly Effective People", "Stephen R. Covey"),
  book("b2", "Atomic Habits", "James Clear"),
  book("b3", "Atomic Habits", "Someone Else"),
  book("b4", "Thinking, Fast and Slow", "Daniel Kahneman"),
];
const aliases = [alias("b2", "Tiny Changes, Remarkable Results")];

describe("titleKey", () => {
  it("is lower-case and trimmed, like the database index", () => {
    expect(titleKey("  Atomic Habits ")).toBe("atomic habits");
  });
});

describe("resolveTitle", () => {
  it("finds a book with the same title, ignoring case and spaces", () => {
    expect(resolveTitle(" thinking, fast and slow ", null, books, aliases)).toEqual({ bookId: "b4", via: "title" });
  });

  it("prefers the book with the matching author when several share a title", () => {
    expect(resolveTitle("Atomic Habits", "Someone Else", books, aliases)).toEqual({ bookId: "b3", via: "title" });
    expect(resolveTitle("Atomic Habits", "Nobody", books, aliases)).toEqual({ bookId: "b2", via: "title" });
  });

  it("falls back to an alias", () => {
    expect(resolveTitle("tiny changes, remarkable results", null, books, aliases)).toEqual({ bookId: "b2", via: "alias" });
  });

  it("a real book title wins over an alias with the same title", () => {
    const tricky = [alias("b4", "Atomic Habits")];
    expect(resolveTitle("Atomic Habits", null, books, tricky)).toEqual({ bookId: "b2", via: "title" });
  });

  it("returns null when nothing matches", () => {
    expect(resolveTitle("Something New", null, books, aliases)).toBeNull();
    expect(resolveTitle("   ", null, books, aliases)).toBeNull();
  });
});

describe("suggestExistingBook", () => {
  it("matches the same title after normalising (article, subtitle, number words)", () => {
    expect(suggestExistingBook("Seven Habits of Highly Effective People: Powerful Lessons", "Covey, Stephen", books)?.id).toBe("b1");
  });

  it("matches a whole-word prefix when the author surname is the same", () => {
    const lib = [book("x", "The Demon-Haunted World", "Carl Sagan")];
    expect(suggestExistingBook("The Demon Haunted World: Science as a Candle in the Dark", "Sagan, Carl", lib)?.id).toBe("x");
  });

  it("needs the same surname for a prefix match", () => {
    const lib = [book("x", "The Demon-Haunted World", "Carl Sagan")];
    expect(suggestExistingBook("The Demon Haunted World and more words", "Someone Else", lib)).toBeNull();
    expect(suggestExistingBook("The Demon Haunted World and more words", null, lib)).toBeNull();
  });

  it("does not match short prefixes or unrelated titles", () => {
    const lib = [book("x", "Dune", "Frank Herbert")];
    expect(suggestExistingBook("Dune Messiah", "Frank Herbert", lib)).toBeNull();
    expect(suggestExistingBook("A Totally Different Book", "Frank Herbert", books)).toBeNull();
  });

  it("prefers an equal title with the same author over an equal title alone", () => {
    expect(suggestExistingBook("atomic habits!", "James Clear", books)?.id).toBe("b2");
  });
});

describe("unresolvedBooks / buildNewBookItems / countUndecided", () => {
  const rows = [
    { title: "Atomic Habits", author: "James Clear" }, // book
    { title: "Tiny Changes, Remarkable Results", author: null }, // alias
    { title: "Seven Habits of Highly Effective People", author: "Covey, Stephen" }, // suggestion
    { title: "seven habits of highly effective people", author: null }, // same title again
    { title: "Brand New Book", author: "A. Writer" }, // nothing
  ];

  it("lists each unresolved title once", () => {
    expect(unresolvedBooks(rows, books, aliases).map((b) => b.title)).toEqual([
      "Seven Habits of Highly Effective People",
      "Brand New Book",
    ]);
  });

  it("attaches a suggestion where there is one", () => {
    const items = buildNewBookItems(unresolvedBooks(rows, books, aliases), books);
    expect(items.map((i) => i.suggestion?.id ?? null)).toEqual(["b1", null]);
  });

  it("counts only suggested titles that still need an answer", () => {
    const items = buildNewBookItems(unresolvedBooks(rows, books, aliases), books);
    expect(countUndecided(items, {})).toBe(1);
    expect(countUndecided(items, { [items[0].key]: { kind: "new" } })).toBe(0);
    expect(countUndecided(items, { [items[0].key]: { kind: "existing", bookId: "b1" } })).toBe(0);
  });
});

describe("findBookByTitle", () => {
  it("finds a book by title ignoring case", () => {
    expect(findBookByTitle(books, "ATOMIC HABITS")?.id).toBe("b2");
    expect(findBookByTitle(books, "Nope")).toBeNull();
  });
});
