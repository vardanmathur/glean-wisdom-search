# Changelog

Notable changes to Glean, newest first. One entry per work session; group by what changed, not by file.

## 2026-11-05 — Inspire Me No Longer Repeats

### Shipped
- Changed: "Inspire Me" and its Shuffle button now pick the
  public highlight that has been shown the fewest times (random
  among ties), like working through a shuffled deck, and never
  show the same book twice in a row; before, a random position
  in the library was chosen each time, so repeats came early
- Added: each show is counted (global, no user data stored)
- Added: Admin Hub "Inspire Me coverage" card (how many public
  highlights have been shown at least once, and min/max shows)
- Added: Admin Studio "Inspire" column, "Least/Most shown in
  Inspire" sorts and a "Never shown in Inspire" filter
- Changed: if the new pick fails, Inspire Me falls back to the
  old random method instead of showing an error

---

## 2026-11-03 — Admin Quick Menu, Safer Book Deletes

### Shipped
- Added: admin-only floating quick menu (radial shortcuts)
  - a round button you can drag anywhere; on release it snaps to
    the nearer side edge, and the position and side are remembered
    on that device
  - tap to fan out seven shortcuts (Admin Hub, Inbox, Admin
    Studio, Add highlight, Search, Books, Overlap review); the
    fan mirrors to open away from whichever edge it sits on
  - press and hold the button to arrange the shortcut order
    (up/down buttons, "Reset to default"); order is saved per
    device
  - the button is half transparent when idle and fully opaque
    when pressed, hovered, focused or open
  - the pressed icon and its label always paint on top of the
    neighbouring icons
- Added: "Add highlight" opens from the quick menu on any page
- Changed: the phone's Back button now closes the Add highlight
  window instead of leaving the page (the camera and dictation
  stop the same way as on Cancel)
- Changed: /admin/tag-management?tab=overlaps opens the Overlap
  review tab directly
- Changed: every book delete shows which book(s) will go first.
  Find Duplicates "Delete" now opens the same confirmation as
  the row delete, and the "Delete N books with no highlights"
  dialog lists the books (title and author, sorted by title)
- Fixed: before deleting, the highlight count is re-checked, so
  a book that gained highlights since the page loaded is skipped
  (deleting a book also deletes its highlights)

---

## 2026-10-23 — Tag Overlap Review, Highlight Fingerprints

### Shipped
- Added: Overlap review in Tag Management
  - tag pairs ranked by how many highlights share both tags
  - one highlight at a time: Keep both, Remove either tag, Skip
    or Undo last; no bulk actions
  - decisions are remembered and expire after 12 months
- Added: tag counts now come from a database function with no
  1,000-row limit, plus an "Unused & unlisted tags" card; the
  delete button is only offered for taxonomy tags with 0
  highlights
- Changed: a highlight's fingerprint (embedding) is now quote +
  tags + notes; highlights with no tags are never fingerprinted
- Added: a shared helper refreshes a fingerprint in the
  background whenever a tagged highlight's quote, tags or notes
  change (new highlights, edits, tag rename, tag normalise)
- Added: Admin Hub panel showing how many highlights need a
  fingerprint refresh, with a "Refresh now" button
- Changed: six AI functions moved to gemini-3.8-flash with
  resized token limits and timeouts (fixes cut-off search
  answers)
- Changed: "Add tag" only treats taxonomy tags as duplicates
- Removed: the analyse-tags function, the "Analyse with AI" tab
  and the old two-tag overlap picker

---

## 2026-10-21 — Admin Book Links, Smarter Duplicate Finder

### Shipped
- Added: book titles in Admin Books link to their book page, and
  the edit panel has a "View book page" link
- Changed: Find Duplicates now matches near-identical titles
  across subtitles, leading "The/A/An", number words and accents
  (non-Latin titles are kept), and compares author surnames; it
  was matching exact titles only
- Fixed: GitHub and Lovable were out of step on
  previewAuthStorage.ts; main now carries Lovable's version

---

## 2026-10-14 — Book Merge, Find ISBN, Inbox

### Shipped
- Added: merge a book into another from Admin Books (preview of
  what moves, then merge); highlights move first so none are lost
- Added: Find ISBN for a single book in the edit panel (Google
  Books and Open Library, several editions to pick from)
- Added: Inbox (/admin/backlog), a quick-capture to-do list for
  jotting things down while using the app; it is separate from
  BACKLOG.md and not synced with it
