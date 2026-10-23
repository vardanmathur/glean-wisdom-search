# Glean backlog

This is the master dev backlog. The in-app Inbox (Admin → Inbox) is a separate mini to-do list that is managed by hand. It is not kept in sync with this file, and nothing needs to move from it into this file.

Last updated: 2026-10-23

## Next
- [ ] Alias table for merged books, so a Kindle import with an old title does not recreate a merged-away book

## Later
### Books
- [ ] search-books timeouts
- [ ] Fuzzy title + author conflict detection
- [ ] BookLookup conflict UI resets on window switch
- [ ] Find Covers improvements
- [ ] Merging books copies across quotes that already exist in the target book, leaving duplicates. Add an option to skip or remove them (the merge preview already warns about them)
### Kindle import
- [ ] Carry a note from a skipped duplicate to the kept copy
- [ ] Settings "From Kindle" counter reads source = kindle, but import writes user
- [ ] Try the cleaned master clippings file after a few more small imports
### Tags
- [ ] Tag Management UX
- [ ] Shared addTag() hook to replace the four copies
- [ ] Per-highlight tag cleanup queue: for pairs like investing/money or family/marriage, show the quote and both tags with Keep A / Keep B / Keep both / Skip. Re-embed on save. Browser-only
- [ ] After a tag merge, re-embed the affected highlights (their embeddings still contain the old tag names)
- [ ] Optional: re-embed everything from the quote alone, so tag comparisons aren't circular
- [ ] Migrate src/lib/normaliseTags.ts to read from the public.tags table instead of a hardcoded list (TODO at line 2)
- [ ] Work through the Overlap review pairs (Tag Management) one highlight at a time
- [ ] Remove the unused merge_tags and preview_tag_merge database functions (whole-tag merge was replaced by per-highlight overlap review)
- [ ] Switch src/lib/tagOverlap.ts wrappers to the generated types now in types.ts (Lovable regenerated them)
### Bugs
- [ ] Books with 0 visible highlights show when logged out
- [ ] "Access requested ✓" stays after a revoke
- [ ] Search page hides "Glean's take" silently when the AI answer is empty or fails. Show "Couldn't generate Glean's take — try again" with a retry instead (frontend only, Cursor; edge function now returns error: "credits" / "rate_limit")
- [ ] A highlight whose last tag is removed keeps its old fingerprint (with the old tag names); clear or handle it
### Housekeeping
- [ ] Update GLEAN_DEV_HANDOFF
- [ ] Add CHANGELOG and README entries for the 2026-10-13 Kindle import rebuild and the 2026-10-14 work (book merge, Find ISBN, Inbox, BACKLOG.md), the 2026-10-21 work (admin book links, duplicate finder, sync fix) and the 2026-10-23 AI model switch
- [ ] Decide whether to keep or remove the drizzle files Lovable added (drizzle.config.ts, drizzle/, three dev dependencies). Nothing in src/ imports them

## Someday
### Books
- [ ] Bulk Find ISBNs / server-side ISBN search. Build it if Google lookups fail often, if we need to fill many books at once, or if we want the Google key kept on the server
- [ ] Admin Books view-mode toggle
- [ ] BookLookup locked view truncates long titles
### Kindle import
- [ ] Review screen: "will be added to existing book" line and author-mismatch warning
- [ ] Import quirks: malformed counter counts empty bookmarks; "--" wrongly garbled; ", The - Author" swap
- [ ] Kindle import UX redesign
### Tags
- [ ] Drop suggest_tags_for_quote
### Features
- [ ] Worksheet PDF bold titles
- [ ] Design Sprint 3
- [ ] Deep Dive PDF
- [ ] New-user highlight notification
- [ ] Think! per-user limits
- [ ] synonymMap gaps; getTopicDescription for ~20 tags
### Housekeeping
- [ ] Remove dead dependency at AdminStudioHighlights.tsx:1214
### Infrastructure
- [ ] Plausible analytics
- [ ] Local OAuth
- [ ] Migrate to own Supabase
- [ ] Duplicate Lovable project
- [ ] If search feels slow, move only rerank-highlights to gemini-3.1-flash-lite (faster, cheaper; output is just a list of scores)
- [ ] Admin settings screen for tunable numbers (overlap decision expiry, min shared highlights, AI token limits, timeouts) so they can change without code edits
- [ ] Fingerprint "Refresh now" runs in the browser and pauses if the tab is hidden; move it server-side if it becomes a nuisance
- [ ] Fingerprint refresh only runs for admins; revisit if Glean gets other users

## Done
- [x] Kindle "My Clippings" import rebuilt (2026-10-13)
- [x] In-app backlog page in admin, now the Inbox (2026-10-14)
- [x] Admin bulk-move of highlights between books, i.e. merge duplicate books (2026-10-14)
- [x] Single-book Find ISBN in the admin edit Sheet (2026-10-14)
- [x] BACKLOG.md created as the master list (2026-10-14)
- [x] Admin Books: titles link to their book pages, plus "View book page" in the edit Sheet (2026-10-21)
- [x] Find Duplicates matches near-identical titles across subtitles, articles and number words; unit-tested (real Covey/Sagan pairs were already merged by hand) (2026-10-21)
- [x] Fixed Lovable/GitHub sync split by committing Lovable's current previewAuthStorage.ts (2026-10-21)
- [x] Fixed truncated/missing search answers: gemini-2.5-flash's default thinking used ~765 of 800 tokens. Moved synthesise-wisdom, suggest-tags, rerank-highlights, generate-book-summary, generate-topic-summary and generate-reflection-questions to gemini-3.8-flash with reasoning_effort "none", resized token limits, added 30s timeouts and finish_reason/usage logging (2026-10-23)
- [x] Tag overlap review in Tag Management: ranked tag pairs by shared highlights and meaning, one-highlight-at-a-time Keep both / Remove / Skip / Undo, decisions expire after 12 months; correct tag counts (no 1,000-row cap) and an Unused & unlisted tags card; retired analyse-tags and the old overlap picker (2026-10-23)
- [x] Fingerprints now = quote + tags + notes; untagged highlights are never fingerprinted; a shared helper refreshes in the background whenever a tagged highlight's quote, tags or notes change; admin "Refresh now" panel; 408 rebuilt, 0 failed (2026-10-23)
- [x] Add tag: only taxonomy tags count as duplicates (2026-10-23)
