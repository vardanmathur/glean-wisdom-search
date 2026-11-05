import { supabase } from "@/integrations/supabase/client";
import type { Highlight } from "@/lib/data";

// Inspire Me: the database picks the least-shown public highlight (random tie-break) and records
// the show; we then fetch its details under normal access rules. If the pick fails (function not
// deployed, error), fall back to the old random-offset method.
// SQL record: docs/sql/2026-11-05_inspire_stats.sql

export interface InspireRow {
  id: string;
  quote: string;
  tags: string[] | null;
  my_notes: string | null;
  source: string | null;
  visibility: string | null;
  user_id: string | null;
  book_id: string | null;
  books: { title: string | null; author: string | null; cover_image_url: string | null } | null;
  user_profiles: { display_name: string | null } | null;
}

export const INSPIRE_SELECT =
  "id, quote, tags, my_notes, source, visibility, user_id, book_id, books(title, author, cover_image_url), user_profiles(display_name)";

export function rowToHighlight(row: InspireRow): Highlight {
  return {
    id: row.id,
    text: row.quote,
    bookTitle: row.books?.title || "Unknown",
    author: row.books?.author || "Unknown",
    tags: row.tags || [],
    bookId: row.book_id ?? undefined,
    coverImageUrl: row.books?.cover_image_url ?? undefined,
    myNotes: row.my_notes || undefined,
    source: row.source || "curated",
    userId: row.user_id || undefined,
    displayName: row.user_profiles?.display_name || undefined,
    visibility: (row.visibility as "public" | "private") || undefined,
  };
}

// Uniform integer in [0, count), safe even if rand() returns exactly 1.
export function randomOffset(count: number, rand: () => number = Math.random): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.floor(rand() * count));
}

// The embedded stats row can arrive as an object, a one-element array, or null (never shown).
export function inspireShows(embed: unknown): number {
  const row = Array.isArray(embed) ? embed[0] : embed;
  const n = row && typeof row === "object" ? Number((row as { times_shown?: unknown }).times_shown) : 0;
  return Number.isFinite(n) ? n : 0;
}

// ---------- RPC wrappers ----------

type RpcResponse = { data: unknown; error: { message: string } | null };

async function callRpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const client = supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<RpcResponse> };
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

// Picks the next highlight id and records the show. Private highlights stay out unless asked for.
export async function pickInspireId(avoidBookId: string | null, includePrivate = false): Promise<string | null> {
  const data = await callRpc("pick_inspire_highlight", {
    p_avoid_book_id: avoidBookId,
    p_include_private: includePrivate,
  });
  return typeof data === "string" ? data : null;
}

async function fetchRowById(id: string): Promise<InspireRow> {
  const { data, error } = await supabase.from("highlights").select(INSPIRE_SELECT).eq("id", id).single();
  if (error || !data) throw error ?? new Error("no row");
  return data as unknown as InspireRow;
}

// The old method: count the public highlights, jump to a random offset. Ordered by id so the
// count and the offset refer to the same sequence.
async function fetchRandomRow(): Promise<InspireRow> {
  const { count, error: countErr } = await supabase
    .from("highlights")
    .select("id", { count: "exact", head: true })
    .eq("visibility", "public");
  if (countErr || !count) throw countErr ?? new Error("no highlights");
  const offset = randomOffset(count);
  const { data, error } = await supabase
    .from("highlights")
    .select(INSPIRE_SELECT)
    .eq("visibility", "public")
    .order("id", { ascending: true })
    .range(offset, offset)
    .single();
  if (error || !data) throw error ?? new Error("no row");
  return data as unknown as InspireRow;
}

export async function loadInspireHighlight(avoidBookId: string | null): Promise<Highlight> {
  let id: string | null = null;
  try {
    id = await pickInspireId(avoidBookId);
  } catch (err) {
    console.warn("[inspire] pick failed, using the random fallback", err);
  }
  const row = id ? await fetchRowById(id) : await fetchRandomRow();
  return rowToHighlight(row);
}

// ---------- admin coverage ----------

export interface InspireSummary {
  public_total: number;
  shown_at_least_once: number;
  never_shown: number;
  min_shown: number;
  max_shown: number;
  total_shows: number;
}

export async function fetchInspireSummary(): Promise<InspireSummary> {
  const data = await callRpc("inspire_stats_summary");
  const r = ((Array.isArray(data) ? data[0] : data) ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => Number(v ?? 0) || 0;
  return {
    public_total: n(r.public_total),
    shown_at_least_once: n(r.shown_at_least_once),
    never_shown: n(r.never_shown),
    min_shown: n(r.min_shown),
    max_shown: n(r.max_shown),
    total_shows: n(r.total_shows),
  };
}

export function describeInspireCoverage(s: InspireSummary): { headline: string; detail: string; percent: number } {
  const percent = s.public_total > 0 ? Math.round((s.shown_at_least_once / s.public_total) * 100) : 0;
  return {
    headline: `Shown at least once: ${s.shown_at_least_once} of ${s.public_total}`,
    detail: `${s.never_shown} never shown · shown ${s.min_shown} to ${s.max_shown} times each · ${s.total_shows} shows in total`,
    percent,
  };
}
