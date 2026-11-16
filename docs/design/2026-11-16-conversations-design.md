# Glean conversations — design and staged backlog (2026-11-16)

Status: approved 2026-11-16. Stages are the dev backlog, built one at a time via Cursor (Lovable only for the two edge-function deploys).

## Intent and why
Glean today talks *at* Vardan once: search gives one answer, Think! shows one prompt. Two losses follow. (1) When an answer is good but his question had more nuance, he can't add context and get a better answer — he re-searches from scratch. (2) When a highlight needs his perspective ("this misses something"), the thought strikes unbidden while reading anywhere in the app, and there's no one-tap way to capture it — so his voice is being lost. Notes feed the embeddings, so every captured note also improves future search: a flywheel.

## Goals
- Refine a search answer by adding context, conversationally, grounded in the library.
- Capture Vardan's voice as highlight notes with one tap from any highlight card.
- Think!'s sparring value absorbed into the app's flow; its dataset bug fixed.
- Conversations can end by leaving a distilled note, in Vardan's words, on a highlight.

## Non-goals
- A general chatbot. Fresh topics stay as new searches.
- A deliberate "reflection session" ritual. Capture is in-flow, unbidden.
- Multi-user note-taking (would need a user_highlight_notes join table — someday, not now).
- Cross-device conversation continuity (sessionStorage is fine).

## Anti-goals (failure even if it works)
- A second parallel way of writing notes that conflicts with the one edit-highlight routine.
- AI phrasing creeping into "his" notes — distilled notes must stay in his words, editable before save.
- Anything that auto-fires AI calls without an explicit user tap.
- More panels/buttons on Admin Hub.

## Constraints
- Lovable credits scarce: build in Cursor; Lovable only for edge-function deploys (two, in Stages 2 and 3).
- `synthesise-wisdom` is shared by search, Idea Forge and Opponent mode — refinement is a new `mode: "refine"` branch; existing paths untouched.
- The 5-section search answer and its parser (`parseSynthesisSections`) stay as-is for turn 1.
- One editor routine: capture reuses `HighlightEditPanel` (compact note-only mode via prop), same mutation, drafts and `refreshFingerprintAfterEdit` pipeline.
- Admin Studio / User Studio keep their own inlined edit panels (duplicates, out of scope).

## Approaches considered
1. **Three independent small features** (fixed-set refinement, full-editor capture, dataset fix): quickest, but refinement can't improve recommendations (same highlights re-emphasized) and capture pieces get reworked when distillation arrives.
2. **Staged convergence (chosen):** one conversation-and-capture architecture, shipped in three self-contained stages; nothing thrown away later.
Never re-retrieving on follow-ups was rejected: the core want is *better recommendations given more context*. Instead, the model rewrites the question with the new context folded in, retrieval re-runs on the rewritten query, and new matches merge with the originals (avoids raw vector search on critique text pulling off-topic quotes).

## Stage 1 — Capture + Think! dataset fix (Cursor only)
- `HighlightCard`: visible "Add my take" affordance (admin/owner only; today there is no hint when a note is absent, only a collapsed Note chevron when one exists). Appears on all surfaces using HighlightCard: search results, book pages, topics, saved, Inspire Me.
- `HighlightEditPanel`: new `mode: "full" | "note-only"` prop. Note-only renders the quote read-only, the notes textarea focused, and Save; identical updateMutation, draft keys and embedding refresh. Tests on both modes.
- Think! dataset: remove `.eq("source","curated")` so all highlights qualify, and replace the unordered `.limit(300)` (which always returns the same earliest rows) with genuinely random selection across the library.
- Service worker bump.

## Stage 2 — Search refinement (Cursor + one Lovable deploy)
- UI: a card footer under the synthesis ("Tell Glean what's missing or specific to your situation…", button "Refine"), reading as an adjustment to this answer, not a chatbot. Refined answer replaces/threads under the synthesis; supporting highlights list below stays stable, with top-up matches added visibly.
- State: sessionStorage keyed on the query (pattern from Think.tsx); no new tables.
- Edge: `mode: "refine"` in synthesise-wisdom — takes conversation history (query → synthesis → critique), rewrites the question with context folded in, re-runs embedding + match_highlights on the rewritten query, merges new matches with the original set, answers conversationally (no rigid 5 headers on refinement turns).
- Credit guards: fires only on tap; button disabled in flight; max 3 refinement turns per search; no auto-retry.

## Stage 3 — Absorb Think! (Cursor + one Lovable deploy)
- "Spar with this" contextual action on highlight cards, reusing Opponent personas and prompts.
- End of a spar or refinement chat: "Save as note on this highlight" — model drafts a distilled note in Vardan's words from his side of the conversation; he edits in the Stage 1 note-only editor before save; embeddings refresh.
- Retire the /think random picker (keep or simplify the page as entry point; Vardan decides at stage time).
- think_sessions logging continues for spar.

## Risks and mitigations
- Runaway AI calls from bugs (loops, retries, double-taps) → tap-only firing, in-flight disable, 3-turn cap, no auto-retry.
- Shared synthesise-wisdom regression → new mode branch only; test forge/opponent/search turn-1 after deploy.
- HighlightEditPanel regressions (it's mounted in overlap review too) → prop-gated, tests both modes.
- Random selection performance on ~1,513 rows is a non-issue now; revisit if library grows 10x.
- Costs: refinement turn ≈ 0.003 credits; note save = one embedding call; spar ≈ current Opponent cost. Negligible against the 4-credit monthly grant.

## Left to the builder
- Exact placement/icon of "Add my take" on the card's bottom row; sheet vs drawer on phones (follow existing patterns).
- Random-pick mechanism (client shuffle of ids vs random offset) — simplest that is truly uniform.
- Refinement thread UI detail (in-place replace vs stacked turns) — propose at Stage 2 with diff.
- Query-rewrite prompt wording.

## Workflow (standing)
Per stage: one combined Cursor pass, diff shown, tsc/ESLint/build/tests, push on "go", Lovable publish; phone test checklist per stage. Service worker bump each stage.
