# Glean backlog

This is the master backlog. The in-app Inbox (Admin → Inbox) is only a place to jot things down while using the app. Items move from the Inbox into this file when we plan a dev session.

Last updated: 2026-10-14

## Next
- [ ] Hyperlinks from the admin page to each book page
- [ ] Alias table for merged books, so a Kindle import with an old title does not recreate a merged-away book
- [ ] Find duplicate books is buggy: it did not catch two versions of Stephen Covey's The 7 Habits or Carl Sagan's The Demon-Haunted World
- [ ] ISBN search for a single book (built, being tested on 2026-10-14)

## Later
### Books
- [ ] search-books timeouts
- [ ] Fuzzy title + author conflict detection
- [ ] BookLookup conflict UI resets on window switch
- [ ] Find Covers improvements
### Kindle import
- [ ] Carry a note from a skipped duplicate to the kept copy
- [ ] Settings "From Kindle" counter reads source = kindle, but import writes user
- [ ] Try the cleaned master clippings file after a few more small imports
### Tags
- [ ] Phase 3 tag merge UI (merge_tags / preview_tag_merge already deployed)
- [ ] Tag Management UX
- [ ] Shared addTag() hook to replace the four copies
### Bugs
- [ ] Books with 0 visible highlights show when logged out
- [ ] "Access requested ✓" stays after a revoke
### Housekeeping
- [ ] Update GLEAN_DEV_HANDOFF

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
- [x] In-app backlog page in admin (2026-10-14)
- [x] Admin bulk-move of highlights between books, i.e. merge duplicate books (2026-10-14)
