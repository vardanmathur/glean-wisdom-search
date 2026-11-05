import { supabase } from "@/integrations/supabase/client";

// Silent background caching of book covers into our own storage (edge function cache-book-cover).
// SQL record: docs/sql/2026-11-05_cover_cache.sql

export interface CoverFields {
  sourceUrl?: string | null;
  cachedUrl?: string | null;
  cachedFrom?: string | null;
}

// The stored copy is only trusted while it was made from the book's current original cover.
export function isCacheCurrent({ sourceUrl, cachedUrl, cachedFrom }: CoverFields): boolean {
  return !!cachedUrl && !!sourceUrl && cachedFrom === sourceUrl;
}

// A book needs the function when it has an original that is not cached yet (or the cache is stale),
// or when the original is gone but a stored copy is still recorded.
export function needsCaching(fields: CoverFields): boolean {
  if (fields.sourceUrl) return !isCacheCurrent(fields);
  return !!(fields.cachedUrl || fields.cachedFrom);
}

// What to try, in order, before falling back to the placeholder.
export function coverCandidates(fields: CoverFields): string[] {
  const out: string[] = [];
  if (isCacheCurrent(fields)) out.push(fields.cachedUrl as string);
  if (fields.sourceUrl) out.push(fields.sourceUrl);
  return out;
}

const PLACEHOLDER_TONES = [
  "bg-primary/15 text-primary",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
];

// Same title, same colour every time.
export function placeholderTone(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_TONES[hash % PLACEHOLDER_TONES.length];
}

// ---------- queue ----------

export interface CoverQueueOptions {
  batchSize?: number;
  concurrency?: number;
  batchWindowMs?: number;
}

// Ids are requested at most once per page load, sent in batches, with a cap on calls in flight.
// It never throws: failures go to the console and the id is not retried this session.
export function createCoverQueue(send: (bookIds: string[]) => Promise<unknown>, options: CoverQueueOptions = {}) {
  const batchSize = options.batchSize ?? 10;
  const concurrency = options.concurrency ?? 2;
  const batchWindowMs = options.batchWindowMs ?? 150;

  const seen = new Set<string>();
  const pending: string[] = [];
  let running = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const pump = () => {
    while (running < concurrency && pending.length > 0) {
      const batch = pending.splice(0, batchSize);
      running++;
      Promise.resolve()
        .then(() => send(batch))
        .catch((err) => console.error("[cover-cache] request failed", err))
        .finally(() => {
          running--;
          pump();
        });
    }
  };

  return {
    enqueue(bookId: string) {
      if (!bookId || seen.has(bookId)) return;
      seen.add(bookId);
      pending.push(bookId);
      // Wait a moment so covers that render together go out in one batch.
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          pump();
        }, batchWindowMs);
      }
    },
    flushNow() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pump();
    },
    stats: () => ({ pending: pending.length, running, seen: seen.size }),
  };
}

async function callCacheFunction(bookIds: string[]) {
  const { error } = await supabase.functions.invoke("cache-book-cover", { body: { book_ids: bookIds } });
  if (error) throw error;
}

const sessionQueue = createCoverQueue(callCacheFunction);

// Fire-and-forget. Only admins should call this (the function is admin-only).
export function queueCoverCache(bookId: string): void {
  sessionQueue.enqueue(bookId);
}
