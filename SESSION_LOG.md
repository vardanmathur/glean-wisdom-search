---

## [2026-10-02] Glean — Mobile tag entry fixed, admin taxonomy prompt extended, modal overflow fixed

**Mode**: Claude Code  
**Mem0**: not connected

### What happened
Fixed tag entry on Android soft keyboards (visible Add button + `enterKeyHint` + tolerant key check) across four tag inputs, extended the admin-only "Add to taxonomy?" prompt to the Add highlight modal and My Studio edit panel, and fixed the Add highlight modal scrolling sideways at 360px. Moved `AdminStudioHighlights` onto `useAllTags()`, added a build timestamp to the Navbar version label, and updated CHANGELOG/README (new README `## Backlog` section). Confirmed Glean's dictation already uses `continuous=false` + restart-on-`onend` + a 2.5s silence stop.

### Key decisions
- Taxonomy prompt gated on `useIsAdmin()` at the setter, not the render: `public.tags` INSERT is admin-only and the modal is reachable by any signed-in user.
- Modal overflow fixed at the elements (`min-w-0` grid item, `flex-wrap`, `break-words`), not `overflow-x-hidden` on `dialog.tsx` — that would hide the Add button and break other dialogs.
- Removed the "AdminSeed gate missing" CHANGELOG line — the gate already exists; it came from an unverified spec.

### Open threads
- [ ] Test the mobile tag Add button and the modal at 360px on a real Android device (nothing verified in a browser this session).
- [ ] `handleRename` in AdminTagManagement still doesn't rename the row in `public.tags`.
- [ ] Consolidate the four `addTag()` + taxonomy-prompt copies into one hook/component (in README Backlog).

### Artifacts
- `AddHighlightModal.tsx`, `UserStudio.tsx`, `HighlightEditPanel.tsx`, `AdminStudioHighlights.tsx`; CHANGELOG.md, README.md

---

## [2026-09-30] Glean — Tag taxonomy moved to DB, Admin Tag Management page shipped

**Mode**: Claude Code  
**Mem0**: not connected

### What happened
Migrated the tag taxonomy from a static `ALL_TAGS` array to a real `public.tags` DB table, consolidating four separate tag-fetching implementations into one shared `useAllTags()` hook (React Query, `["tags-table"]`). Built and shipped `/admin/tag-management` — tag inventory, rename, add/delete (now a real DB delete), overlap finder, and AI redundancy analysis via the `analyse-tags` edge function — then redesigned it into a tabbed layout and fixed several mobile issues (tab-bar overflow, new-tag highlight+scroll, a global mobile dialog-sizing fix in the base `Dialog` component). Separately: shipped Add-highlight-from-BookDetail, a delete-highlight button, duplicate-ISBN detection, and a single-click Change-book bug fix in the book-addition flow.

### Key decisions
- 3 rounds of security review on the `merge_tags`/`preview_tag_merge` SQL migration caught: Postgres grants `EXECUTE` to `PUBLIC` by default on new functions (unlike tables) — a narrower `GRANT` alone doesn't close this, needs explicit `REVOKE FROM PUBLIC` too. Now a permanent critical-rules entry.
- Dialog mobile-width gutter fixed once in the base `dialog.tsx` component (`w-full` → `w-[calc(100%-2rem)]`) rather than per-dialog — applies app-wide.

### Open threads
- [ ] `handleRename` in AdminTagManagement updates `highlights.tags` but doesn't rename the row in `public.tags` — orphaned old name lingers (delete was fixed, rename wasn't).
- [ ] README.md is ~3-4 sessions behind actual shipped code (missing edge functions, admin pages, stale RPC list) — audited this session, not yet fixed.
- [ ] No real backlog artifact exists — CHANGELOG's `### Deferred` section is the closest thing; agreed to upgrade it to one-line what/why-not/blocked-on entries.

### Artifacts
- `src/pages/AdminTagManagement.tsx` (new), `src/hooks/useAllTags.ts` (rewritten), `src/components/ui/dialog.tsx` (base fix)

---
