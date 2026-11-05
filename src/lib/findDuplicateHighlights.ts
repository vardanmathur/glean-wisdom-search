import { levenshteinWithin, normaliseQuote } from "@/lib/kindleImport";

// Finds likely duplicate highlights in a library. Pure; the admin Studio feeds it the rows.
//   near_identical  same book; normalised texts equal, or within a small edit distance
//   contained       same book; the shorter text (>= 30 chars) sits anywhere inside the longer one
//   other_book      different book; texts equal or contained (informational)

export type DuplicateKind = "near_identical" | "contained" | "other_book";

export interface DuplicateCandidate {
  id: string;
  quote: string;
  book_id: string | null;
  created_at: string;
}

// For contained and other_book pairs `first` is the shorter text and `second` the longer one.
// For near_identical pairs (and equal texts) `first` is the older save and `second` the newer one.
export interface DuplicatePair {
  kind: DuplicateKind;
  first: string;
  second: string;
}

export const MIN_CONTAINED_CHARS = 30;
const MAX_EDIT_FRACTION = 0.03;
const MAX_EDIT_DISTANCE = 10;

export const KIND_ORDER: DuplicateKind[] = ["near_identical", "contained", "other_book"];

export function editThreshold(longerLength: number): number {
  return Math.min(MAX_EDIT_DISTANCE, Math.floor(longerLength * MAX_EDIT_FRACTION));
}

// Stable key for a pair of ids, whichever way round they are given.
export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

interface Prepared {
  id: string;
  book: string | null;
  norm: string;
  time: number;
}

const byAge = (a: Prepared, b: Prepared): number => a.time - b.time || (a.id < b.id ? -1 : 1);

export function findDuplicatePairs(rows: DuplicateCandidate[]): DuplicatePair[] {
  const prepared: Prepared[] = [];
  for (const r of rows) {
    const norm = normaliseQuote(r.quote ?? "");
    if (!norm) continue;
    const time = Date.parse(r.created_at);
    prepared.push({ id: r.id, book: r.book_id, norm, time: Number.isFinite(time) ? time : 0 });
  }
  // Shortest first, so in every pair p[i] is no longer than p[j].
  prepared.sort((a, b) => a.norm.length - b.norm.length || byAge(a, b));

  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const s = prepared[i];
    for (let j = i + 1; j < prepared.length; j++) {
      const l = prepared[j];
      const sameBook = s.book !== null && s.book === l.book;
      const equal = s.norm === l.norm;
      const contained = !equal && s.norm.length >= MIN_CONTAINED_CHARS && l.norm.includes(s.norm);

      if (sameBook) {
        if (equal) {
          pairs.push(olderFirst("near_identical", s, l));
        } else if (contained) {
          pairs.push({ kind: "contained", first: s.id, second: l.id });
        } else {
          const max = editThreshold(l.norm.length);
          if (max > 0 && l.norm.length - s.norm.length <= max && levenshteinWithin(s.norm, l.norm, max) <= max) {
            pairs.push(olderFirst("near_identical", s, l));
          }
        }
      } else if (equal) {
        pairs.push(olderFirst("other_book", s, l));
      } else if (contained) {
        pairs.push({ kind: "other_book", first: s.id, second: l.id });
      }
    }
  }
  return pairs;
}

function olderFirst(kind: DuplicateKind, a: Prepared, b: Prepared): DuplicatePair {
  const [older, newer] = byAge(a, b) <= 0 ? [a, b] : [b, a];
  return { kind, first: older.id, second: newer.id };
}

// Which id to keep by default: the older save for near-identical, the longer text otherwise.
export function defaultKeepId(pair: DuplicatePair): string {
  return pair.kind === "near_identical" ? pair.first : pair.second;
}

export function groupPairsByKind(pairs: DuplicatePair[]): Record<DuplicateKind, DuplicatePair[]> {
  const out: Record<DuplicateKind, DuplicatePair[]> = { near_identical: [], contained: [], other_book: [] };
  for (const p of pairs) out[p.kind].push(p);
  return out;
}

// ---------- merging what the deleted copy carried ----------

const NL = String.fromCharCode(10);

export interface TagsAndNotes {
  tags: string[] | null;
  my_notes: string | null;
}

// Union of tags (case-insensitive, kept first) and notes (the other copy's notes go under a --- line).
export function mergeTagsAndNotes(kept: TagsAndNotes, removed: TagsAndNotes): TagsAndNotes & { changed: boolean } {
  const keptTags = kept.tags ?? [];
  const seen = new Set(keptTags.map((t) => t.trim().toLowerCase()));
  const tags = [...keptTags];
  for (const t of removed.tags ?? []) {
    const k = t.trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      tags.push(t);
    }
  }

  const keptNotes = (kept.my_notes ?? "").trim();
  const removedNotes = (removed.my_notes ?? "").trim();
  let notes = keptNotes;
  if (removedNotes && removedNotes !== keptNotes) {
    notes = keptNotes ? [keptNotes, "---", removedNotes].join(NL + NL) : removedNotes;
  }

  const tagsChanged = tags.length !== keptTags.length;
  const notesChanged = notes !== keptNotes;
  return { tags, my_notes: notes || null, changed: tagsChanged || notesChanged };
}

// A bookmark moves to the kept copy when the user saved the copy being deleted but not the kept one.
export function shouldMoveBookmark(savedIds: Iterable<string>, deletedId: string, keptId: string): boolean {
  const saved = new Set(savedIds);
  return saved.has(deletedId) && !saved.has(keptId);
}

// ---------- highlighting the shared part ----------

export interface Marked {
  before: string;
  match: string;
  after: string;
}

// Where `shorter` sits in `longer` (exact text, ignoring surrounding spaces); null if not found verbatim.
export function markContained(longer: string, shorter: string): Marked | null {
  const needle = shorter.trim();
  if (!needle) return null;
  const at = longer.indexOf(needle);
  if (at < 0) return null;
  return { before: longer.slice(0, at), match: needle, after: longer.slice(at + needle.length) };
}

// Splits two texts into the part they share at the start, the part they share at the end, and what differs.
export function markDifference(a: string, b: string): { a: Marked; b: Marked } {
  const max = Math.min(a.length, b.length);
  let start = 0;
  while (start < max && a[start] === b[start]) start++;
  let end = 0;
  while (end < max - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const split = (t: string): Marked => ({
    before: t.slice(0, start),
    match: t.slice(start, t.length - end),
    after: t.slice(t.length - end),
  });
  return { a: split(a), b: split(b) };
}
