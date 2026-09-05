# Glean — Personal Wisdom Search

A personal wisdom search app that surfaces relevant book
highlights when you need them. Search by describing your
challenge, get curated wisdom from 100+ books, download
a reflection worksheet, and think through your beliefs
with AI.

**Live app:** https://glean-wisdom-from-books.lovable.app

---

## What Glean does

- **Search** — describe a challenge, surface relevant
  highlights from a curated library of 100+ books
- **Synthesise** — AI synthesis of relevant wisdom,
  backed by real book passages
- **Think!** — Forge your thinking or stress-test beliefs
  against your library (Forge + Opponent modes)
- **Import** — Import Kindle highlights or add manually
- **Worksheet** — Download a reflection PDF for any search

---

## Tech stack

- **Frontend:** React + TypeScript + Tailwind CSS (Lovable)
- **Database:** Supabase (Postgres + pgvector)
- **Auth:** Google OAuth via Supabase
- **Embeddings:** Gemini gemini-embedding-001 (768 dimensions)
- **Edge functions:** Supabase (deployed via Lovable)
- **PDF generation:** jsPDF (client-side)
- **Local dev:** Vite + Node.js

---

## Development setup

```sh
# Clone the repo
git clone https://github.com/vardanmathur/glean-wisdom-search.git
cd glean-wisdom-search

# Install dependencies
npm install

# Start local dev server
npm run dev
# App runs at http://localhost:8080
```

**Tool routing:**
- **Lovable** — multi-file changes, new features,
  edge function deploys, Supabase migrations
- **Cursor / Claude Code** — single-file edits,
  CSS tweaks, no DB changes

---

## Key architecture notes

- Never select("*") on highlights table —
  embedding column (vector 768d) will kill performance
- Tags stored in DB as Title Case — canonical list
  in src/lib/tags.ts (66 tags)
- Book insert happens at highlight save time only —
  never during ISBN lookup (prevents orphaned books)
- Edge functions deployed via Lovable only —
  Lovable owns the Supabase org
- SW cache: bump CACHE_NAME in public/sw.js
  for major releases (current: glean-v20)
- search_logs table captures all searches —
  anonymous, fire-and-forget INSERT from SearchResults

---

## Project structure

```
src/
  components/       # Shared UI components
  components/admin/ # Admin-only components
  components/studio/# Studio (highlight creation) components
  components/ui/    # shadcn/ui components
  context/          # Auth context
  hooks/            # Custom hooks (useIsAdmin, useAuthGate etc.)
  integrations/     # Supabase client + generated types
  lib/              # Core logic (data.ts, tags.ts, utils.ts etc.)
  pages/            # Route-level page components
supabase/
  functions/        # Edge functions
public/
  sw.js             # Service worker
  sitemap.xml       # Static sitemap (regenerate with npm run sitemap)
scripts/
  generate-sitemap.mjs # Sitemap generator
```

---

## Edge functions

| Function | Purpose | Auth |
|----------|---------|------|
| search-semantic | pgvector semantic search | public |
| synthesise-wisdom | AI synthesis + Think! usage tracking | public |
| generate-embeddings | Gemini embedding generation | admin |
| generate-topic-summary | AI topic summaries (6mo cache) | public |
| generate-book-summary | AI book summaries (6mo cache) | public |
| generate-reflection-questions | Worksheet coaching questions | public |
| suggest-tags | LLM-based tag suggestion (Gemini) | public |

---

## Admin pages

All admin pages require the admin role via has_role() RPC.
Access via /admin hub:

| Page | Path | Purpose |
|------|------|---------|
| Admin Hub | /admin | Landing page for all admin tools |
| Admin Studio | /admin/studio/highlights | Edit highlights, tags, embeddings |
| Books | /admin/books | Manage book catalogue and covers |
| Permissions | /admin/permissions | User access management |
| Worksheets | /admin/worksheets | View downloaded worksheets |
| Search Logs | /admin/search-logs | Search query analytics |

---

## Database tables

| Table | Purpose |
|-------|---------|
| highlights | Core content — quotes, tags, embeddings |
| books | Book metadata, covers, ISBNs |
| book_summaries | AI summaries, 6mo cache |
| topic_summaries | AI topic summaries, 6mo cache |
| search_logs | All search queries, anonymous |
| think_sessions | Think! session history |
| think_usage | Daily Think! usage per user |
| think_config | Per-user Think! daily limits |
| worksheet_downloads | Worksheet PDF download log |
| user_roles | RBAC — admin role assignments |
| user_profiles | Display names |
| saved_highlights | Per-user highlight saves |
| feedback | Thumbs up/down per highlight |

---

## Supabase reference

- **Project ref:** bynjngujlvgcchirmnea
- **Storage bucket:** worksheets (private)
- **Key RPCs:** has_role(), match_highlights(),
  increment_think_usage(), suggest_tags_for_quote()

---

## Sitemap regeneration

After adding books, tags, or topics:
```sh
npm run sitemap
```
Regenerates public/sitemap.xml with current books
and topic URLs.

---

## Design standards

See GLEAN_DESIGN_STANDARDS.md (in Claude Project files)
for full UI patterns, mobile rules, component patterns,
and Lovable prompt checklist.

---

*Built by Vardan Mathur · February 2026*
