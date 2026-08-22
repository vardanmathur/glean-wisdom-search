# Changelog

Notable changes to Glean, newest first. One entry per work session; group by what changed, not by file.

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
