import { describe, it, expect } from "vitest";
import {
  authorSurname,
  findIsbnCandidates,
  normalizeIsbn,
  normalizeTitle,
  scoreMatch,
  titleMatchKind,
  type FetchLike,
} from "@/lib/findIsbns";

// Placeholder book data only.
const ISBN13_A = "9780306406157"; // ISBN-10 form: 0306406152
const ISBN13_B = "9780804429573"; // ISBN-10 form: 080442957X
const ISBN13_C = "9780747532699"; // ISBN-10 form: 0747532699
const ISBN13_D = "9781861972712";

describe("normalizeIsbn", () => {
  it("accepts a valid ISBN-13 and strips hyphens and spaces", () => {
    expect(normalizeIsbn(ISBN13_A)).toBe(ISBN13_A);
    expect(normalizeIsbn("978-0-306-40615-7")).toBe(ISBN13_A);
    expect(normalizeIsbn(" 978 0306 406157 ")).toBe(ISBN13_A);
    expect(normalizeIsbn("ISBN 978-0-306-40615-7")).toBe(ISBN13_A);
  });

  it("converts a valid ISBN-10 to ISBN-13, including a check digit of X", () => {
    expect(normalizeIsbn("0306406152")).toBe(ISBN13_A);
    expect(normalizeIsbn("0-306-40615-2")).toBe(ISBN13_A);
    expect(normalizeIsbn("080442957X")).toBe(ISBN13_B);
    expect(normalizeIsbn("080442957x")).toBe(ISBN13_B);
    expect(normalizeIsbn("0747532699")).toBe(ISBN13_C);
  });

  it("drops a bad check digit, a wrong length and a non-978/979 prefix", () => {
    expect(normalizeIsbn("9780306406158")).toBeNull();
    expect(normalizeIsbn("0306406153")).toBeNull();
    expect(normalizeIsbn("97803064061")).toBeNull();
    expect(normalizeIsbn("1234567890123")).toBeNull();
    expect(normalizeIsbn("not an isbn")).toBeNull();
    expect(normalizeIsbn("")).toBeNull();
    expect(normalizeIsbn(null)).toBeNull();
    expect(normalizeIsbn(undefined)).toBeNull();
  });
});

describe("normalizeTitle and authorSurname", () => {
  it("ignores case, accents, punctuation, '&' versus 'and', extra spaces and a leading article", () => {
    expect(normalizeTitle("The  Quiet Harbour")).toBe("quiet harbour");
    expect(normalizeTitle("A Quiet Harbour")).toBe("quiet harbour");
    expect(normalizeTitle("Café & Bar: Notes")).toBe("cafe and bar notes");
    expect(normalizeTitle("Man's Search")).toBe(normalizeTitle("Mans Search"));
    expect(normalizeTitle("Cafe and Bar")).toBe(normalizeTitle("Café & Bar"));
  });

  it("finds the surname of 'First Last' and 'Last, First'", () => {
    expect(authorSurname("Ada Pemberton")).toBe("pemberton");
    expect(authorSurname("Pemberton, Ada")).toBe("pemberton");
    expect(authorSurname("Ada B. Pemberton")).toBe("pemberton");
    expect(authorSurname("  ")).toBe("");
  });
});

