import { supabase } from "@/integrations/supabase/client";

// Typed wrappers for the admin-only tag-overlap RPCs. They are not in the generated
// src/integrations/supabase/types.ts, so the calls go through one untyped helper here.
// SQL record: docs/sql/2026-10-23_tag_overlap_review.sql

export interface TagUsage {
  tag: string;
  highlight_count: number;
  in_taxonomy: boolean;
}

export interface TagOverlapPair {
  tag_a: string;
  tag_b: string;
  count_a: number;
  count_b: number;
  shared: number;
  to_review: number;
  share_of_smaller: number;
  meaning_similarity: number | null;
}

export interface TagOverlapHighlight {
  highlight_id: string;
  quote: string;
  my_notes: string | null;
  tags: string[];
  book_title: string;
  book_author: string;
  fit_a: number | null;
  fit_b: number | null;
}

export interface OverlapResult {
  success: boolean;
  tags: string[];
  error?: string;
}

type RpcResponse = { data: unknown; error: { message: string } | null };

async function callRpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const client = supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<RpcResponse> };
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function fetchTagUsage(): Promise<TagUsage[]> {
  const rows = ((await callRpc("tag_usage_counts")) ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    tag: String(r.tag),
    highlight_count: num(r.highlight_count),
    in_taxonomy: Boolean(r.in_taxonomy),
  }));
}

export async function fetchOverlapPairs(minShared = 5, expiryMonths = 12): Promise<TagOverlapPair[]> {
  const rows = ((await callRpc("tag_overlap_pairs", {
    min_shared: minShared,
    expiry_months: expiryMonths,
  })) ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    tag_a: String(r.tag_a),
    tag_b: String(r.tag_b),
    count_a: num(r.count_a),
    count_b: num(r.count_b),
    shared: num(r.shared),
    to_review: num(r.to_review),
    share_of_smaller: num(r.share_of_smaller),
    meaning_similarity: numOrNull(r.meaning_similarity),
  }));
}

export async function fetchOverlapHighlights(tagA: string, tagB: string, expiryMonths = 12): Promise<TagOverlapHighlight[]> {
  const rows = ((await callRpc("tag_overlap_highlights", {
    p_tag_a: tagA,
    p_tag_b: tagB,
    expiry_months: expiryMonths,
  })) ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    highlight_id: String(r.highlight_id),
    quote: String(r.quote ?? ""),
    my_notes: (r.my_notes as string | null) ?? null,
    tags: (r.tags as string[] | null) ?? [],
    book_title: String(r.book_title ?? ""),
    book_author: String(r.book_author ?? ""),
    fit_a: numOrNull(r.fit_a),
    fit_b: numOrNull(r.fit_b),
  }));
}

function toResult(data: unknown): OverlapResult {
  const d = (data ?? {}) as { success?: boolean; tags?: string[]; error?: string };
  if (d.success) return { success: true, tags: d.tags ?? [] };
  return { success: false, tags: [], error: d.error ?? "Something went wrong" };
}

// removeTag = null keeps both tags and records the decision.
export async function resolveOverlap(highlightId: string, tagA: string, tagB: string, removeTag: string | null): Promise<OverlapResult> {
  return toResult(
    await callRpc("resolve_tag_overlap", {
      p_highlight_id: highlightId,
      p_tag_a: tagA,
      p_tag_b: tagB,
      p_remove_tag: removeTag,
    }),
  );
}

export async function undoOverlap(highlightId: string, tagA: string, tagB: string): Promise<OverlapResult> {
  return toResult(
    await callRpc("undo_tag_overlap", { p_highlight_id: highlightId, p_tag_a: tagA, p_tag_b: tagB }),
  );
}

// ---------- pure helpers (unit-tested) ----------

const FIT_GAP = 0.02;

export function fitHint(fitA: number | null, fitB: number | null, nameA: string, nameB: string): string {
  if (fitA === null || fitB === null) return "No fingerprint to compare";
  if (Math.abs(fitA - fitB) < FIT_GAP - 1e-9) return "Both fit similarly";
  return `Reads more like ${fitA > fitB ? nameA : nameB}`;
}

export function sharePercent(shareOfSmaller: number): number {
  return Math.round(shareOfSmaller * 100);
}

// Tags with no highlights, and tags used on highlights but missing from the taxonomy.
export function splitUnusedUnlisted<T extends { count: number; inTaxonomy: boolean }>(rows: T[]): { unused: T[]; unlisted: T[] } {
  return {
    unused: rows.filter((r) => r.count === 0),
    unlisted: rows.filter((r) => r.count > 0 && !r.inTaxonomy),
  };
}

// One-highlight-at-a-time review queue.
export interface ReviewState {
  items: TagOverlapHighlight[];
  pos: number;
  decided: { index: number; removed: string | null }[];
  skipped: number;
}

export const initReview = (items: TagOverlapHighlight[]): ReviewState => ({ items, pos: 0, decided: [], skipped: 0 });

export const isReviewDone = (s: ReviewState): boolean => s.pos >= s.items.length;

// Record a decision on the current card (removed = the tag taken off, or null for keep both).
export function decideCurrent(s: ReviewState, removed: string | null): ReviewState {
  const item = s.items[s.pos];
  if (!item) return s;
  const items = s.items.slice();
  items[s.pos] = removed ? { ...item, tags: item.tags.filter((t) => t !== removed) } : item;
  return { ...s, items, pos: s.pos + 1, decided: [...s.decided, { index: s.pos, removed }] };
}

export function skipCurrent(s: ReviewState): ReviewState {
  if (isReviewDone(s)) return s;
  return { ...s, pos: s.pos + 1, skipped: s.skipped + 1 };
}

// Take back the last decision: bring that card back with the tags the database returned.
export function undoLast(s: ReviewState, restoredTags: string[]): ReviewState {
  const last = s.decided[s.decided.length - 1];
  if (!last) return s;
  const items = s.items.slice();
  items[last.index] = { ...items[last.index], tags: restoredTags };
  return { ...s, items, pos: last.index, decided: s.decided.slice(0, -1) };
}