- Added: BACKLOG.md in the repo root as the master dev backlog
- Removed: Lovable's leftover test rows from production

---

## 2026-10-13 — Kindle Import Rebuilt

### Shipped
- Removed: the last-import-date filter. Duplicates are now caught
  by comparing text, not dates, so older highlights that were
  never imported are no longer dropped
- Fixed: keystroke-note chains from Kindle (one note typed out
  as dozens of saves) are collapsed into one note
- Changed: duplicate matching ignores book titles and checks your
  own library first, then other users' public highlights (never
  private ones), so renamed books are still caught
- Changed: a trigram pre-filter keeps the matching exact and fast
- Added: new review screen
  - one card per group of versions, with one import button per
    version (importing one skips the others)
  - identical copies of your own highlights and truncated saves
    are resolved automatically
  - a per-book "you renamed X to Y" prompt when 3 or more
    highlights match the same library book under a different title
  - "N left to decide" at the top, with decided cards in a
    collapsed "Decided" section (each keeps Undo)
  - "Books needing attention" lists only books that will actually
    be imported
  - a short reason shown beside a disabled Import button
- Fixed: the book lookup at import now matches titles literally
  (underscores and percent signs no longer act as wildcards),
  trims spaces, and picks the oldest match when titles repeat
- Note: test files live in the gitignored test data/ folder and
  are never committed

---

## 2026-10-02 — Mobile Tag Entry, Admin Taxonomy Prompt, Modal Overflow

### Shipped
- Fixed: tag entry on mobile — some Android keyboards don't
  send a usable Enter key, so tags weren't being added. Added
  an "Add" button next to the tag input (HighlightEditPanel,
  AdminStudioHighlights edit panel, UserStudio edit panel,
  Add highlight modal), plus enterKeyHint="done" and a more
  tolerant key check (Enter, comma, keyCode 13)
- Added: admins now get the "Add to taxonomy?" prompt in the
  Add highlight modal and the My Studio edit panel, not only
  the two admin edit panels. Non-admins never see it, because
  inserts into public.tags are admin-only
- Fixed: Add highlight modal overflowed sideways on mobile —
  visibility buttons now wrap, and long book titles wrap
  instead of truncating
- Changed: build label in the avatar dropdown now shows time
  as well as date

---

## 2026-10-02 — Tag System DB Migration, Admin UX, Bug Fixes

### Shipped
- public.tags table — 66 canonical tags, case-insensitive
  uniqueness, RLS (public SELECT, admin INSERT/DELETE/UPDATE),
  service_role grants
- merge_tags RPC — atomic tag merge with dedup, admin-only,
  transactional, deletes source tag after replacement
- preview_tag_merge RPC — shows impact counts before merge,
  authenticated only, public highlights only
- useAllTags hook — migrated to read from public.tags table,
  React Query cached, tags.ts no longer source of truth
- AdminStudioHighlights allTags — migrated from local
  highlights scan to useAllTags hook
- handleAddTag — real INSERT to public.tags table
- Tag inventory — shows all tags including 0-count ones
- Tag Management tab layout — Inventory / Find Overlaps /
  AI Analysis tabs, controlled tab state
- Tag Management delete — real DELETE from public.tags
- "Add to taxonomy?" prompt — in HighlightEditPanel and
  AdminStudioHighlights when admin adds off-taxonomy tag
- Mobile dialog fix — 1rem gutter on all dialogs (base
  component fix in dialog.tsx)
- Navbar version indicator — build timestamp injected at
  Vite build time via VITE_BUILD_TIME
- normaliseTags.ts — TODO comment pointing to DB migration

### Deferred
- Tag Management Phase 3 (merge UI) — RPCs deployed,
  UI not built yet
- Tag count badge linking to topic page

---

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
- Add highlight from Book Detail page — button for all
  logged-in users, book pre-selected and locked, "Change"
  override, auto-refresh highlights list via
  queryClient.invalidateQueries
- Delete highlight button on Book Detail page — visible
  to admin and highlight owner only, optimistic removal
- Duplicate ISBN detection in BookLookup — conflict UI
  shows existing book with "Use this book" / "Use
  different ISBN" options, no silent constraint failure
- Single-click "Change book" fix — was requiring two
  clicks due to stale selectedBook prop on BookLookup

### Deferred
- ISBN-only books Find Covers OL fallback
- Tag Management page — spec complete, ready to build
- BookLookup conflict UI resets on window switch —
  sessionStorage fix needed, low priority

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