describe("titleMatchKind and scoreMatch", () => {
  const book = { title: "The Quiet Harbour", author: "Ada Pemberton" };

  it("is strong when the title matches and the surname is among the authors", () => {
    expect(scoreMatch(book, { title: "Quiet Harbour", authors: ["Ada Pemberton"] })).toBe("strong");
  });

  it("treats a longer candidate title (a subtitle) as a match, but not the reverse", () => {
    expect(titleMatchKind(book.title, "The Quiet Harbour: A Story of Tides")).toBe("prefix");
    expect(scoreMatch(book, { title: "The Quiet Harbour: A Story of Tides", authors: ["Ada Pemberton"] })).toBe("strong");
    expect(titleMatchKind("The Quiet Harbour: A Story of Tides", "The Quiet Harbour")).toBe("none");
    expect(titleMatchKind(book.title, "The Quiet Harbours")).toBe("none");
    expect(titleMatchKind(book.title, "The Quiet Harbour")).toBe("exact");
  });

  it("is weak when only the title or only the author matches", () => {
    expect(scoreMatch(book, { title: "The Quiet Harbour", authors: ["Someone Else"] })).toBe("weak");
    expect(scoreMatch(book, { title: "Another Book", authors: ["Ada Pemberton"] })).toBe("weak");
  });

  it("is none when neither matches", () => {
    expect(scoreMatch(book, { title: "Another Book", authors: ["Someone Else"] })).toBe("none");
    expect(scoreMatch(book, { title: "", authors: [] })).toBe("none");
  });

  it("finds the surname among several authors and with 'Last, First' book authors", () => {
    const multi = { title: "Quiet Harbour", authors: ["Ben Carver", "Ada Pemberton", "Cy Ortiz"] };
    expect(scoreMatch(book, multi)).toBe("strong");
    expect(scoreMatch({ title: "Quiet Harbour", author: "Pemberton, Ada" }, multi)).toBe("strong");
  });

  it("matches the surname as a whole word, not as part of another name", () => {
    expect(scoreMatch({ title: "Quiet Harbour", author: "Ada Pem" }, { title: "Quiet Harbour", authors: ["Ada Pemberton"] })).toBe("weak");
  });

  it("with no author on the book, the best it can be is weak", () => {
    expect(scoreMatch({ title: "Quiet Harbour", author: "" }, { title: "Quiet Harbour", authors: ["Ada Pemberton"] })).toBe("weak");
  });
});

// A fake network keyed on the host. Never touches a real API.
const fakeFetch = (routes: { google?: unknown | Error; openLibrary?: unknown | Error }): FetchLike => {
  const respond = (value: unknown | Error | undefined) => {
    if (value instanceof Error) return Promise.reject(value);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(value ?? {}) });
  };
  return (url) => (url.includes("googleapis.com") ? respond(routes.google) : respond(routes.openLibrary));
};

const volume = (title: string, authors: string[], ids: { type: string; identifier: string }[], extra: Record<string, unknown> = {}) => ({
  volumeInfo: { title, authors, industryIdentifiers: ids, ...extra },
});

