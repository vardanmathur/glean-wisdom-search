# Book search across all books

Let people search the whole world of books (not just what's already in the library) from the Add Highlight book picker, and pick one with its cover and ISBN filled in automatically.

## 1. New backend function — `supabase/functions/search-books/index.ts` (new file)

Modelled on the existing `find-book-covers` function.

- Input: `{ query, author?, offset? }` (offset defaults to 0).
- Runs Google Books and Open Library in parallel.
  - Google Books: `volumes?q={query}+inauthor:{author}&maxResults=10&startIndex={offset}&key=GOOGLE_BOOKS_API_KEY` (key read server-side only). Extracts title, first author, ISBN_13 then ISBN_10, thumbnail with `zoom=1` → `zoom=2`, source `"Google Books"`.
  - Open Library: author converted to `Last, First` format; `search.json?title={query}&author={olAuthor}&limit=10&offset={offset}`. Extracts title, `author_name[0]`, `isbn[0]`, `covers/b/id/{cover_i}-M.jpg`, source `"Open Library"`.
- Merge with Google Books first, dedupe by ISBN, then by lowercase title+author when no ISBN.
- Return first 5: `{ books: [{ title, author, isbn, coverUrl, source }], hasMore }`; `hasMore` true if either source returned 10.
- Any failure returns `{ books: [], hasMore: false }`.

## 2. `supabase/config.toml`

Append after line 22:

```
[functions.search-books]
verify_jwt = false
```

## 3. `src/components/studio/BookLookup.tsx`

- **Line 4** — add `Search`-free; no new icons needed beyond existing `Loader2`.
- **After line 35** — new state: `externalBooks`, `externalSearching`, `externalOffset`, `externalHasMore`, `externalSearched`.
- **New effect after line 104** — clear external state whenever `search` or `mode` changes.
- **New function after line 325** (`runExternalSearch(offset, append)`) — invokes `search-books`, sets/appends results and `hasMore`.
- **Auto-trigger** — inside the existing debounce effect (lines 57–104), after `setSuggestions(...)` at line 99: when the internal search returned 0 results and the term is 3+ chars, fire `runExternalSearch(0,false)` (600 ms debounce, fire-and-forget).
- **New function `handleSelectExternal`** — checks `books` for an existing row with the same ISBN; on match sets `existingBookConflict` and stops; otherwise calls `onSelect({ id: null, title, author, isbn, coverImageUrl, pending: true })`.
- **Search-mode UI (lines 358–412)**:
  - Below the input (near line 375): always-visible `Search all books →` link when the query is 2+ chars.
  - Below internal results / the "No matches" block (after line 410): spinner + "Searching all books…", a `From all books:` section header, the result cards with cover thumbnail, title, author, ISBN and source, a `Show 5 more →` button when more exist, and a "No books found — try different search terms" empty state.
- The existing ISBN-conflict banner is currently only rendered inside the `mode === "scan"` block (lines 449–501). To make it visible in search mode when `handleSelectExternal` finds a duplicate, the banner will be moved out of the scan-only block and rendered globally whenever `existingBookConflict` is set.
  - Exact JSX placement: after the closing brace of the `mode === "manual"` block (currently line 530) and before the final `</div>` at line 532, insert `{existingBookConflict && (<div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mt-3 space-y-2">…</div>)}`.
  - This makes the conflict UI available in search, scan, and manual modes without duplicating it.

## Notes

- No book row is ever written during external search — the selection stays `pending: true` until the highlight is saved.
- No database migrations, no service-worker bump.
- After implementing, the function is deployed and tested live with a real query.
