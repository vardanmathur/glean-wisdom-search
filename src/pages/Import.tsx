import { useState, useRef, useMemo, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Upload, FileText, ArrowLeft, AlertCircle, Loader2, CheckCircle2, BookOpen, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

// ============================================================================
// Kindle parsing — pure functions
// ============================================================================

type ParsedHighlight = {
  quote: string;
  book_title: string;
  author: string | null;
  author_unknown: boolean;
  kindle_location: string | null;
  kindle_timestamp: Date | null;
  my_notes: string | null;
  entry_type: "Highlight" | "Note" | "Bookmark";
};

type StagingStatus = "pending" | "near_duplicate" | "similar" | "skipped";

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function parseKindleDate(raw: string): Date | null {
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

// Reverses "Last, First" → "First Last". Returns null if input doesn't look like a comma-name.
function reverseIfCommaName(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed.includes(",")) return null;
  const parts = trimmed.split(",", 2).map((p) => p.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  // Sanity: each part should look name-like (letters, spaces, hyphens, dots, apostrophes)
  const nameRe = /^[\p{L}][\p{L}\s.\-']*$/u;
  if (!nameRe.test(parts[0]) || !nameRe.test(parts[1])) return null;
  return `${parts[1]} ${parts[0]}`;
}

function parseTitleAndAuthor(rawTitle: string): { title: string; author: string | null; unknown: boolean } {
  const t = rawTitle.trim();

  // Pattern 1: "Title (Author)" or "Title (Last, First)"
  const p1 = t.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (p1) {
    const inside = p1[2].trim();
    const reversed = reverseIfCommaName(inside);
    if (reversed) {
      return { title: p1[1].trim(), author: reversed, unknown: false };
    }
    if (inside.length > 0) {
      return { title: p1[1].trim(), author: inside, unknown: false };
    }
  }

  // Pattern 2: "Title by Author"
  const p2 = t.match(/^(.+?)\s+by\s+(.+)$/i);
  if (p2) {
    const authorPart = p2[2].trim();
    const reversed = reverseIfCommaName(authorPart);
    return { title: p2[1].trim(), author: reversed ?? authorPart, unknown: false };
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
        return { title: left, author: rightReversed, unknown: false };
      }
      // Try left side as comma-name (author prefix)
      const leftReversed = reverseIfCommaName(left);
      if (leftReversed) {
        return { title: right, author: leftReversed, unknown: false };
      }
    }
  }

  // Pattern 4: bare "Last, First" with no title context — treat as unknown title,
  // but at least don't store the comma-form verbatim if it's clearly a name.
  const bareReversed = reverseIfCommaName(t);
  if (bareReversed) {
    return { title: t, author: bareReversed, unknown: false };
  }

  return { title: t, author: null, unknown: true };
}

function parseClippings(contents: string): {
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

function attachNotesAndFilter(entries: ParsedHighlight[]): ParsedHighlight[] {
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

function levenshtein(a: string, b: string): number {
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
type StagingRowDraft = {
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

type Detected = {
  rows: StagingRowDraft[];
  exactDuplicatesRemoved: number;
  flaggedCount: number;
};

function detectDuplicatesLevel1(highlights: ParsedHighlight[]): Detected {
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
// Main page component
// ============================================================================

type Step = 1 | 2 | 3 | 4 | 5;

type ParseSummary = {
  totalReady: number;
  uniqueBooks: number;
  exactDuplicatesRemoved: number;
  flaggedCount: number;
  unknownAuthorBooks: number;
  oversizedCount: number;
  malformedCount: number;
  filteredByDate: number;
  lastImportDate: Date | null;
  showingAll: boolean;
};

type StagedRow = {
  id: string;
  user_id: string;
  session_id: string;
  quote: string;
  book_title: string;
  author: string | null;
  kindle_location: string | null;
  kindle_timestamp: string | null;
  my_notes: string | null;
  status: string;
  duplicate_of: string | null;
};

type MatchSource = {
  scope: "import" | "library";
  book_title: string;
  quote: string;
};

type ImportResult = {
  imported: number;
  failed: { row: StagedRow; reason: string }[];
  booksTouched: number;
  booksMissingAuthor: number;
};

const Import = () => {
  const { user, authLoading } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileContents, setFileContents] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ParseSummary | null>(null);
  const [howToOpen, setHowToOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stagedRows, setStagedRows] = useState<StagedRow[]>([]);
  const [matchLookup, setMatchLookup] = useState<Record<string, MatchSource>>({});
  const [authorEdits, setAuthorEdits] = useState<Record<string, string>>({}); // book_title -> author
  const [titleEdits, setTitleEdits] = useState<Record<string, string>>({}); // current_title -> draft_new_title
  const [reviewSnapshot, setReviewSnapshot] = useState<string[] | null>(null); // staged-row IDs originally flagged near_duplicate
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived state for Step 3 — must be declared before any early returns
  const reviewItems = useMemo(() => stagedRows.filter((r) => r.status === "near_duplicate"), [stagedRows]);
  const pendingItems = useMemo(() => stagedRows.filter((r) => r.status === "pending"), [stagedRows]);
  const pendingByBook = useMemo(() => {
    const map = new Map<string, StagedRow[]>();
    for (const r of pendingItems) {
      const arr = map.get(r.book_title) ?? [];
      arr.push(r);
      map.set(r.book_title, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [pendingItems]);
  const booksMissingAuthor = useMemo(() => {
    const set = new Set<string>();
    for (const r of pendingItems) {
      if (!r.author || r.author.trim() === "") set.add(r.book_title);
    }
    return Array.from(set).sort();
  }, [pendingItems]);

  const allReviewResolved = reviewItems.length === 0;
  const allAuthorsFilled = booksMissingAuthor.length === 0;

  // Snapshot of originally-flagged rows so cards persist after Keep/Skip (for dim + Undo + progress)
  const reviewSnapshotRows = useMemo(() => {
    if (!reviewSnapshot) return [];
    const byId = new Map(stagedRows.map((r) => [r.id, r]));
    return reviewSnapshot.map((id) => byId.get(id)).filter((r): r is StagedRow => !!r);
  }, [reviewSnapshot, stagedRows]);
  const reviewDecidedCount = useMemo(
    () => reviewSnapshotRows.filter((r) => r.status !== "near_duplicate").length,
    [reviewSnapshotRows]
  );

  // Capture snapshot once when entering Step 3 with near-duplicates present
  useEffect(() => {
    if (step === 3 && reviewSnapshot === null && stagedRows.length > 0) {
      const flagged = stagedRows.filter((r) => r.status === "near_duplicate").map((r) => r.id);
      setReviewSnapshot(flagged);
    }
  }, [step, reviewSnapshot, stagedRows]);

  if (authLoading || permLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <h1 className="font-display text-3xl font-semibold text-foreground mb-3">Import your Kindle highlights</h1>
        <p className="text-muted-foreground mb-6">
          Import your Kindle highlights into your private Glean library. Sign in to get started — your highlights will only be visible to you.
        </p>
        <Button
          onClick={() =>
            supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: `${window.location.origin}/import` },
            })
          }
          size="lg"
        >
          Sign in with Google
        </Button>
      </div>
    );
  }

  if (!hasPermission("import")) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <h1 className="font-display text-3xl font-semibold text-foreground mb-3">Import</h1>
        <p className="text-muted-foreground">
          You don't have access to this feature yet. Contact us to request access.
        </p>
      </div>
    );
  }

  const acceptFile = (f: File) => {
    setError(null);
    if (!f.name.toLowerCase().endsWith(".txt")) {
      setError("Please upload a MyClippings.txt file");
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setFileContents(String(reader.result ?? ""));
    reader.onerror = () => setError("Could not read this file. Make sure it is a Kindle MyClippings.txt file and try again.");
    reader.readAsText(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) acceptFile(f);
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  };

  // ============================================================================
  // Level 2 — match against user's library
  // ============================================================================
  const runLevel2Match = async (
    drafts: StagingRowDraft[]
  ): Promise<Map<string, { highlight_id: string; book_title: string; quote: string }>> => {
    if (!user) return new Map();
    // Fetch user's library — explicit columns only, never embedding, paginated
    const allLib: { id: string; quote: string; book_title: string }[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error: libErr } = await supabase
        .from("highlights")
        .select("id, quote, book_id, books!inner(id, title)")
        .eq("user_id", user.id)
        .range(from, from + PAGE - 1);
      if (libErr) {
        console.error("[Import] Level 2 library fetch error", libErr);
        break;
      }
      if (!data || data.length === 0) break;
      for (const r of data as unknown as { id: string; quote: string; books: { title: string } }[]) {
        allLib.push({ id: r.id, quote: r.quote, book_title: r.books?.title ?? "" });
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // Bucket library by lowercased book title
    const libBuckets = new Map<string, { id: string; quote: string; book_title: string }[]>();
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
  };

  const runParse = async (showAll: boolean) => {
    if (!fileContents || !user) return;
    setParsing(true);
    setError(null);
    setSummary(null);

    try {
      const parsed = parseClippings(fileContents);
      if (parsed.highlights.length === 0 && parsed.malformedCount === 0) {
        setError("Could not read this file. Make sure it is a Kindle MyClippings.txt file and try again.");
        setParsing(false);
        return;
      }

      const withNotes = attachNotesAndFilter(parsed.highlights);

      let lastImportDate: Date | null = null;
      if (!showAll) {
        const [hRes, sRes] = await Promise.all([
          supabase
            .from("highlights")
            .select("created_at")
            .eq("user_id", user.id)
            .eq("source", "user")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("kindle_import_staging")
            .select("created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        const hDate = hRes.data?.created_at ? new Date(hRes.data.created_at) : null;
        const sDate = sRes.data?.created_at ? new Date(sRes.data.created_at) : null;
        if (hDate && sDate) lastImportDate = hDate > sDate ? hDate : sDate;
        else lastImportDate = hDate ?? sDate;
      }

      let filteredByDate = 0;
      let working = withNotes;
      if (lastImportDate) {
        const cutoff = lastImportDate.getTime();
        const newer = withNotes.filter((h) => h.kindle_timestamp && h.kindle_timestamp.getTime() > cutoff);
        filteredByDate = withNotes.length - newer.length;
        working = newer;
      }

      const detected = detectDuplicatesLevel1(working);

      if (detected.rows.length === 0) {
        setSummary({
          totalReady: 0,
          uniqueBooks: 0,
          exactDuplicatesRemoved: detected.exactDuplicatesRemoved,
          flaggedCount: 0,
          unknownAuthorBooks: 0,
          oversizedCount: parsed.oversizedCount,
          malformedCount: parsed.malformedCount,
          filteredByDate,
          lastImportDate,
          showingAll: showAll,
        });
        setStep(2);
        setParsing(false);
        return;
      }

      // Level 2 — match against library BEFORE writing to staging so duplicate_of can be set
      const libMatches = await runLevel2Match(detected.rows);
      let level2Flagged = 0;
      for (const draft of detected.rows) {
        const m = libMatches.get(draft.client_id);
        if (m) {
          draft.status = "near_duplicate";
          // We'll set duplicate_of to the library highlight UUID after staging insert
          // Store it temporarily by overwriting client_id reference with the library id, marked
          (draft as StagingRowDraft & { _library_match_id?: string })._library_match_id = m.highlight_id;
          level2Flagged++;
        }
      }

      setSaving(true);
      const newSessionId = crypto.randomUUID();

      // First pass: insert all rows (without duplicate_of for Level 1 refs since we don't have DB UUIDs yet)
      // We'll use a client_id -> db id map to update duplicate_of in a second pass.
      const clientToDbId = new Map<string, string>();

      const BATCH = 100;
      for (let i = 0; i < detected.rows.length; i += BATCH) {
        const slice = detected.rows.slice(i, i + BATCH);
        const insertRows = slice.map((r) => {
          const libMatchId = (r as StagingRowDraft & { _library_match_id?: string })._library_match_id ?? null;
          return {
            user_id: user.id,
            session_id: newSessionId,
            client_id: r.client_id, // for reliable post-insert mapping (insert return order is not guaranteed)
            quote: r.quote,
            book_title: r.book_title,
            author: r.author,
            kindle_location: r.kindle_location,
            kindle_timestamp: r.kindle_timestamp ? r.kindle_timestamp.toISOString() : null,
            my_notes: r.my_notes,
            status: r.status,
            duplicate_of: libMatchId, // Level 2 ref set immediately (real highlight id)
          };
        });
        const { data: inserted, error: insErr } = await supabase
          .from("kindle_import_staging")
          .insert(insertRows)
          .select("id, client_id");
        if (insErr || !inserted) {
          console.error("staging insert error", insErr);
          setError("Could not save highlights for review. Please try again.");
          setSaving(false);
          setParsing(false);
          return;
        }
        // Match by client_id rather than index — Supabase does not guarantee insert return order
        slice.forEach((r) => {
          const match = (inserted as { id: string; client_id: string | null }[]).find(
            (row) => row.client_id === r.client_id
          );
          if (match) {
            clientToDbId.set(r.client_id, match.id);
          } else {
            console.warn("[Import] No insert match found for client_id", r.client_id);
          }
        });
      }

      // Second pass: for Level 1 refs, update duplicate_of with the actual DB id of the winner
      const level1Updates: { id: string; duplicate_of: string }[] = [];
      for (const r of detected.rows) {
        if (r.duplicate_of_client_id) {
          const myId = clientToDbId.get(r.client_id);
          const refId = clientToDbId.get(r.duplicate_of_client_id);
          if (myId && refId) {
            level1Updates.push({ id: myId, duplicate_of: refId });
          }
        }
      }
      // Apply updates one row at a time (typically small N — only flagged rows)
      let level1UpdatedCount = 0;
      for (const u of level1Updates) {
        const { data: updated, error: updErr } = await supabase
          .from("kindle_import_staging")
          .update({ duplicate_of: u.duplicate_of })
          .eq("id", u.id)
          .eq("user_id", user.id)
          .select("id");
        if (updErr) {
          console.error("[Import] Level 1 duplicate_of update error", updErr, u);
        } else if (!updated || updated.length === 0) {
          console.warn("[Import] Level 1 update affected 0 rows", u);
        } else {
          level1UpdatedCount++;
        }
      }
      console.log("[Import] Level 1 duplicate_of updates:", {
        attempted: level1Updates.length,
        succeeded: level1UpdatedCount,
      });

      setSaving(false);

      const uniqueBooks = new Set(detected.rows.map((r) => r.book_title)).size;
      const unknownAuthorBooks = new Set(
        detected.rows.filter((r) => !r.author).map((r) => r.book_title)
      ).size;

      setSessionId(newSessionId);
      setSummary({
        totalReady: detected.rows.length,
        uniqueBooks,
        exactDuplicatesRemoved: detected.exactDuplicatesRemoved,
        flaggedCount: detected.flaggedCount + level2Flagged,
        unknownAuthorBooks,
        oversizedCount: parsed.oversizedCount,
        malformedCount: parsed.malformedCount,
        filteredByDate,
        lastImportDate,
        showingAll: showAll,
      });
      setStep(2);
      toast.success("Saved to staging — ready for your review");
    } catch (err) {
      console.error(err);
      setError("Could not read this file. Make sure it is a Kindle MyClippings.txt file and try again.");
    } finally {
      setParsing(false);
      setSaving(false);
    }
  };

  // ============================================================================
  // Step 3 — load staged rows + match sources
  // ============================================================================
  const goToStep3 = async () => {
    if (!user || !sessionId) return;
    setError(null);

    // Fetch all staged rows for this session
    const { data: rows, error: rowsErr } = await supabase
      .from("kindle_import_staging")
      .select("id, user_id, session_id, quote, book_title, author, kindle_location, kindle_timestamp, my_notes, status, duplicate_of")
      .eq("user_id", user.id)
      .eq("session_id", sessionId);

    if (rowsErr || !rows) {
      console.error("[Import] fetch staging failed", rowsErr);
      setError("Could not load review queue. Please try again.");
      return;
    }
    setStagedRows(rows as StagedRow[]);

    // Resolve duplicate_of references — could be either a staging row id or a highlights id
    const refIds = Array.from(
      new Set(rows.filter((r) => r.duplicate_of).map((r) => r.duplicate_of as string))
    );
    const lookup: Record<string, MatchSource> = {};
    if (refIds.length > 0) {
      // Try staging first
      const { data: stagingRefs } = await supabase
        .from("kindle_import_staging")
        .select("id, quote, book_title")
        .in("id", refIds)
        .eq("user_id", user.id);
      if (stagingRefs) {
        for (const s of stagingRefs) {
          lookup[s.id] = { scope: "import", book_title: s.book_title, quote: s.quote };
        }
      }
      const remaining = refIds.filter((id) => !lookup[id]);
      if (remaining.length > 0) {
        // Library refs — explicit columns, never embedding, table-prefixed via select
        const { data: libRefs } = await supabase
          .from("highlights")
          .select("id, quote, books!inner(title)")
          .in("id", remaining)
          .eq("user_id", user.id);
        if (libRefs) {
          for (const l of libRefs as unknown as { id: string; quote: string; books: { title: string } }[]) {
            lookup[l.id] = { scope: "library", book_title: l.books?.title ?? "", quote: l.quote };
          }
        }
      }
    }
    setMatchLookup(lookup);

    // Reset author edits
    setAuthorEdits({});
    setStep(3);
  };

  // ============================================================================
  // Step 3 actions
  // ============================================================================
  const keepRow = async (row: StagedRow) => {
    const { error: e } = await supabase
      .from("kindle_import_staging")
      .update({ status: "pending" })
      .eq("id", row.id)
      .eq("user_id", user!.id);
    if (e) { toast.error("Could not keep highlight"); return; }
    setStagedRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: "pending" } : r)));
  };

  const skipRow = async (row: StagedRow) => {
    const { error: e } = await supabase
      .from("kindle_import_staging")
      .update({ status: "skipped" })
      .eq("id", row.id)
      .eq("user_id", user!.id);
    if (e) { toast.error("Could not skip highlight"); return; }
    setStagedRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: "skipped" } : r)));
  };

  const setAuthorForBook = async (bookTitle: string, author: string) => {
    const trimmed = author.trim();
    if (!trimmed) return;
    const { error: e } = await supabase
      .from("kindle_import_staging")
      .update({ author: trimmed })
      .eq("user_id", user!.id)
      .eq("session_id", sessionId!)
      .eq("book_title", bookTitle);
    if (e) { toast.error("Could not save author"); return; }
    setStagedRows((prev) => prev.map((r) => (r.book_title === bookTitle ? { ...r, author: trimmed } : r)));
    toast.success(`Author saved for "${bookTitle}"`);
  };



  // ============================================================================
  // Step 4 — Import execution
  // ============================================================================
  const runImport = async (allowMissingAuthor: boolean) => {
    if (!user || !sessionId) return;
    setError(null);
    setImporting(true);
    setImportResult(null);

    try {
      // Fetch fresh pending rows
      const { data: pending, error: pErr } = await supabase
        .from("kindle_import_staging")
        .select("id, user_id, session_id, quote, book_title, author, kindle_location, kindle_timestamp, my_notes, status, duplicate_of")
        .eq("user_id", user.id)
        .eq("session_id", sessionId)
        .eq("status", "pending");

      if (pErr || !pending) {
        setError("Could not load highlights to import.");
        setImporting(false);
        return;
      }

      const rows = pending as StagedRow[];
      setImportProgress({ done: 0, total: rows.length });

      // Resolve book_id per (book_title + author) combination
      const bookKey = (title: string, author: string | null) =>
        `${title.toLowerCase()}\u0000${(author ?? "").toLowerCase()}`;

      const bookIdMap = new Map<string, string | null>();
      const uniqueBookKeys = new Map<string, { title: string; author: string | null }>();
      for (const r of rows) {
        uniqueBookKeys.set(bookKey(r.book_title, r.author), { title: r.book_title, author: r.author });
      }

      let booksMissingAuthorCount = 0;
      for (const [key, b] of uniqueBookKeys.entries()) {
        // Look up existing book by case-insensitive title (and author if available)
        const { data: existing } = await supabase
          .from("books")
          .select("id, author")
          .ilike("title", b.title)
          .limit(5);
        let foundId: string | null = null;
        if (existing && existing.length > 0) {
          // Prefer matching author, else first
          const match = existing.find((e) => (e.author ?? "").toLowerCase() === (b.author ?? "").toLowerCase());
          foundId = (match ?? existing[0]).id;
        }
        if (!foundId) {
          const authorToInsert = b.author ?? "Unknown";
          if (!b.author) booksMissingAuthorCount++;
          const { data: created, error: createErr } = await supabase
            .from("books")
            .insert({ title: b.title, author: authorToInsert })
            .select("id")
            .single();
          if (createErr || !created) {
            console.error("[Import] book insert failed", createErr);
            bookIdMap.set(key, null);
            continue;
          }
          foundId = created.id;
        }
        bookIdMap.set(key, foundId);
      }

      // Insert highlights one by one to capture per-row failures
      const failed: { row: StagedRow; reason: string }[] = [];
      let imported = 0;
      const successfulIds: string[] = [];

      for (const r of rows) {
        const book_id = bookIdMap.get(bookKey(r.book_title, r.author)) ?? null;
        const createdAt = r.kindle_timestamp ?? new Date().toISOString();
        const { error: hErr } = await supabase.from("highlights").insert({
          quote: r.quote,
          book_id,
          my_notes: r.my_notes,
          source: "user",
          visibility: "private",
          user_id: user.id,
          created_at: createdAt,
          tags: [],
          stars: false,
          reported: false,
        });
        if (hErr) {
          console.error("[Import] highlight insert failed", hErr, r);
          failed.push({ row: r, reason: hErr.message });
        } else {
          imported++;
          successfulIds.push(r.id);
        }
        setImportProgress({ done: imported + failed.length, total: rows.length });
      }

      // Cleanup: delete pending (now imported) + skipped rows for this session
      // Only remove successful pending rows from staging — keep failures so user can retry
      if (successfulIds.length > 0) {
        const DEL_BATCH = 200;
        for (let i = 0; i < successfulIds.length; i += DEL_BATCH) {
          const slice = successfulIds.slice(i, i + DEL_BATCH);
          await supabase
            .from("kindle_import_staging")
            .delete()
            .in("id", slice)
            .eq("user_id", user.id);
        }
      }
      // Delete skipped rows
      await supabase
        .from("kindle_import_staging")
        .delete()
        .eq("user_id", user.id)
        .eq("session_id", sessionId)
        .eq("status", "skipped");

      const booksTouched = uniqueBookKeys.size;

      setImportResult({
        imported,
        failed,
        booksTouched,
        booksMissingAuthor: booksMissingAuthorCount,
      });
      setStep(5);
    } catch (err) {
      console.error(err);
      setError("Import failed unexpectedly. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  const retryFailed = async () => {
    if (!user || !sessionId || !importResult) return;
    const failedIds = importResult.failed.map((f) => f.row.id);
    if (failedIds.length === 0) return;
    // Re-mark as pending and re-run import
    await supabase
      .from("kindle_import_staging")
      .update({ status: "pending" })
      .in("id", failedIds)
      .eq("user_id", user.id);
    await runImport(true);
  };

  const goBackToStep1 = async () => {
    if (user) {
      await supabase.from("kindle_import_staging").delete().eq("user_id", user.id);
    }
    setStep(1);
    setSummary(null);
    setFile(null);
    setFileContents("");
    setError(null);
    setSessionId(null);
    setStagedRows([]);
    setMatchLookup({});
    setAuthorEdits({});
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-foreground mb-2">
        Import your Kindle highlights
      </h1>
      <p className="text-muted-foreground mb-8">
        Upload your MyClippings.txt to add Kindle highlights to your private library.
      </p>

      <div className="mb-8 flex flex-wrap items-center gap-2 text-sm">
        <StepBadge n={1} label="Upload" active={step === 1} done={step > 1} />
        <Connector />
        <StepBadge n={2} label="Parse & review" active={step === 2} done={step > 2} />
        <Connector />
        <StepBadge n={3} label="Confirm" active={step === 3} done={step > 3} />
        <Connector />
        <StepBadge n={4} label="Import" active={step === 4 || step === 5} done={step === 5} />
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <Collapsible open={howToOpen} onOpenChange={setHowToOpen}>
            <Card className="overflow-hidden">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/40 transition-colors">
                <span className="font-medium text-foreground">How to find your MyClippings.txt file</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${howToOpen ? "rotate-180" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border px-5 py-5">
                  <div className="grid gap-4 sm:grid-cols-3">
                    {[
                      { n: 1, h: "Connect Kindle", b: "via USB cable" },
                      { n: 2, h: "Open Kindle drive", b: "on your computer" },
                      { n: 3, h: "Find the file", b: "Documents/My Clippings.txt" },
                    ].map((s) => (
                      <div key={s.n} className="rounded-lg border border-border bg-muted/30 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-primary mb-1">Step {s.n}</div>
                        <div className="font-medium text-foreground">{s.h}</div>
                        <div className="text-sm text-muted-foreground mt-1">{s.b}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    On Mac, Kindle appears in Finder sidebar. On Windows, open File Explorer → This PC → Kindle → Documents → My Clippings.txt
                  </p>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <Card
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed p-10 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
          >
            <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium text-foreground mb-1">
              Drag your MyClippings.txt here or click to browse
            </p>
            <p className="text-sm text-muted-foreground">.txt files only</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              onChange={onFilePicked}
              className="hidden"
            />
          </Card>

          {file && (
            <Card className="flex items-center gap-3 p-4">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium text-foreground">{file.name}</div>
                <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
            </Card>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => runParse(false)}
              disabled={!file || !fileContents || parsing}
              size="lg"
            >
              {parsing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Parsing your highlights...
                </>
              ) : (
                "Parse file"
              )}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && summary && (
        <div className="space-y-5">
          {parsing || saving ? (
            <Card className="flex items-center gap-3 p-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-foreground">
                {saving ? "Saving to review queue..." : "Parsing your highlights..."}
              </span>
            </Card>
          ) : (
            <>
              {summary.lastImportDate && !summary.showingAll && summary.filteredByDate > 0 && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                  <p className="text-foreground">
                    Showing {summary.totalReady} highlights added after{" "}
                    <span className="font-medium">
                      {summary.lastImportDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </span>{" "}
                    — your last import. {summary.filteredByDate} older highlights skipped.
                  </p>
                  <button
                    onClick={() => runParse(true)}
                    className="mt-2 text-sm font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Show all highlights including older ones
                  </button>
                </div>
              )}

              {summary.totalReady === 0 ? (
                <Card className="p-6">
                  <p className="text-foreground">
                    No new highlights found in this file. If you've imported before, all highlights may already be in your library.{" "}
                    {!summary.showingAll && (
                      <button
                        onClick={() => runParse(true)}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        Try "Show all highlights including older ones"
                      </button>
                    )}
                  </p>
                </Card>
              ) : (
                <Card className="p-6">
                  <h2 className="font-display text-xl font-semibold text-foreground mb-4">
                    Parsing complete
                  </h2>
                  <ul className="space-y-2 text-sm">
                    <SummaryRow
                      label={`${summary.totalReady} highlights from ${summary.uniqueBooks} books ready to review`}
                      strong
                    />
                    {summary.exactDuplicatesRemoved > 0 && (
                      <SummaryRow label={`${summary.exactDuplicatesRemoved} exact duplicates removed`} />
                    )}
                    {summary.flaggedCount > 0 && (
                      <SummaryRow label={`${summary.flaggedCount} highlights flagged for review (near duplicates)`} />
                    )}
                    {summary.unknownAuthorBooks > 0 && (
                      <SummaryRow label={`${summary.unknownAuthorBooks} books need author information`} />
                    )}
                    {summary.oversizedCount > 0 && (
                      <SummaryRow label={`${summary.oversizedCount} oversized highlights skipped (over 1,500 characters)`} />
                    )}
                    <SummaryRow label="Saved to staging — ready for your review" highlight />
                  </ul>
                </Card>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="outline" onClick={goBackToStep1}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Upload a different file
                </Button>
                {summary.totalReady > 0 && (
                  <Button onClick={goToStep3} size="lg">
                    Next: Review and import →
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          {/* Section 1 — Ready to import */}
          <Card className="p-6">
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">
              Ready to import
            </h2>
            <p className="text-foreground mb-4">
              <span className="text-2xl font-display font-semibold text-primary">{pendingItems.length}</span>{" "}
              highlights from{" "}
              <span className="text-2xl font-display font-semibold text-primary">{pendingByBook.length}</span>{" "}
              books
            </p>
            {pendingByBook.length > 0 && (
              <ul className="space-y-1.5 text-sm max-h-48 overflow-y-auto">
                {pendingByBook.map(([title, items]) => (
                  <li key={title} className="flex items-center justify-between gap-3 border-b border-border/50 pb-1.5 last:border-0">
                    <span className="truncate text-foreground">{title}</span>
                    <span className="shrink-0 text-muted-foreground">{items.length}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Section 2 — Needs review */}
          {reviewItems.length > 0 && (
            <Card className="p-6">
              <h2 className="font-display text-xl font-semibold text-foreground mb-1">
                Needs your review
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {reviewItems.length} {reviewItems.length === 1 ? "highlight looks" : "highlights look"} similar to existing ones. Decide whether to keep or skip each.
              </p>
              <div className="space-y-4">
                {reviewItems.map((row) => {
                  const match = row.duplicate_of ? matchLookup[row.duplicate_of] : null;
                  return (
                    <div key={row.id} className="rounded-lg border border-border bg-muted/20 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                            New highlight
                          </div>
                          <div className="text-sm font-medium text-foreground mb-1 truncate">{row.book_title}</div>
                          <div className="text-sm text-foreground whitespace-pre-wrap">{row.quote}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wide text-primary mb-1.5">
                            {match
                              ? match.scope === "import"
                                ? "Already in this import"
                                : "Already in your library"
                              : "Match reference unavailable"}
                          </div>
                          {match ? (
                            <>
                              <div className="text-sm font-medium text-foreground mb-1 truncate">{match.book_title}</div>
                              <div className="text-sm text-foreground whitespace-pre-wrap">{match.quote}</div>
                            </>
                          ) : (
                            <div className="text-sm text-muted-foreground italic">
                              Could not load the matching highlight.
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => skipRow(row)}>
                          Skip
                        </Button>
                        <Button size="sm" onClick={() => keepRow(row)}>
                          Keep
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Section 3 — Books needing author info */}
          {booksMissingAuthor.length > 0 && (
            <Card className="p-6">
              <h2 className="font-display text-xl font-semibold text-foreground mb-1">
                Books needing author information
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Add author names so these books are correctly attributed in your library.
              </p>
              <div className="space-y-3">
                {booksMissingAuthor.map((title) => (
                  <div key={title} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2 sm:w-1/2">
                      <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate text-sm font-medium text-foreground">{title}</span>
                    </div>
                    <div className="flex flex-1 gap-2">
                      <Input
                        placeholder="Author name (First Last)"
                        value={authorEdits[title] ?? ""}
                        onChange={(e) => setAuthorEdits((prev) => ({ ...prev, [title]: e.target.value }))}
                        onBlur={() => {
                          const v = authorEdits[title];
                          if (v && v.trim()) setAuthorForBook(title, v);
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const v = authorEdits[title];
                          if (v && v.trim()) setAuthorForBook(title, v);
                        }}
                        disabled={!authorEdits[title]?.trim()}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={goBackToStep1}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cancel and start over
            </Button>
            <div className="flex flex-wrap gap-2">
              {!allAuthorsFilled && allReviewResolved && (
                <Button
                  variant="outline"
                  onClick={() => { setStep(4); runImport(true); }}
                  disabled={importing || pendingItems.length === 0}
                >
                  Import without author info
                </Button>
              )}
              <Button
                size="lg"
                onClick={() => { setStep(4); runImport(false); }}
                disabled={!allReviewResolved || !allAuthorsFilled || importing || pendingItems.length === 0}
              >
                Import {pendingItems.length} highlights →
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <Card className="p-8">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <h2 className="font-display text-xl font-semibold text-foreground">
              Importing {importProgress.done} of {importProgress.total} highlights...
            </h2>
          </div>
          <Progress
            value={importProgress.total > 0 ? (importProgress.done / importProgress.total) * 100 : 0}
          />
          <p className="text-sm text-muted-foreground mt-3">
            Please don't close this tab.
          </p>
        </Card>
      )}

      {step === 5 && importResult && (
        <div className="space-y-5">
          <Card className="p-8 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h2 className="font-display text-2xl font-semibold text-foreground mb-2">
              {importResult.imported} highlights imported from {importResult.booksTouched} books
            </h2>
            {importResult.booksMissingAuthor > 0 && (
              <p className="text-sm text-muted-foreground mt-3">
                {importResult.booksMissingAuthor}{" "}
                {importResult.booksMissingAuthor === 1 ? "book still needs" : "books still need"} author info — update in{" "}
                <Link to="/admin/studio/highlights" className="text-primary underline-offset-2 hover:underline">
                  Glean Studio
                </Link>
                .
              </p>
            )}
          </Card>

          {importResult.failed.length > 0 && (
            <Card className="p-6 border-destructive/30 bg-destructive/5">
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    {importResult.failed.length} {importResult.failed.length === 1 ? "highlight" : "highlights"} could not be imported
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    These rows are still in your review queue. Try again or skip them.
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5 text-sm max-h-40 overflow-y-auto mb-3">
                {importResult.failed.slice(0, 10).map((f) => (
                  <li key={f.row.id} className="text-muted-foreground truncate">
                    "{f.row.quote.slice(0, 60)}..." — {f.reason}
                  </li>
                ))}
                {importResult.failed.length > 10 && (
                  <li className="text-muted-foreground italic">
                    ...and {importResult.failed.length - 10} more.
                  </li>
                )}
              </ul>
              <Button variant="outline" onClick={retryFailed} disabled={importing}>
                Retry failed
              </Button>
            </Card>
          )}

          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/saved">
              <Button variant="outline">Browse my highlights</Button>
            </Link>
            <Link to="/admin/studio/highlights">
              <Button>Open Glean Studio</Button>
            </Link>
            <Button variant="ghost" onClick={goBackToStep1}>
              Import another file
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const StepBadge = ({
  n, label, active, done, disabled,
}: { n: number; label: string; active: boolean; done: boolean; disabled?: boolean }) => (
  <div
    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
      disabled
        ? "bg-muted/50 text-muted-foreground/60"
        : active
        ? "bg-primary text-primary-foreground"
        : done
        ? "bg-primary/15 text-primary"
        : "bg-muted text-muted-foreground"
    }`}
  >
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
        active ? "bg-primary-foreground/20" : "bg-background/60"
      }`}
    >
      {n}
    </span>
    <span>{label}</span>
  </div>
);

const Connector = () => <div className="h-px w-4 bg-border sm:w-6" aria-hidden />;

const SummaryRow = ({
  label, strong, highlight,
}: { label: string; strong?: boolean; highlight?: boolean }) => (
  <li className={`flex items-start gap-2 ${highlight ? "text-primary font-medium" : "text-foreground"}`}>
    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${highlight ? "bg-primary" : "bg-muted-foreground/50"}`} />
    <span className={strong ? "font-medium" : ""}>{label}</span>
  </li>
);

export default Import;
