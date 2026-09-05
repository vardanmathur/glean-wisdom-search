# Changelog

Notable changes to Glean, newest first. One entry per work session; group by what changed, not by file.

## 2026-09-05 — Search Logging, Find Covers, Tag Fixes, UX

### Shipped
- Search query logging — fire-and-forget INSERT on every
  search, captures query/result_count/coverage, anonymous
- Admin Search Logs page (/admin/search-logs) — stats row
  (total, good coverage %, top query), filterable table,
  CSV export, mobile cards
- Admin Hub — Search Logs card added (6th active tool)
- Admin Books — "Find Covers" replaces auto-fetch:
  multi-source OL candidates, ISBN-first with title+author
  fallback, scale-on-hover preview, Google Books removed
  (429 rate limits without API key)
- find-book-covers edge function — server-side cover search
  using GOOGLE_BOOKS_API_KEY secret, returns up to 8 deduped
  candidates (OL ISBN, Google Books ISBN, OL title+author,
  Google Books title+author), graceful OL-only fallback if
  key missing
- Admin Books Find Covers — now calls find-book-covers edge
  function instead of inline client-side fetches, Google
  Books results now working via server-side key
- OL author format fix — converts "Firstname Lastname" to
  "Lastname, Firstname" for better Open Library search results
- SW cache bumped to glean-v21
- HighlightCard — collapsible notes toggle, collapsed by
  default, ChevronDown/Up icons, covers Inspire Me +
  search results
- Homepage — example queries updated + restyled as muted
  search suggestions (borderless, → suffix), Browse by
  Topic capped to 5 chips single row
- UserStudio addTag() — canonical Title Case lookup +
  filteredSuggestions case-insensitive dedup (4th location)
- WhatsApp distribution — first user-facing post drafted
  and sent to readers group

### Deferred
- ISBN-only books Find Covers OL fallback
- Tag Management page — spec complete, ready to build

---

## 2026-05-20 — Major Feature Push (Worksheet, Think!, Admin)

### Shipped
- Download Worksheet — jsPDF 2-page PDF, coaching
  reflection questions, Supabase Storage upload,
  OAuth resume via sessionStorage
- generate-reflection-questions edge function
- worksheet_downloads table, worksheets storage bucket
- Reactions system — save/bookmark (all users), thumbs up
  (+0.5 boost), thumbs down admin-only (-0.5 penalty)
- feedback + saved_highlights tables, DB-backed
- HighlightCard mobile redesign — float cover, warm-stone
  notes box, bottom action row
- Inline highlight editing (HighlightEditPanel) — admin
  only, slide-out panel
- Think! open to all authenticated users — permission
  gate removed
- Think! history page (/think/history) — expandable cards,
  Forge/Opponent display, original highlight shown
- Think! daily usage limits — atomic increment via
  increment_think_usage RPC, service role
- AI book summaries — lazy generation, book_summaries
  table, 6-month cache, admin edit/regenerate
- Open Library enrichment — ISBN lookup, background cover
  fetch, FetchCoversDialog, "Have an ISBN?" link
- Admin Hub (/admin) — 6 cards linking all admin tools
- Admin Books (/admin/books) — inline editing, cover fetch,
  duplicate detection, mobile cards
- Admin Worksheets (/admin/worksheets) — signed URL downloads
- Admin Permissions — search filter, scalable layout
- Navbar consolidated — single Admin link replaces all
  individual admin links
- Mobile card layouts — Admin Studio, Books, Worksheets
- suggest-tags (v1) — pgvector semantic similarity
  (later replaced with LLM approach Aug 2026)
- Design Sprint 2 R01 — synthesis card as hero of search
- Design Sprint 2 R04/R06 — example queries differentiated,
  navbar trimmed
- Your Toolkit section — Think! and Import cards on homepage
- Collapsible notes in HighlightCard
- Book pages mobile fixes — title wrapping, responsive font
- Horizontal scroll fix on search results mobile
- SW cache at glean-v20

---

## 2026-08-22 — Tag system overhaul

**Problem:** DB tags were all lowercase, `src/lib/tags.ts` (`ALL_TAGS`) was Title Case, and several off-taxonomy/malformed tags had accumulated. This split tag-frequency counts, broke suggestion dedup, and made tag-based routing rely on a case-insensitive fallback path.

**Database**
- Migrated all highlight tags to Title Case (66 distinct tags, verified 0 duplicates post-migration)
- Merged malformed/duplicate tags: `needs&wants`→`Desires`, `procrastinating`→`Procrastination`, `faith n spirituality`→`Religion & Spirituality`
- Cleaned orphaned rows in `topic_summaries` cache left over from the old casing

**Taxonomy & search (`src/lib/tags.ts`, `src/lib/data.ts`, `src/lib/normaliseTags.ts`)**
- `ALL_TAGS` rewritten to match the live DB exactly (66 tags, alphabetized)
- `normaliseTags.ts` now derives its canonical map from `ALL_TAGS` instead of a hand-maintained duplicate list, plus a small `LEGACY_ALIASES` table for pre-migration spellings — can't drift out of sync again
- Removed 24 dead tag references from `synonymMap` and `getTopicDescription` (tags that never existed or were merged away)

**Tag input consistency — fixed in 4 separate places**
The app has four independent tag-editing implementations (`AddHighlightModal.tsx`, `HighlightEditPanel.tsx`, the local `EditPanel` in `AdminStudioHighlights.tsx`, and the local `EditPanel` in `UserStudio.tsx`). All four had the same bug: free-typed tags were force-lowercased, and suggestion-dedup checks were case-sensitive. Fixed in each:
- `addTag()` now looks up canonical casing from the taxonomy, falling back to `toTitleCase()` for genuinely new tags
- Suggestion-list filtering is now case-insensitive

**New: LLM-based tag suggestion**
- Replaced the old two-step flow (`suggest_tags_for_quote` SQL full-text RPC → `search-semantic` fallback) with a single new edge function, `supabase/functions/suggest-tags`
- Sends the quote + full taxonomy to `google/gemini-2.5-flash` via the Lovable AI gateway, asks for 2-4 tags, validates the response against the taxonomy server-side (case-insensitive, mapped back to canonical casing) — never trusts or hardcodes tags
- Wired into all four tag-editing UIs above, including adding the feature to `UserStudio.tsx`'s edit panel, which didn't have it before
- Old RPC (`suggest_tags_for_quote`) is no longer called from any UI; the SQL function itself still exists in the DB, unused — not dropped this session

**Housekeeping**
- Added `dotenv` as a dev dependency (`scripts/generate-sitemap.mjs` needed it and wasn't installed)
- Regenerated `public/sitemap.xml` — all 66 topic URLs now Title Case

**Explicitly deferred:** embeddings were not regenerated. The `Topics: <tags>` text baked into each highlight's stored embedding still reflects pre-migration tag casing for every row generated before this session, on top of ~250 already-stale rows from an earlier audit. Next session should decide: force-regenerate all embeddings now, or let the normal refresh cycle catch up.
