import { describe, expect, it } from "vitest";
import { authorSurname, findDuplicateGroups, normaliseTitle } from "./findDuplicateBooks";

const book = (id: string, title: string, author: string) => ({ id, title, author });

const ids = (groups: ReturnType<typeof findDuplicateGroups>) =>
  groups.map((g) => g.rows.map((r) => r.id).sort());

describe("normaliseTitle", () => {
  it("drops subtitles, leading articles and punctuation", () => {
    expect(normaliseTitle("The Demon-Haunted World: Science as a Candle in the Dark")).toBe("demon haunted world");
    expect(normaliseTitle("A Brief History of Time (Updated)")).toBe("brief history of time");
    expect(normaliseTitle("Zen - and the Art")).toBe("zen");
  });

  it("converts number words and ampersands", () => {
    expect(normaliseTitle("The Seven Habits of Highly Effective People")).toBe("7 habits of highly effective people");
    expect(normaliseTitle("Pride & Prejudice")).toBe("pride and prejudice");
  });

  it("strips accents but keeps non-Latin scripts", () => {
    expect(normaliseTitle("Café Society")).toBe("cafe society");
    expect(normaliseTitle("गोदान: एक उपन्यास")).toBe(normaliseTitle("गोदान"));
    expect(normaliseTitle("गोदान")).not.toBe("");
  });
});

describe("authorSurname", () => {
  it("handles 'First Last' and 'Last, First'", () => {
    expect(authorSurname("Stephen R. Covey")).toBe("covey");
    expect(authorSurname("Covey, Stephen")).toBe("covey");
    expect(authorSurname("")).toBe("");
  });

  it("keeps Devanagari intact", () => {
    expect(authorSurname("प्रेमचंद")).toBe("प्रेमचंद");
  });
});

describe("findDuplicateGroups", () => {
  it("groups Covey's 7 Habits across title and author formats", () => {
    const groups = findDuplicateGroups([
      book("a", "The 7 Habits of Highly Effective People", "Stephen R. Covey"),
      book("b", "7 Habits of Highly Effective People: Powerful Lessons in Personal Change", "Covey, Stephen"),
    ]);
    expect(ids(groups)).toEqual([["a", "b"]]);
  });

  it("treats 'Seven' and '7' as the same", () => {
    const groups = findDuplicateGroups([
      book("a", "The Seven Habits of Highly Effective People", "Stephen R. Covey"),
      book("b", "7 Habits of Highly Effective People", "Stephen R. Covey"),
    ]);
    expect(ids(groups)).toEqual([["a", "b"]]);
  });

  it("groups Sagan's Demon-Haunted World despite subtitle and hyphen", () => {
    const groups = findDuplicateGroups([
      book("a", "The Demon-Haunted World: Science as a Candle in the Dark", "Carl Sagan"),
      book("b", "The Demon Haunted World", "Carl Sagan"),
    ]);
    expect(ids(groups)).toEqual([["a", "b"]]);
  });

  it("does not group Thinking, Fast and Slow with Thinking in Bets", () => {
    const groups = findDuplicateGroups([
      book("a", "Thinking, Fast and Slow", "Daniel Kahneman"),
      book("b", "Thinking in Bets", "Annie Duke"),
    ]);
    expect(groups).toEqual([]);
  });

  it("does not group unrelated books by the same author", () => {
    const groups = findDuplicateGroups([
      book("a", "Cosmos", "Carl Sagan"),
      book("b", "Pale Blue Dot", "Carl Sagan"),
    ]);
    expect(groups).toEqual([]);
  });

  it("requires a whole-word prefix and a long enough shorter title", () => {
    expect(
      findDuplicateGroups([
        book("a", "Habit", "Some Author"),
        book("b", "Habits of Mind", "Some Author"),
      ]),
    ).toEqual([]);
    expect(
      findDuplicateGroups([
        book("a", "Dune", "Frank Herbert"),
        book("b", "Dune Messiah", "Frank Herbert"),
      ]),
    ).toEqual([]);
  });

  it("groups two copies of the same Devanagari title", () => {
    const groups = findDuplicateGroups([
      book("a", "गोदान", "प्रेमचंद"),
      book("b", "गोदान: एक उपन्यास", "प्रेमचंद"),
    ]);
    expect(ids(groups)).toEqual([["a", "b"]]);
  });

  it("uses the smallest id as the group key", () => {
    const groups = findDuplicateGroups([
      book("m", "The Demon Haunted World", "Carl Sagan"),
      book("c", "Demon-Haunted World", "Carl Sagan"),
    ]);
    expect(groups[0].key).toBe("c");
  });
});
