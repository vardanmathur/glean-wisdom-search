import { supabase } from "@/integrations/supabase/client";
import { MIN_PREFIX_LENGTH, authorSurname, isWordPrefix, normaliseTitle } from "@/lib/findDuplicateBooks";

// Book aliases: old or alternative titles that point at a book, so a Kindle import under an old title
// attaches to the right book instead of creating a new one.
// SQL record: docs/sql/2026-11-12_book_aliases.sql

export interface BookRef {
  id: string;
  title: string;
  author: string | null;
}

export interface AliasRef {
  id?: string;
  book_id: string;
  alias_title: string;
  alias_author?: string | null;
}

// Same rule as the database's unique index: lower(btrim(title)).
export const titleKey = (title: string): string => title.trim().toLowerCase();

export type Resolution = { bookId: string; via: "title" | "alias" };

// 1) an existing book with the same title (case-insensitive; the matching author wins if there are several),
// 2) else an alias with the same title, 3) else nothing.
export function resolveTitle(
  title: string,
  author: string | null,
  books: BookRef[],
  aliases: AliasRef[],
): Resolution | null {
  const key = titleKey(title);
  if (!key) return null;
  const same = books.filter((b) => titleKey(b.title) === key);
  if (same.length > 0) {
    const wanted = (author ?? "").trim().toLowerCase();
    const byAuthor = wanted ? same.find((b) => (b.author ?? "").trim().toLowerCase() === wanted) : undefined;
    return { bookId: (byAuthor ?? same[0]).id, via: "title" };
  }
  const alias = aliases.find((a) => titleKey(a.alias_title) === key);
  return alias ? { bookId: alias.book_id, via: "alias" } : null;
}

// The most likely existing book for a title that matched nothing: equal after normalising, or the same
// author surname plus one title being a whole-word prefix of the other (at least 8 characters).
export function suggestExistingBook(title: string, author: string | null, books: BookRef[]): BookRef | null {
  const wanted = normaliseTitle(title);
  if (!wanted) return null;
  const surname = author ? authorSurname(author) : "";
  let best: BookRef | null = null;
  let bestScore = 0;
  for (const b of books) {
    const have = normaliseTitle(b.title);
    if (!have) continue;
    const sameSurname = !!surname && authorSurname(b.author ?? "") === surname;
    let score = 0;
    if (have === wanted) {
      score = sameSurname ? 4 : 3;
    } else if (sameSurname) {
      const [short, long] = wanted.length <= have.length ? [wanted, have] : [have, wanted];
      if (short.length >= MIN_PREFIX_LENGTH && isWordPrefix(short, long)) score = 2;
    }
    if (score > bestScore) {
      best = b;
      bestScore = score;
    }
  }
  return best;
}

export interface FileBook {
  title: string;
  author: string | null;
}

// Distinct file titles (by title key) that resolve to neither a book nor an alias, in first-seen order.
export function unresolvedBooks(rows: FileBook[], books: BookRef[], aliases: AliasRef[]): FileBook[] {
  const seen = new Set<string>();
  const out: FileBook[] = [];
  for (const r of rows) {
    const key = titleKey(r.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!resolveTitle(r.title, r.author, books, aliases)) out.push({ title: r.title, author: r.author });
  }
  return out;
}

export type BookChoice = { kind: "existing"; bookId: string } | { kind: "new" };

export interface NewBookItem extends FileBook {
  key: string;
  suggestion: BookRef | null;
}

export function buildNewBookItems(unresolved: FileBook[], books: BookRef[]): NewBookItem[] {
  return unresolved.map((b) => ({ ...b, key: titleKey(b.title), suggestion: suggestExistingBook(b.title, b.author, books) }));
}

// Titles with a suggestion that the user has not answered yet (they block Import).
export function countUndecided(items: NewBookItem[], choices: Record<string, BookChoice>): number {
  return items.filter((i) => i.suggestion && !choices[i.key]).length;
}

// Finds a book by title among the library, for example the library title in a rename prompt.
export function findBookByTitle(books: BookRef[], title: string): BookRef | null {
  const key = titleKey(title);
  return books.find((b) => titleKey(b.title) === key) ?? null;
}

// ---------- database access (book_aliases is not in the generated types yet) ----------

type DbError = { code?: string; message: string } | null;

interface AliasQuery extends PromiseLike<{ data: unknown; error: DbError }> {
  eq(column: string, value: string): AliasQuery;
  ilike(column: string, pattern: string): AliasQuery;
  order(column: string, options?: { ascending?: boolean }): AliasQuery;
  range(from: number, to: number): AliasQuery;
  limit(count: number): AliasQuery;
}

interface AliasTable {
  select(columns: string): AliasQuery;
  insert(row: Record<string, unknown>): PromiseLike<{ error: DbError }>;
  delete(): { eq(column: string, value: string): PromiseLike<{ error: DbError }> };
}

const aliasTable = (): AliasTable =>
  (supabase as unknown as { from: (table: string) => AliasTable }).from("book_aliases");

const PAGE = 1000;

export async function fetchAllAliases(): Promise<AliasRef[]> {
  const out: AliasRef[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await aliasTable()
      .select("id, book_id, alias_title, alias_author")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as AliasRef[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function fetchAliasesForBook(bookId: string): Promise<AliasRef[]> {
  const { data, error } = await aliasTable()
    .select("id, book_id, alias_title, alias_author")
    .eq("book_id", bookId)
    .order("alias_title", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AliasRef[];
}

// Case-insensitive, literal match on the title (pass an already escaped LIKE pattern).
export async function findAliasBookId(escapedTitlePattern: string): Promise<string | null> {
  const { data, error } = await aliasTable()
    .select("book_id")
    .ilike("alias_title", escapedTitlePattern)
    .limit(1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { book_id: string }[];
  return rows[0]?.book_id ?? null;
}

// Admin only (the database enforces it). A title that already has an alias is left alone.
export async function addAlias(bookId: string, title: string, author: string | null): Promise<void> {
  const { error } = await aliasTable().insert({ book_id: bookId, alias_title: title.trim(), alias_author: author });
  // 23505 = duplicate key: that title is already an alias.
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function deleteAlias(aliasId: string): Promise<void> {
  const { error } = await aliasTable().delete().eq("id", aliasId);
  if (error) throw new Error(error.message);
}

export async function fetchAllBooksLite(): Promise<BookRef[]> {
  const out: BookRef[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("books")
      .select("id, title, author")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as BookRef[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
