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
  // ending in "By" (e.g. "Algorithms to Live By by Christian, Brian") parse correctly.
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

export function attachNotesAndFilter(entries: ParsedHighlight[]): ParsedHighlight[] {
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

  let flagged = 0;
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    // Sort by quote length descending — longer wins
    list.sort((a, b) => b.quote.length - a.quote.length);

    for (let i = 0; i < list.length; i++) {
      const winner = list[i];
      if (winner.status !== "pending") continue;
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

        const dist = levenshtein(a, b);
        const sim = 1 - dist / maxLen;
        if (sim > 0.85) {
          candidate.status = "near_duplicate";
          candidate.duplicate_of_client_id = winner.client_id;
          flagged++;
        }
      }
    }
  }

  return { rows: drafts, exactDuplicatesRemoved: exactRemoved, flaggedCount: flagged };
}

// ============================================================================
// Pure helpers extracted from the Import page component
// ============================================================================

export type LibraryHighlight = { id: string; quote: string; book_title: string };

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

export function filterByLastImportDate(
  withNotes: ParsedHighlight[],
  lastImportDate: Date | null
): { working: ParsedHighlight[]; filteredByDate: number } {
  let filteredByDate = 0;
  let working = withNotes;
  if (lastImportDate) {
    const cutoff = lastImportDate.getTime();
    const newer = withNotes.filter((h) => h.kindle_timestamp && h.kindle_timestamp.getTime() > cutoff);
    filteredByDate = withNotes.length - newer.length;
    working = newer;
  }
  return { working, filteredByDate };
}

export function matchAgainstLibrary(
  drafts: StagingRowDraft[],
  allLib: LibraryHighlight[]
): Map<string, { highlight_id: string; book_title: string; quote: string }> {
  // Bucket library by lowercased book title
  const libBuckets = new Map<string, LibraryHighlight[]>();
  for (const lib of allLib) {
    const key = lib.book_title.toLowerCase();
    const arr = libBuckets.get(key) ?? [];
    arr.push(lib);
    libBuckets.set(key, arr);
  }

  const matches = new Map<string, { highlight_id: string; book_title: string; quote: string }>();
  for (const draft of drafts) {
    // Skip drafts already flagged by Level 1
    if (draft.status !== "pending") continue;
    const bucket = libBuckets.get(draft.book_title.toLowerCase());
    if (!bucket) continue;

    const a = draft.quote;
    let matched: { id: string; quote: string; book_title: string } | null = null;

    for (const lib of bucket) {
      const b = lib.quote;
      if (a === b || a.includes(b) || b.includes(a)) {
        matched = lib;
        break;
      }
      const maxLen = Math.max(a.length, b.length);
      const minLen = Math.min(a.length, b.length);
      if (maxLen === 0) continue;
      if ((maxLen - minLen) / maxLen > 0.15) continue;
      const dist = levenshtein(a, b);
      const sim = 1 - dist / maxLen;
      if (sim > 0.85) {
        matched = lib;
        break;
      }
    }

    if (matched) {
      matches.set(draft.client_id, {
        highlight_id: matched.id,
        book_title: matched.book_title,
        quote: matched.quote,
      });
    }
  }
  return matches;
}
