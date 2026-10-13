// ============================================================================
// Kindle parsing — pure functions
// ============================================================================

export type ParsedHighlight = {
  quote: string;
  book_title: string;
  author: string | null;
  author_unknown: boolean;
  kindle_location: string | null;
  kindle_timestamp: Date | null;
  my_notes: string | null;
  entry_type: "Highlight" | "Note" | "Bookmark";
};

export type StagingStatus = "pending" | "near_duplicate" | "similar" | "skipped";

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

export function parseKindleDate(raw: string): Date | null {
  const trimmed = raw.trim();
  const commaIdx = trimmed.indexOf(",");
  if (commaIdx === -1) return null;
  const afterWeekday = trimmed.slice(commaIdx + 1).trim();
  const firstToken = afterWeekday.split(/\s+/)[0];
  if (!firstToken) return null;

  try {
    if (/^[A-Za-z]+$/.test(firstToken)) {
      const m = afterWeekday.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
      if (!m) return null;
      const month = MONTHS[m[1].toLowerCase()];
      if (month === undefined) return null;
      const day = parseInt(m[2], 10);
      const year = parseInt(m[3], 10);
      let hour = parseInt(m[4], 10);
      const min = parseInt(m[5], 10);
      const sec = parseInt(m[6], 10);
      const ampm = m[7].toUpperCase();
      if (ampm === "PM" && hour < 12) hour += 12;
      if (ampm === "AM" && hour === 12) hour = 0;
      return new Date(year, month, day, hour, min, sec);
    } else {
      const m = afterWeekday.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
      if (!m) return null;
      const day = parseInt(m[1], 10);
      const month = MONTHS[m[2].toLowerCase()];
      if (month === undefined) return null;
      const year = parseInt(m[3], 10);
      const hour = parseInt(m[4], 10);
      const min = parseInt(m[5], 10);
      const sec = parseInt(m[6], 10);
      return new Date(year, month, day, hour, min, sec);
    }
  } catch {
    return null;
  }
}

// Reverses "Last, First" → "First Last" for any string matching the simple
// pattern of exactly two comma-separated non-empty parts. Returns null otherwise.
export function reverseIfCommaName(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  // Must contain exactly one comma producing two non-empty parts.
  const parts = trimmed.split(",");
  if (parts.length !== 2) return null;
  const last = parts[0].trim();
  const first = parts[1].trim();
  if (!last || !first) return null;
  return `${first} ${last}`;
}

// Final safety-net pass: applied to every author string before it's returned,
// regardless of which pattern matched. Guarantees no "Last, First" form leaks through.
export function normalizeAuthor(author: string | null): string | null {
  if (!author) return author;
  const reversed = reverseIfCommaName(author);
  return reversed ?? author.trim();
}

export function parseTitleAndAuthor(rawTitle: string): { title: string; author: string | null; unknown: boolean } {
  const t = rawTitle.trim();

  // Pattern 1: "Title (Author)" or "Title (Last, First)"
  const p1 = t.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (p1) {
    const inside = p1[2].trim();
    if (inside.length > 0) {
      return { title: p1[1].trim(), author: normalizeAuthor(inside), unknown: false };
    }
  }

  // Pattern 2: "Title by Author"
  // Greedy left + lazy right ensures we split on the LAST " by " — so titles
  // ending in "By" (e.g. "Title Ending In By by Surname, First") parse correctly.
  const p2 = t.match(/^(.+)\s+by\s+(.+?)$/i);
  if (p2) {
    return { title: p2[1].trim(), author: normalizeAuthor(p2[2].trim()), unknown: false };
  }

  // Pattern 3: dash- or colon-separated "Title - Last, First" or "Last, First - Title"
  // Try splitting on " - " or " : " (with spaces, to avoid breaking hyphenated titles)
  for (const sep of [" - ", " — ", " : "]) {
    const idx = t.lastIndexOf(sep);
    if (idx > 0) {
      const left = t.slice(0, idx).trim();
      const right = t.slice(idx + sep.length).trim();
      // Try right side as comma-name
      const rightReversed = reverseIfCommaName(right);
      if (rightReversed) {
        return { title: left, author: normalizeAuthor(rightReversed), unknown: false };
      }
      // Try left side as comma-name (author prefix)
      const leftReversed = reverseIfCommaName(left);
      if (leftReversed) {
        return { title: right, author: normalizeAuthor(leftReversed), unknown: false };
      }
    }
  }

  // Pattern 4: bare "Last, First" with no title context — treat as unknown title,
  // but at least don't store the comma-form verbatim if it's clearly a name.
  const bareReversed = reverseIfCommaName(t);
  if (bareReversed) {
    return { title: t, author: normalizeAuthor(bareReversed), unknown: false };
  }

  return { title: t, author: null, unknown: true };
}

