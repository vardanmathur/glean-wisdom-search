// Edition lookup for the admin "Find ISBN" picker. Pure logic: no React, no Supabase.
// Searches Open Library and Google Books directly from the browser (the same way fetchBookCover does).

export type MatchLabel = "strong" | "weak" | "none";
export type TitleMatch = "exact" | "prefix" | "none";

export interface IsbnCandidate {
  isbn13: string;
  title: string;
  authors: string[];
  publisher: string | null;
  year: string | null;
  coverUrl: string | null;
  source: "Google Books" | "Open Library";
  match: MatchLabel;
  titleMatch: TitleMatch;
}

export interface FindIsbnsResult {
  candidates: IsbnCandidate[];
  failed: boolean;
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const MAX_CANDIDATES = 12;
const TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// ISBN
// ---------------------------------------------------------------------------
const isbn13CheckDigit = (first12: string): number => {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
};

const isbn10Valid = (s: string): boolean => {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = s[i];
    const value = ch === "X" ? 10 : Number(ch);
    sum += (10 - i) * value;
  }
  return sum % 11 === 0;
};

// Returns ISBN-13 (digits only), converting a valid ISBN-10. Null when the input is not a valid ISBN.
export function normalizeIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/^ISBN(-1[03])?:?/, "").replace(/[\s-]/g, "");
  if (/^\d{13}$/.test(s)) {
    if (!/^97[89]/.test(s)) return null;
    return isbn13CheckDigit(s.slice(0, 12)) === Number(s[12]) ? s : null;
  }
  if (/^\d{9}[\dX]$/.test(s)) {
    if (!isbn10Valid(s)) return null;
    const core = "978" + s.slice(0, 9);
    return core + isbn13CheckDigit(core);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------
// Lowercase, accents removed, "&" read as "and", punctuation dropped, spaces collapsed.
const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

// As fold, and a leading "the", "a" or "an" is ignored.
export function normalizeTitle(s: string): string {
  return fold(s).replace(/^(the|a|an) /, "");
}

// Surname of "First Last" or "Last, First", folded.
export function authorSurname(author: string): string {
  const trimmed = author.trim();
  if (!trimmed) return "";
  const surname = trimmed.includes(",") ? trimmed.split(",")[0] : (trimmed.split(/\s+/).pop() ?? "");
  return fold(surname);
}

// "exact": same title once normalised. "prefix": the candidate title starts with the book's title (a subtitle).
export function titleMatchKind(bookTitle: string, candidateTitle: string): TitleMatch {
  const b = normalizeTitle(bookTitle);
  const c = normalizeTitle(candidateTitle);
  if (!b || !c) return "none";
  if (b === c) return "exact";
  return c.startsWith(b + " ") ? "prefix" : "none";
}

// strong: the title matches (equal or with a subtitle) AND the book's surname is among the authors.
// weak: only one of the two. none: neither.
export function scoreMatch(
  book: { title: string; author: string },
  candidate: { title: string; authors: string[] },
): MatchLabel {
  const titleOk = titleMatchKind(book.title, candidate.title) !== "none";
  const surname = authorSurname(book.author);
  const authorOk =
    surname.length > 0 && candidate.authors.some((a) => fold(a).split(" ").includes(surname));
  if (titleOk && authorOk) return "strong";
  return titleOk || authorOk ? "weak" : "none";
}

const rank = (c: IsbnCandidate): number =>
  c.match === "strong" ? (c.titleMatch === "exact" ? 0 : 1) : c.match === "weak" ? 2 : 3;

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------
async function getJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

type Raw = Omit<IsbnCandidate, "match" | "titleMatch">;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asString = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const asStrings = (v: unknown): string[] => asArray(v).map(asString).filter((s): s is string => !!s);
const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

function parseGoogle(json: unknown): Raw[] {
  const out: Raw[] = [];
  for (const item of asArray(asRecord(json).items)) {
    const info = asRecord(asRecord(item).volumeInfo);
    const title = asString(info.title);
    if (!title) continue;
    const ids = asArray(info.industryIdentifiers).map(asRecord);
    const idValues = [
      ...ids.filter((i) => i.type === "ISBN_13"),
      ...ids.filter((i) => i.type === "ISBN_10"),
    ].map((i) => asString(i.identifier));
    let isbn13: string | null = null;
    for (const raw of idValues) {
      isbn13 = normalizeIsbn(raw);
      if (isbn13) break;
    }
    if (!isbn13) continue;
    const thumb = asString(asRecord(info.imageLinks).thumbnail);
    const published = asString(info.publishedDate);
    out.push({
      isbn13,
      title,
      authors: asStrings(info.authors),
      publisher: asString(info.publisher),
      year: published ? (published.match(/^\d{4}/)?.[0] ?? null) : null,
      coverUrl: thumb ? thumb.replace(/^http:/, "https:") : null,
      source: "Google Books",
    });
  }
  return out;
}

function parseOpenLibrary(json: unknown): Raw[] {
  const out: Raw[] = [];
  for (const doc of asArray(asRecord(json).docs)) {
    const d = asRecord(doc);
    const title = asString(d.title);
    if (!title) continue;
    let isbn13: string | null = null;
    for (const raw of asStrings(d.isbn)) {
      isbn13 = normalizeIsbn(raw);
      if (isbn13) break;
    }
    if (!isbn13) continue;
    const coverId = typeof d.cover_i === "number" ? d.cover_i : null;
    const year = typeof d.first_publish_year === "number" ? String(d.first_publish_year) : null;
    out.push({
      isbn13,
      title,
      authors: asStrings(d.author_name),
      publisher: asStrings(d.publisher)[0] ?? null,
      year,
      coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-S.jpg` : null,
      source: "Open Library",
    });
  }
  return out;
}

// Looks up editions of a book. `failed` is true only when every source failed; a source that works but
// finds nothing is "no editions", not a failure. Candidates are valid ISBN-13s, de-duplicated, best matches first.
export async function findIsbnCandidates(
  title: string,
  author: string,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): Promise<FindIsbnsResult> {
  const t = title.trim();
  const a = author.trim();
  if (!t) return { candidates: [], failed: false };

  const googleUrl =
    `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(t)}` +
    (a ? `+inauthor:${encodeURIComponent(a)}` : "") +
    `&maxResults=10&printType=books`;
  const openLibraryUrl =
    `https://openlibrary.org/search.json?title=${encodeURIComponent(t)}` +
    (a ? `&author=${encodeURIComponent(a)}` : "") +
    `&limit=5&fields=title,author_name,publisher,first_publish_year,isbn,cover_i`;

  const [google, openLibrary] = await Promise.allSettled([
    getJson(googleUrl, fetchImpl).then(parseGoogle),
    getJson(openLibraryUrl, fetchImpl).then(parseOpenLibrary),
  ]);
  const failed = google.status === "rejected" && openLibrary.status === "rejected";

  const seen = new Set<string>();
  const scored: IsbnCandidate[] = [];
  const raws = [
    ...(google.status === "fulfilled" ? google.value : []),
    ...(openLibrary.status === "fulfilled" ? openLibrary.value : []),
  ];
  for (const raw of raws) {
    if (seen.has(raw.isbn13)) continue;
    seen.add(raw.isbn13);
    scored.push({
      ...raw,
      match: scoreMatch({ title: t, author: a }, raw),
      titleMatch: titleMatchKind(t, raw.title),
    });
  }
  // Array.prototype.sort is stable, so equal ranks keep their source order (Google first).
  scored.sort((x, y) => rank(x) - rank(y));
  return { candidates: scored.slice(0, MAX_CANDIDATES), failed };
}