describe("findIsbnCandidates (mocked network)", () => {
  it("parses Google Books editions with publisher, year and a https cover", async () => {
    const { candidates, failed } = await findIsbnCandidates(
      "The Quiet Harbour",
      "Ada Pemberton",
      fakeFetch({
        google: {
          items: [
            volume("The Quiet Harbour", ["Ada Pemberton"], [{ type: "ISBN_13", identifier: ISBN13_A }], {
              publisher: "Placeholder Press",
              publishedDate: "2018-10-16",
              imageLinks: { thumbnail: "http://example.test/c.jpg" },
            }),
          ],
        },
        openLibrary: { docs: [] },
      }),
    );
    expect(failed).toBe(false);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      isbn13: ISBN13_A,
      publisher: "Placeholder Press",
      year: "2018",
      coverUrl: "https://example.test/c.jpg",
      source: "Google Books",
      match: "strong",
      titleMatch: "exact",
    });
  });

  it("converts an ISBN-10 and drops an edition whose check digit is wrong", async () => {
    const { candidates } = await findIsbnCandidates(
      "Quiet Harbour",
      "Ada Pemberton",
      fakeFetch({
        google: {
          items: [
            volume("Quiet Harbour", ["Ada Pemberton"], [{ type: "ISBN_10", identifier: "080442957X" }]),
            volume("Quiet Harbour", ["Ada Pemberton"], [{ type: "ISBN_13", identifier: "9780306406158" }]),
          ],
        },
        openLibrary: { docs: [] },
      }),
    );
    expect(candidates.map((c) => c.isbn13)).toEqual([ISBN13_B]);
  });

  it("uses the first valid ISBN of an Open Library work and skips invalid ones", async () => {
    const { candidates } = await findIsbnCandidates(
      "Quiet Harbour",
      "Ada Pemberton",
      fakeFetch({
        google: { items: [] },
        openLibrary: {
          docs: [
            {
              title: "Quiet Harbour",
              author_name: ["Ada Pemberton"],
              publisher: ["Other Press", "Third Press"],
              first_publish_year: 1999,
              isbn: ["9780306406158", "0306406152", ISBN13_B],
              cover_i: 42,
            },
          ],
        },
      }),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      isbn13: ISBN13_A,
      publisher: "Other Press",
      year: "1999",
      coverUrl: "https://covers.openlibrary.org/b/id/42-S.jpg",
      source: "Open Library",
    });
  });

  it("de-duplicates by ISBN-13 within and across sources, keeping the Google edition", async () => {
    const { candidates } = await findIsbnCandidates(
      "Quiet Harbour",
      "Ada Pemberton",
      fakeFetch({
        google: {
          items: [
            volume("Quiet Harbour", ["Ada Pemberton"], [{ type: "ISBN_13", identifier: ISBN13_A }, { type: "ISBN_10", identifier: "0306406152" }], {
              publisher: "Google Press",
            }),
            volume("Quiet Harbour (reissue)", ["Ada Pemberton"], [{ type: "ISBN_13", identifier: ISBN13_A }]),
          ],
        },
        openLibrary: { docs: [{ title: "Quiet Harbour", author_name: ["Ada Pemberton"], isbn: ["0306406152"] }] },
      }),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].publisher).toBe("Google Press");
  });

  it("puts strong matches first, exact titles before subtitle matches, then weak, then none", async () => {
    const { candidates } = await findIsbnCandidates(
      "Quiet Harbour",
      "Ada Pemberton",
      fakeFetch({
        google: {
          items: [
            volume("Unrelated Book", ["Someone Else"], [{ type: "ISBN_13", identifier: ISBN13_D }]),
            volume("Quiet Harbour", ["Someone Else"], [{ type: "ISBN_13", identifier: ISBN13_C }]),
            volume("Quiet Harbour: Tides", ["Ada Pemberton"], [{ type: "ISBN_13", identifier: ISBN13_B }]),
            volume("Quiet Harbour", ["Ada Pemberton"], [{ type: "ISBN_13", identifier: ISBN13_A }]),
          ],
        },
        openLibrary: { docs: [] },
      }),
    );
    expect(candidates.map((c) => c.isbn13)).toEqual([ISBN13_A, ISBN13_B, ISBN13_C, ISBN13_D]);
    expect(candidates.map((c) => c.match)).toEqual(["strong", "strong", "weak", "none"]);
  });

  it("reports failed only when every source fails; one working source is not a failure", async () => {
    const down = new Error("network down");
    const both = await findIsbnCandidates("Quiet Harbour", "Ada Pemberton", fakeFetch({ google: down, openLibrary: down }));
    expect(both).toEqual({ candidates: [], failed: true });

    const oneDown = await findIsbnCandidates(
      "Quiet Harbour",
      "Ada Pemberton",
      fakeFetch({ google: down, openLibrary: { docs: [{ title: "Quiet Harbour", author_name: ["Ada Pemberton"], isbn: [ISBN13_A] }] } }),
    );
    expect(oneDown.failed).toBe(false);
    expect(oneDown.candidates).toHaveLength(1);
  });

  it("treats a non-OK response as a failure and an empty result as 'no editions'", async () => {
    const notOk: FetchLike = () => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) });
    expect(await findIsbnCandidates("Quiet Harbour", "Ada Pemberton", notOk)).toEqual({ candidates: [], failed: true });

    const empty = await findIsbnCandidates("Quiet Harbour", "Ada Pemberton", fakeFetch({ google: {}, openLibrary: { docs: [] } }));
    expect(empty).toEqual({ candidates: [], failed: false });
  });

  it("does no network work for an empty title", async () => {
    let calls = 0;
    const counting: FetchLike = () => {
      calls++;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    };
    expect(await findIsbnCandidates("   ", "Ada Pemberton", counting)).toEqual({ candidates: [], failed: false });
    expect(calls).toBe(0);
  });
});