export function parseClippings(contents: string): {
  highlights: ParsedHighlight[];
  oversizedCount: number;
  malformedCount: number;
} {
  const normalized = contents.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split("==========");
  const highlights: ParsedHighlight[] = [];
  let oversizedCount = 0;
  let malformedCount = 0;

  for (const rawBlock of blocks) {
    const block = rawBlock.replace(/\uFEFF/g, "").trim();
    if (!block) continue;

    try {
      const dashIdx = block.indexOf("\n- ");
      if (dashIdx === -1) { malformedCount++; continue; }
      const titleLine = block.slice(0, dashIdx).trim();
      const rest = block.slice(dashIdx + 3);

      if (!titleLine || /^your clippings$/i.test(titleLine)) {
        continue;
      }

      const pipeIdx = rest.lastIndexOf(" | ");
      if (pipeIdx === -1) { malformedCount++; continue; }
      const metaLeft = rest.slice(0, pipeIdx);
      const metaRight = rest.slice(pipeIdx + 3);

      const onIdx = metaLeft.indexOf(" on ");
      if (onIdx === -1) { malformedCount++; continue; }
      const typePrefix = metaLeft.slice(0, onIdx).trim();
      const location = metaLeft.slice(onIdx + 4).trim();

      const typeMatch = typePrefix.match(/^[A-Za-z]+\s+(Highlight|Note|Bookmark)/i);
      if (!typeMatch) { malformedCount++; continue; }
      const entryType = (typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1).toLowerCase()) as
        | "Highlight" | "Note" | "Bookmark";

      const splitIdx = metaRight.indexOf("\n\n");
      if (splitIdx === -1) { malformedCount++; continue; }
      const timeData = metaRight.slice(0, splitIdx);
      const quote = metaRight.slice(splitIdx + 2).trim();

      const addedIdx = timeData.indexOf("Added on");
      if (addedIdx === -1) { malformedCount++; continue; }
      const dateStr = timeData.slice(addedIdx + "Added on".length).trim();
      const kindleTimestamp = parseKindleDate(dateStr);

      const { title, author, unknown } = parseTitleAndAuthor(titleLine);

      if (!title) continue;

      if (entryType === "Highlight") {
        if (!quote || quote.length < 10) continue;
        if (quote.length > 1500) {
          oversizedCount++;
          continue;
        }
      }

      highlights.push({
        quote,
        book_title: title,
        author,
        author_unknown: unknown,
        kindle_location: location || null,
        kindle_timestamp: kindleTimestamp,
        my_notes: null,
        entry_type: entryType,
      });
    } catch {
      malformedCount++;
    }
  }

  return { highlights, oversizedCount, malformedCount };
}

export const NOTE_CHAIN_GAP_MS = 60_000;

const isWordChar = (ch: string) => /[\p{L}\p{N}_]/u.test(ch);

function extendsNoteText(later: string, earlier: string): boolean {
  const prefix = earlier.trimEnd();
  if (prefix.length === 0 || !later.startsWith(prefix)) return false;
  return prefix.length === later.length || !isWordChar(later[prefix.length]);
}

export function collapseNoteChains(entries: ParsedHighlight[]): ParsedHighlight[] {
  const kept: (ParsedHighlight | null)[] = [];
  const survivorsByKey = new Map<string, number[]>();

  for (const e of entries) {
    if (e.entry_type !== "Note" || !e.kindle_location) {
      kept.push(e);
      continue;
    }
    const key = JSON.stringify([e.book_title, e.kindle_location]);
    const survivors = (survivorsByKey.get(key) ?? []).filter((idx) => kept[idx] !== null);
    const eTs = e.kindle_timestamp ? e.kindle_timestamp.getTime() : null;

    survivors.forEach((idx, pos) => {
      const prev = kept[idx];
      const prevTs = prev?.kindle_timestamp ? prev.kindle_timestamp.getTime() : null;
      if (!prev || eTs === null || prevTs === null || eTs < prevTs) return;
      const withinGap = pos === survivors.length - 1 && eTs - prevTs <= NOTE_CHAIN_GAP_MS;
      if (withinGap || extendsNoteText(e.quote, prev.quote)) kept[idx] = null;
    });

    survivorsByKey.set(key, [...survivors.filter((idx) => kept[idx] !== null), kept.length]);
    kept.push(e);
  }
  return kept.filter((e): e is ParsedHighlight => e !== null);
}

