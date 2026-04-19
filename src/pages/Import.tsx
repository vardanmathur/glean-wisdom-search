import { useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, Upload, FileText, ArrowLeft, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

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

type StagingStatus = "pending" | "near_duplicate" | "similar";

type StagingRow = {
  quote: string;
  book_title: string;
  author: string | null;
  kindle_location: string | null;
  kindle_timestamp: Date | null;
  my_notes: string | null;
  status: StagingStatus;
};

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

function parseTitleAndAuthor(rawTitle: string): { title: string; author: string | null; unknown: boolean } {
  const t = rawTitle.trim();
  const p1 = t.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (p1) {
    const inside = p1[2].trim();
    if (inside.includes(",")) {
      const [last, first] = inside.split(",", 2).map((s) => s.trim());
      if (last && first) {
        return { title: p1[1].trim(), author: `${first} ${last}`, unknown: false };
      }
    } else if (inside.length > 0) {
      return { title: p1[1].trim(), author: inside, unknown: false };
    }
  }
  const p2 = t.match(/^(.+?)\s+by\s+(.+)$/i);
  if (p2) {
    return { title: p2[1].trim(), author: p2[2].trim(), unknown: false };
  }
  return { title: t, author: null, unknown: true };
}

function parseClippings(contents: string): {
  highlights: ParsedHighlight[];
  oversizedCount: number;
  malformedCount: number;
} {
  const blocks = contents.split("==========");
  const highlights: ParsedHighlight[] = [];
  let oversizedCount = 0;
  let malformedCount = 0;

  for (const rawBlock of blocks) {
    const block = rawBlock.replace(/^\uFEFF/, "").trim();
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

type Detected = {
  rows: StagingRow[];
  exactDuplicatesRemoved: number;
  flaggedCount: number;
};

function detectDuplicates(highlights: ParsedHighlight[]): Detected {
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

  const buckets = new Map<string, ParsedHighlight[]>();
  for (const h of deduped) {
    const arr = buckets.get(h.book_title) ?? [];
    arr.push(h);
    buckets.set(h.book_title, arr);
  }

  const statusByIndex = new Map<ParsedHighlight, StagingStatus>();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].quote;
        const b = list[j].quote;
        if (a.includes(b) || b.includes(a)) {
          const shorter = a.length < b.length ? list[i] : list[j];
          if (!statusByIndex.has(shorter)) statusByIndex.set(shorter, "near_duplicate");
          continue;
        }
        const maxLen = Math.max(a.length, b.length);
        const minLen = Math.min(a.length, b.length);
        if (maxLen === 0) continue;
        if ((maxLen - minLen) / maxLen > 0.15) continue;
        const dist = levenshtein(a, b);
        const sim = 1 - dist / maxLen;
        if (sim > 0.85) {
          if (!statusByIndex.has(list[i])) statusByIndex.set(list[i], "similar");
          if (!statusByIndex.has(list[j])) statusByIndex.set(list[j], "similar");
        }
      }
    }
  }

  let flaggedCount = 0;
  const rows: StagingRow[] = deduped.map((h) => {
    const status = statusByIndex.get(h) ?? "pending";
    if (status !== "pending") flaggedCount++;
    return {
      quote: h.quote,
      book_title: h.book_title,
      author: h.author,
      kindle_location: h.kindle_location,
      kindle_timestamp: h.kindle_timestamp,
      my_notes: h.my_notes,
      status,
    };
  });

  return { rows, exactDuplicatesRemoved: exactRemoved, flaggedCount };
}

// ============================================================================
// Main page component
// ============================================================================

type Step = 1 | 2;

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            .eq("source", "kindle")
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

      const detected = detectDuplicates(working);

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

      setSaving(true);
      const sessionId = crypto.randomUUID();
      const stagingRows = detected.rows.map((r) => ({
        user_id: user.id,
        session_id: sessionId,
        quote: r.quote,
        book_title: r.book_title,
        author: r.author,
        kindle_location: r.kindle_location,
        kindle_timestamp: r.kindle_timestamp ? r.kindle_timestamp.toISOString() : null,
        my_notes: r.my_notes,
        status: r.status,
      }));

      const BATCH = 100;
      for (let i = 0; i < stagingRows.length; i += BATCH) {
        const slice = stagingRows.slice(i, i + BATCH);
        const { error: insErr } = await supabase.from("kindle_import_staging").insert(slice);
        if (insErr) {
          console.error("staging insert error", insErr);
          setError("Could not save highlights for review. Please try again.");
          setSaving(false);
          setParsing(false);
          return;
        }
      }
      setSaving(false);

      const uniqueBooks = new Set(detected.rows.map((r) => r.book_title)).size;
      const unknownAuthorBooks = new Set(
        detected.rows.filter((r) => !r.author).map((r) => r.book_title)
      ).size;

      setSummary({
        totalReady: detected.rows.length,
        uniqueBooks,
        exactDuplicatesRemoved: detected.exactDuplicatesRemoved,
        flaggedCount: detected.flaggedCount,
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

  const goBackToStep1 = async () => {
    if (user) {
      await supabase.from("kindle_import_staging").delete().eq("user_id", user.id);
    }
    setStep(1);
    setSummary(null);
    setFile(null);
    setFileContents("");
    setError(null);
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
        <StepBadge n={2} label="Parse & review" active={step === 2} done={false} />
        <Connector />
        <StepBadge n={3} label="Confirm" active={false} done={false} disabled />
        <Connector />
        <StepBadge n={4} label="Import" active={false} done={false} disabled />
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button disabled size="lg">
                        Next: Review and import →
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Coming in next update</TooltipContent>
                </Tooltip>
              </div>
            </>
          )}
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
