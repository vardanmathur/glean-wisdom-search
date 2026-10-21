# Glean backlog

This is the master dev backlog. The in-app Inbox (Admin → Inbox) is a separate mini to-do list that is managed by hand. It is not kept in sync with this file, and nothing needs to move from it into this file.

Last updated: 2026-10-21

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
- [ ] Phase 3 tag merge UI (merge_tags / preview_tag_merge already deployed)
- [ ] Tag Management UX
- [ ] Shared addTag() hook to replace the four copies
- [ ] Fix the AI tag analysis: it only sees tag names and counts, and its failures show as "No significant overlaps found". Check the logs for a wrong model name, return real errors, and check whether the tag counts stop at 1,000 highlights
- [ ] Tag overlap report: combine name similarity, average highlight embeddings per tag, and shared-highlight counts in both directions (a small tag inside a big one is parent-child, not a merge). Needs one read-only database function via Lovable. Wire results to the existing preview_tag_merge / merge_tags buttons
- [ ] Per-highlight tag cleanup queue: for pairs like investing/money or family/marriage, show the quote and both tags with Keep A / Keep B / Keep both / Skip. Re-embed on save. Browser-only
- [ ] Fix preview_tag_merge: it counts only public highlights, but merge_tags changes all of them
- [ ] After a tag merge, re-embed the affected highlights (their embeddings still contain the old tag names)
- [ ] Optional: re-embed everything from the quote alone, so tag comparisons aren't circular
- [ ] Migrate src/lib/normaliseTags.ts to read from the public.tags table instead of a hardcoded list (TODO at line 2)
### Bugs
- [ ] Books with 0 visible highlights show when logged out
- [ ] "Access requested ✓" stays after a revoke
### Housekeeping
- [ ] Update GLEAN_DEV_HANDOFF
- [ ] Add CHANGELOG and README entries for the 2026-10-13 Kindle import rebuild and the 2026-10-14 work (book merge, Find ISBN, Inbox, BACKLOG.md)
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

## Done
- [x] Kindle "My Clippings" import rebuilt (2026-10-13)
- [x] In-app backlog page in admin, now the Inbox (2026-10-14)
- [x] Admin bulk-move of highlights between books, i.e. merge duplicate books (2026-10-14)
- [x] Single-book Find ISBN in the admin edit Sheet (2026-10-14)
- [x] BACKLOG.md created as the master list (2026-10-14)
- [x] Admin Books: titles link to their book pages, plus "View book page" in the edit Sheet (2026-10-21)
- [x] Find Duplicates matches near-identical titles across subtitles, articles and number words; unit-tested (real Covey/Sagan pairs were already merged by hand) (2026-10-21)
- [x] Fixed Lovable/GitHub sync split by committing Lovable's current previewAuthStorage.ts (2026-10-21)