export function attachNotesAndFilter(rawEntries: ParsedHighlight[]): ParsedHighlight[] {
  const entries = collapseNoteChains(rawEntries);
  const result: ParsedHighlight[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.entry_type === "Bookmark") continue;
    if (e.entry_type === "Note") {
      const last = result[result.length - 1];
      if (last && last.entry_type === "Highlight" && last.book_title === e.book_title) {
        last.my_notes = last.my_notes ? `${last.my_notes}\n${e.quote}` : e.quote;
      }
      continue;
    }
    result.push({ ...e });
  }
  return result;
}

// ============================================================================
// Duplicate detection
// ============================================================================

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Pre-staged row carries a temp client id so we can reference duplicates within the file
export type StagingRowDraft = {
  client_id: string;
  quote: string;
  book_title: string;
  author: string | null;
  kindle_location: string | null;
  kindle_timestamp: Date | null;
  my_notes: string | null;
  status: StagingStatus;
  duplicate_of_client_id: string | null; // refs another client_id in this batch (Level 1)
};

export type Detected = {
  rows: StagingRowDraft[];
  exactDuplicatesRemoved: number;
  flaggedCount: number;
};

export function detectDuplicatesLevel1(highlights: ParsedHighlight[]): Detected {
  // Step A: exact dedup — keep most recent
  const exactMap = new Map<string, ParsedHighlight>();
  let exactRemoved = 0;
  for (const h of highlights) {
    const key = `${h.book_title}\u0000${h.quote}`;
    const existing = exactMap.get(key);
    if (!existing) {
      exactMap.set(key, h);
    } else {
      exactRemoved++;
      const exTs = existing.kindle_timestamp?.getTime() ?? 0;
      const hTs = h.kindle_timestamp?.getTime() ?? 0;
      if (hTs > exTs) exactMap.set(key, h);
    }
  }
  const deduped = Array.from(exactMap.values());

  // Build draft rows with client ids
  const drafts: StagingRowDraft[] = deduped.map((h) => ({
    client_id: crypto.randomUUID(),
    quote: h.quote,
    book_title: h.book_title,
    author: h.author,
    kindle_location: h.kindle_location,
    kindle_timestamp: h.kindle_timestamp,
    my_notes: h.my_notes,
    status: "pending",
    duplicate_of_client_id: null,
  }));

  // Bucket by book_title (case-insensitive)
  const buckets = new Map<string, StagingRowDraft[]>();
  for (const d of drafts) {
    const key = d.book_title.toLowerCase();
    const arr = buckets.get(key) ?? [];
    arr.push(d);
    buckets.set(key, arr);
  }

  // Trigram buckets per row, computed lazily (see the trigram check further down).
  const grams = new Map<StagingRowDraft, Uint16Array>();
  const gramsOf = (d: StagingRowDraft) => {
    let g = grams.get(d);
    if (!g) {
      g = trigramBuckets(d.quote);
      grams.set(d, g);
    }
    return g;
  };

  let flagged = 0;
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    // Sort by quote length descending — longer wins
    list.sort((a, b) => b.quote.length - a.quote.length);

    for (let i = 0; i < list.length; i++) {
      const winner = list[i];
      if (winner.status !== "pending") continue;
      const winnerGrams = gramsOf(winner);
      loadGramTable(winnerGrams);
      try {
        for (let j = i + 1; j < list.length; j++) {
          const candidate = list[j];
          if (candidate.status !== "pending") continue;

          const a = winner.quote;
          const b = candidate.quote;

          // Substring match
          if (a.includes(b)) {
            candidate.status = "near_duplicate";
            candidate.duplicate_of_client_id = winner.client_id;
            flagged++;
            continue;
          }

          // Length pre-filter for Levenshtein
          const maxLen = Math.max(a.length, b.length);
          const minLen = Math.min(a.length, b.length);
          if (maxLen === 0) continue;
          if ((maxLen - minLen) / maxLen > 0.15) continue;

          // Exact pre-filter and banded distance: same decisions as the full edit distance, far less work.
          const maxDist = Math.ceil(0.15 * maxLen);
          const needed = maxLen - 2 - 3 * maxDist;
          if (needed > 0 && sharedGramCount(gramsOf(candidate), needed) < needed) continue;

          const dist = levenshteinWithin(a, b, maxDist);
          const sim = 1 - dist / maxLen;
          if (sim > 0.85) {
            candidate.status = "near_duplicate";
            candidate.duplicate_of_client_id = winner.client_id;
            flagged++;
          }
        }
      } finally {
        clearGramTable(winnerGrams);
      }
    }
  }

  return { rows: drafts, exactDuplicatesRemoved: exactRemoved, flaggedCount: flagged };
}

// ============================================================================
// Pure helpers extracted from the Import page component
// ============================================================================

export type LibraryScope = "library" | "shared";
export type LibraryHighlight = { id: string; quote: string; book_title: string; scope?: LibraryScope };
export type LibraryMatch = {
  highlight_id: string;
  book_title: string;
  quote: string;
  scope: LibraryScope;
  sameTitle: boolean;
};
export type RawLibraryRow = {
  id: string;
  quote: string;
  user_id: string | null;
  visibility: string | null;
  book_title: string | null;
};

export function looksGarbled(title: string): boolean {
  if (!title) return false;
  // Contains any underscore
  if (title.includes("_")) return true;
  // Contains multiple consecutive dashes or underscores
  if (/--|__/.test(title)) return true;
  // No spaces and entirely lowercase letters/digits
  if (!/\s/.test(title) && /^[a-z0-9]+$/.test(title)) return true;
  return false;
}

// Defence in depth: only your own rows (any visibility) and other users' rows that are exactly 'public'.
// A NULL visibility on someone else's row, or an unowned row that is not 'public', is dropped.
export function toMatchPool(rows: RawLibraryRow[], myId: string): LibraryHighlight[] {
  const pool: LibraryHighlight[] = [];
  for (const r of rows) {
    const scope: LibraryScope | null = myId && r.user_id === myId ? "library" : r.visibility === "public" ? "shared" : null;
    if (scope) pool.push({ id: r.id, quote: r.quote, book_title: r.book_title ?? "", scope });
  }
  return pool;
}

export type PoolPage = { data: RawLibraryRow[] | null; error: unknown };
export type PoolPageFetcher = (afterId: string | null) => Promise<PoolPage>;

// Loads the whole match pool through an injected page fetcher. Keyset pagination on id: each call gets the
// last id seen, and the loop only stops on an empty page, so a server-side row cap can never truncate it.
// Any page error throws and no partial pool is returned. Everything goes through toMatchPool.
export async function loadMatchPool(fetchPage: PoolPageFetcher, myId: string): Promise<LibraryHighlight[]> {
  const rows: RawLibraryRow[] = [];
  let lastId: string | null = null;
  while (true) {
    const { data, error } = await fetchPage(lastId);
    if (error) throw error instanceof Error ? error : new Error("Library page failed to load");
    if (!data || data.length === 0) break;
    const nextId = data[data.length - 1].id;
    if (nextId === lastId) throw new Error("Library paging did not advance");
    rows.push(...data);
    lastId = nextId;
  }
  return toMatchPool(rows, myId);
}

// A shared match under the same book title is skipped by default; anything else needs a decision.
export function defaultReviewStatus(match: Pick<LibraryMatch, "scope" | "sameTitle">): "near_duplicate" | "skipped" {
  return match.scope === "shared" && match.sameTitle ? "skipped" : "near_duplicate";
}

export type ReviewStatus = "pending" | "skipped" | "near_duplicate";
export type ReviewVersion = { id: string; role: "winner" | "loser" };
export type ReviewAction = { kind: "import"; id: string } | { kind: "skipAll" } | { kind: "reset" };

// Status changes for one passage that exists in several versions within an import: the longest ("winner", staged
// to import by default) and the shorter ones ("loser", flagged against it). A standalone row, such as a match
// against your library, is a single loser. Importing one version skips every other, so two copies of the same
// passage can never both be imported; "reset" returns the whole group to its original state.
export function planReviewChange(versions: ReviewVersion[], action: ReviewAction): { id: string; status: ReviewStatus }[] {
  return versions.map((v) => {
    if (action.kind === "import") return { id: v.id, status: v.id === action.id ? "pending" : "skipped" };
    if (action.kind === "skipAll") return { id: v.id, status: "skipped" };
    return { id: v.id, status: v.role === "winner" ? "pending" : "near_duplicate" };
  });
}

export function normaliseQuote(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .toLowerCase()
    .replace(/[\p{Pi}\p{Pf}'"`]/gu, "'")
    .replace(/\p{Pd}/gu, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

// Exact edit distance when it is <= maxDist, otherwise maxDist + 1. Banded, with early exit.
export function levenshteinWithin(a: string, b: string, maxDist: number): number {
  const m = a.length;
  const n = b.length;
  const over = maxDist + 1;
  if (Math.abs(m - n) > maxDist) return over;
  let prev = new Array<number>(n + 1).fill(over);
  let curr = new Array<number>(n + 1).fill(over);
  for (let j = 0; j <= Math.min(n, maxDist); j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const lo = Math.max(1, i - maxDist);
    const hi = Math.min(n, i + maxDist);
    curr[lo - 1] = lo === 1 ? (i <= maxDist ? i : over) : over;
    let rowMin = lo === 1 ? curr[0] : over;
    const ca = a.charCodeAt(i - 1);
    for (let j = lo; j <= hi; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j - 1] + cost, prev[j] + 1, curr[j - 1] + 1);
      curr[j] = v > over ? over : v;
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return over;
    if (hi < n) curr[hi + 1] = over;
    [prev, curr] = [curr, prev];
  }
  return Math.min(prev[n], over);
}

const CROSS_TITLE_MIN_CONTAINED = 25;

// Trigram check, exact and sort-free. Each trigram maps to one of 65,536 buckets. A draft's bucket counts are loaded
// into a shared table once; each library row then ticks off matching buckets in a single pass. Distinct trigrams that
// share a bucket can only RAISE the shared count (a sum of minimums never exceeds the minimum of sums), so the count
// is always >= the true number of shared trigrams and a true match can never be rejected.
const GRAM_BUCKETS = 65536;
const gramTable = new Uint16Array(GRAM_BUCKETS);
let gramTouched = new Int32Array(1024);

function trigramBuckets(s: string): Uint16Array {
  const n = s.length - 2;
  if (n <= 0) return new Uint16Array(0);
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const h = Math.imul(Math.imul(s.charCodeAt(i), 31) + s.charCodeAt(i + 1), 31) + s.charCodeAt(i + 2);
    out[i] = (h ^ (h >>> 16)) & 0xffff;
  }
  return out;
}

function loadGramTable(g: Uint16Array) {
  for (let i = 0; i < g.length; i++) gramTable[g[i]]++;
}

function clearGramTable(g: Uint16Array) {
  for (let i = 0; i < g.length; i++) gramTable[g[i]] = 0;
}

// How many of the row's trigrams match the loaded table. Stops once `needed` can no longer be reached.
function sharedGramCount(row: Uint16Array, needed: number): number {
  if (gramTouched.length < row.length) gramTouched = new Int32Array(row.length);
  let touched = 0;
  const len = row.length;
  for (let i = 0; i < len; i++) {
    const b = row[i];
    if (gramTable[b] > 0) {
      gramTable[b]--;
      gramTouched[touched++] = b;
    } else if (touched + (len - i - 1) < needed) break;
  }
  for (let i = 0; i < touched; i++) gramTable[gramTouched[i]]++; // restore the table for the next row
  return touched;
}

function quotesMatch(a: string, b: string, minContained: number, gb: Uint16Array): boolean {
  if (a.length === 0 || b.length === 0) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = shorter === a ? b : a;
  if (shorter.length >= minContained && longer.includes(shorter)) return true;
  const maxLen = longer.length;
  if ((maxLen - shorter.length) / maxLen > 0.15) return false;
  const maxDist = Math.ceil(0.15 * maxLen);
  // q-gram lemma: strings within edit distance k share at least max length - 2 - 3k trigrams.
  const needed = maxLen - 2 - 3 * maxDist;
  if (needed > 0 && sharedGramCount(gb, needed) < needed) return false;
  const dist = levenshteinWithin(a, b, maxDist);
  return 1 - dist / maxLen > 0.85;
}

type PreparedLib = { lib: LibraryHighlight; norm: string; titleKey: string; grams: Uint16Array };

export function matchAgainstLibrary(
  drafts: StagingRowDraft[],
  allLib: LibraryHighlight[]
): Map<string, LibraryMatch> {
  const pools: Record<LibraryScope, PreparedLib[]> = { library: [], shared: [] };
  const byTitle: Record<LibraryScope, Map<string, PreparedLib[]>> = { library: new Map(), shared: new Map() };
  for (const lib of allLib) {
    const norm = normaliseQuote(lib.quote);
    if (norm.length === 0) continue;
    const scope = lib.scope ?? "library";
    const prepared: PreparedLib = { lib, norm, titleKey: lib.book_title.toLowerCase(), grams: trigramBuckets(norm) };
    pools[scope].push(prepared);
    const bucket = byTitle[scope].get(prepared.titleKey) ?? [];
    bucket.push(prepared);
    byTitle[scope].set(prepared.titleKey, bucket);
  }

  const matches = new Map<string, LibraryMatch>();
  for (const draft of drafts) {
    // Skip drafts already flagged by Level 1
    if (draft.status !== "pending") continue;
    const a = normaliseQuote(draft.quote);
    if (a.length === 0) continue;
    const titleKey = draft.book_title.toLowerCase();
    const ga = trigramBuckets(a);
    loadGramTable(ga);
    try {
      // Your library first, then shared. Same title uses the original rules; any title needs a longer contained text.
      for (const scope of ["library", "shared"] as const) {
        const sameTitleHit = (byTitle[scope].get(titleKey) ?? []).find((p) => quotesMatch(a, p.norm, 0, p.grams));
        const hit = sameTitleHit ?? pools[scope].find((p) => quotesMatch(a, p.norm, CROSS_TITLE_MIN_CONTAINED, p.grams));
        if (hit) {
          matches.set(draft.client_id, {
            highlight_id: hit.lib.id,
            book_title: hit.lib.book_title,
            quote: hit.lib.quote,
            scope,
            sameTitle: !!sameTitleHit,
          });
          break;
        }
      }
    } finally {
      clearGramTable(ga); // the shared table is always left empty
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Per-book rename check
// ---------------------------------------------------------------------------
export const RENAME_PAIR_MIN = 3;
export const RENAME_PAIR_MIN_SHARE = 0.5;

export type RenameCheckRow = { id: string; book_title: string; status: string; duplicate_of: string | null };
export type RenamePair = { fileTitle: string; libraryTitle: string; rowIds: string[] };

// Finds file books whose flagged highlights match the same book in your own library under a different title.
// A pair needs at least RENAME_PAIR_MIN undecided matches, and those must cover at least RENAME_PAIR_MIN_SHARE of
// all the flagged rows the file book has (rows in any state, so deciding one pair does not shift another's share).
export function findRenamePairs(
  rows: RenameCheckRow[],
  lookup: Record<string, { scope: LibraryScope | "import"; book_title: string }>
): RenamePair[] {
  const flaggedPerBook = new Map<string, number>();
  for (const r of rows) {
    const key = r.book_title.toLowerCase();
    flaggedPerBook.set(key, (flaggedPerBook.get(key) ?? 0) + 1);
  }
  const pairs = new Map<string, RenamePair>();
  for (const r of rows) {
    if (r.status !== "near_duplicate") continue;
    const m = r.duplicate_of ? lookup[r.duplicate_of] : undefined;
    if (!m || m.scope !== "library") continue; // your own library only
    if (!m.book_title || m.book_title.toLowerCase() === r.book_title.toLowerCase()) continue;
    const key = JSON.stringify([r.book_title.toLowerCase(), m.book_title.toLowerCase()]);
    const pair = pairs.get(key) ?? { fileTitle: r.book_title, libraryTitle: m.book_title, rowIds: [] };
    pair.rowIds.push(r.id);
    pairs.set(key, pair);
  }
  return [...pairs.values()]
    .filter(
      (p) =>
        p.rowIds.length >= RENAME_PAIR_MIN &&
        p.rowIds.length >= RENAME_PAIR_MIN_SHARE * (flaggedPerBook.get(p.fileTitle.toLowerCase()) ?? 0)
    )
    .sort((a, b) => b.rowIds.length - a.rowIds.length);
}

// Ids to skip when a rename pair is accepted: the pair's rows plus every shorter version flagged against them,
// so a longest version that is skipped never leaves its shorter versions behind. Rows already skipped are left out.
export function planRenameSkip(
  pairRowIds: string[],
  rows: { id: string; status: string; duplicate_of: string | null }[]
): string[] {
  const inPair = new Set(pairRowIds);
  return rows
    .filter((r) => r.status !== "skipped" && (inPair.has(r.id) || (!!r.duplicate_of && inPair.has(r.duplicate_of))))
    .map((r) => r.id);
}
