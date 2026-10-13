// Local dry run of the Kindle import logic against real My Clippings files. No Supabase, no DB writes.
// Run: npx vitest run src/test/kindleImport.dryrun.test.ts   (skips itself if the files are missing)
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  parseClippings,
  attachNotesAndFilter,
  collapseNoteChains,
  detectDuplicatesLevel1,
  matchAgainstLibrary,
  looksGarbled,
  levenshtein,
  parseTitleAndAuthor,
  type ParsedHighlight,
  type StagingRowDraft,
  type LibraryHighlight,
} from "@/lib/kindleImport";

const DATA_DIR = path.resolve(process.cwd(), "test data");
const OUT_DIR = path.join(DATA_DIR, "dryrun-output");
const SEP_FILE = path.join(DATA_DIR, "My Clippings - 11 Sep 2026.txt");
const OCT_FILE = path.join(DATA_DIR, "My Clippings-13 October 2026.txt");
const HAVE_FILES = existsSync(SEP_FILE) && existsSync(OCT_FILE);

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date | null | undefined) =>
  d
    ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
    : "none";
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const col = (s: string | number, n: number) => String(s).padEnd(n);
const num = (s: string | number, n: number) => String(s).padStart(n);
const keyOf = (title: string, ts: Date | null, quote: string) =>
  `${title}\u0000${ts ? ts.getTime() : "null"}\u0000${quote}`;

// ---------------------------------------------------------------------------
// Per-file block classification. Mirrors the branch order of parseClippings so we can
// label WHY a block was dropped; totals are cross-checked against parseClippings itself.
// ---------------------------------------------------------------------------
type BookRow = {
  rawTitle: string;
  title: string;
  author: string | null;
  unknown: boolean;
  garbled: boolean;
  highlights: number;
  notes: number;
  emptyEntries: number;
};

type Classified = {
  totalBlocks: number;
  reasons: Record<string, number>;
  books: Map<string, BookRow>;
  keptEntries: number;
  malformed: number;
  oversized: number;
};

function classify(contents: string): Classified {
  const normalized = contents.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const reasons: Record<string, number> = {};
  const bump = (k: string) => {
    reasons[k] = (reasons[k] ?? 0) + 1;
  };
  const books = new Map<string, BookRow>();
  const bookFor = (rawTitle: string): BookRow => {
    let b = books.get(rawTitle);
    if (!b) {
      const { title, author, unknown } = parseTitleAndAuthor(rawTitle);
      b = { rawTitle, title, author, unknown, garbled: looksGarbled(title), highlights: 0, notes: 0, emptyEntries: 0 };
      books.set(rawTitle, b);
    }
    return b;
  };
  let totalBlocks = 0;
  let keptEntries = 0;
  let malformed = 0;
  let oversized = 0;

  for (const rawBlock of normalized.split("==========")) {
    const block = rawBlock.replace(/\uFEFF/g, "").trim();
    if (!block) continue;
    totalBlocks++;
    const dashIdx = block.indexOf("\n- ");
    if (dashIdx === -1) {
      malformed++;
      bump("malformed: title and metadata merged on one line (no newline before '- ')");
      continue;
    }
    const titleLine = block.slice(0, dashIdx).trim();
    const rest = block.slice(dashIdx + 3);
    if (!titleLine || /^your clippings$/i.test(titleLine)) {
      bump("skipped silently (not counted): 'Your Clippings' pseudo-book");
      continue;
    }
    const pipeIdx = rest.lastIndexOf(" | ");
    if (pipeIdx === -1) {
      malformed++;
      bump("malformed: no ' | ' separator");
      continue;
    }
    const metaLeft = rest.slice(0, pipeIdx);
    const metaRight = rest.slice(pipeIdx + 3);
    const onIdx = metaLeft.indexOf(" on ");
    if (onIdx === -1) {
      malformed++;
      bump("malformed: no ' on '");
      continue;
    }
    const typeMatch = metaLeft.slice(0, onIdx).trim().match(/^[A-Za-z]+\s+(Highlight|Note|Bookmark)/i);
    if (!typeMatch) {
      malformed++;
      bump("malformed: unrecognised entry type");
      continue;
    }
    const type = typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1).toLowerCase();
    const splitIdx = metaRight.indexOf("\n\n");
    if (splitIdx === -1) {
      malformed++;
      bump(`malformed: no blank line after metadata (empty ${type} body)`);
      bookFor(titleLine).emptyEntries++;
      continue;
    }
    const timeData = metaRight.slice(0, splitIdx);
    const quote = metaRight.slice(splitIdx + 2).trim();
    if (timeData.indexOf("Added on") === -1) {
      malformed++;
      bump("malformed: no 'Added on'");
      continue;
    }
    const { title } = parseTitleAndAuthor(titleLine);
    if (!title) {
      bump("skipped silently (not counted): empty parsed title");
      continue;
    }
    if (type === "Highlight") {
      if (!quote || quote.length < 10) {
        bump("dropped silently (not counted): highlight under 10 chars");
        continue;
      }
      if (quote.length > 1500) {
        oversized++;
        bump("dropped (counted as oversized): highlight over 1500 chars");
        continue;
      }
    }
    keptEntries++;
    bump(`parsed: ${type}`);
    const b = bookFor(titleLine);
    if (type === "Highlight") b.highlights++;
    else if (type === "Note") b.notes++;
  }
  return { totalBlocks, reasons, books, keptEntries, malformed, oversized };
}

// ---------------------------------------------------------------------------
// Notes analysis. Mirrors attachNotesAndFilter's rule to count notes per highlight.
// ---------------------------------------------------------------------------
type NoteStat = { book: string; quotePreview: string; notes: number; myNotesLength: number };

function analyseNotes(entries: ParsedHighlight[], attached: ParsedHighlight[]) {
  const notesBefore = entries.filter((e) => e.entry_type === "Note").length;
  const collapsed = collapseNoteChains(entries);
  const result: { h: ParsedHighlight; notes: number }[] = [];
  let attachedCount = 0;
  let dropped = 0;
  for (const e of collapsed) {
    if (e.entry_type === "Bookmark") continue;
    if (e.entry_type === "Note") {
      const last = result[result.length - 1];
      if (last && last.h.entry_type === "Highlight" && last.h.book_title === e.book_title) {
        last.notes++;
        attachedCount++;
      } else {
        dropped++;
      }
      continue;
    }
    result.push({ h: e, notes: 0 });
  }
  const consistent =
    result.length === attached.length && result.every((r, i) => (r.notes > 0) === !!attached[i].my_notes);
  const stats: NoteStat[] = result
    .map((r, i) => ({
      book: r.h.book_title,
      quotePreview: trunc(r.h.quote.replace(/\s+/g, " "), 50),
      notes: r.notes,
      myNotesLength: attached[i].my_notes?.length ?? 0,
    }))
    .filter((s) => s.notes > 0)
    .sort((a, b) => b.notes - a.notes);
  return {
    attachedCount,
    dropped,
    stats,
    consistent,
    notesBefore,
    notesAfter: collapsed.filter((e) => e.entry_type === "Note").length,
  };
}

// ---------------------------------------------------------------------------
// Level-1 pair listing (reason is recomputed here for display only)
// ---------------------------------------------------------------------------
type L1Pair = { book: string; loserLen: number; winnerLen: number; how: string; loserHasNotes: boolean; loser: string; winner: string };

function level1Pairs(rows: StagingRowDraft[]): L1Pair[] {
  const byId = new Map(rows.map((r) => [r.client_id, r]));
  const pairs: L1Pair[] = [];
  for (const r of rows) {
    if (r.status !== "near_duplicate" || !r.duplicate_of_client_id) continue;
    const w = byId.get(r.duplicate_of_client_id);
    if (!w) continue;
    let how: string;
    if (w.quote.includes(r.quote)) how = "substring";
    else {
      const maxLen = Math.max(w.quote.length, r.quote.length);
      how = `levenshtein sim=${(1 - levenshtein(w.quote, r.quote) / maxLen).toFixed(3)}`;
    }
    pairs.push({
      book: r.book_title,
      loserLen: r.quote.length,
      winnerLen: w.quote.length,
      how,
      loserHasNotes: !!r.my_notes,
      loser: trunc(r.quote.replace(/\s+/g, " "), 60),
      winner: trunc(w.quote.replace(/\s+/g, " "), 60),
    });
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Import simulation (in-memory library, no DB). Follows runParse -> Step 3 -> runImport.
// ---------------------------------------------------------------------------
type Outcome =
  | "exact_duplicate_removed"
  | "level1_flagged_skipped"
  | "level2_flagged_skipped"
  | "flagged_kept_imported"
  | "winner_skipped_by_keep"
  | "imported";

const OUTCOMES: Outcome[] = [
  "exact_duplicate_removed",
  "level1_flagged_skipped",
  "level2_flagged_skipped",
  "flagged_kept_imported",
  "winner_skipped_by_keep",
  "imported",
];

type LibRow = { id: string; quote: string; book_title: string; created_at: Date; my_notes: string | null; origin: string };

type SimOptions = {
  reviewPolicy: "skip" | "keep";
  renameMap?: Record<string, string>;
};

type RowDecision = { title: string; ts: string; quotePreview: string; origin: "new" | "prior"; outcome: Outcome };

type SessionResult = {
  file: string;
  parsedEntries: number;
  malformed: number;
  oversized: number;
  highlightsAfterAttach: number;
  staged: number;
  exactRemoved: number;
  level1Flagged: number;
  level2Flagged: number;
  pendingAfterReview: number;
  imported: number;
  newTotal: number;
  priorTotal: number;
  outcomesNew: Record<Outcome, number>;
  outcomesPrior: Record<Outcome, number>;
  rows: RowDecision[];
};

const emptyOutcomes = (): Record<Outcome, number> =>
  Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;

function runSession(
  fileName: string,
  contents: string,
  library: LibRow[],
  opts: SimOptions,
  priorKeys: Set<string>,
  now: Date
): SessionResult {
  const parsed = parseClippings(contents);
  const withNotes = attachNotesAndFilter(parsed.highlights);

  const detected = detectDuplicatesLevel1(withNotes);

  const l1Flagged = new Set<StagingRowDraft>(detected.rows.filter((r) => r.status === "near_duplicate"));
  const libInput: LibraryHighlight[] = library.map((r) => ({ id: r.id, quote: r.quote, book_title: r.book_title }));
  const matches = detected.rows.length ? matchAgainstLibrary(detected.rows, libInput) : new Map();
  const l2Flagged = new Set<StagingRowDraft>();
  for (const d of detected.rows) {
    if (matches.get(d.client_id)) {
      d.status = "near_duplicate";
      l2Flagged.add(d);
    }
  }

  const byClient = new Map(detected.rows.map((r) => [r.client_id, r]));
  for (const r of detected.rows) {
    if (r.status !== "near_duplicate") continue;
    if (opts.reviewPolicy === "keep") {
      r.status = "pending";
      const partner = r.duplicate_of_client_id ? byClient.get(r.duplicate_of_client_id) : undefined;
      if (partner) partner.status = "skipped";
    } else {
      r.status = "skipped";
    }
  }

  let imported = 0;
  let pendingAfterReview = 0;
  for (const r of detected.rows) {
    if (r.status !== "pending") continue;
    pendingAfterReview++;
    const renamed = opts.renameMap?.[r.book_title] ?? r.book_title;
    library.push({
      id: `${fileName}-${library.length}`,
      quote: r.quote,
      book_title: renamed,
      created_at: r.kindle_timestamp ?? now,
      my_notes: r.my_notes,
      origin: fileName,
    });
    imported++;
  }

  const draftByKey = new Map<string, StagingRowDraft>();
  for (const d of detected.rows) draftByKey.set(`${d.book_title}\u0000${d.quote}`, d);
  const claimed = new Set<StagingRowDraft>();
  const outcomesNew = emptyOutcomes();
  const outcomesPrior = emptyOutcomes();
  const rows: RowDecision[] = [];

  for (const h of withNotes) {
    const origin: "new" | "prior" = priorKeys.has(keyOf(h.book_title, h.kindle_timestamp, h.quote)) ? "prior" : "new";
    let outcome: Outcome;
    const d = draftByKey.get(`${h.book_title}\u0000${h.quote}`);
    const sameTs = d && (d.kindle_timestamp?.getTime() ?? null) === (h.kindle_timestamp?.getTime() ?? null);
    if (!d || !sameTs || claimed.has(d)) {
      outcome = "exact_duplicate_removed";
    } else {
      claimed.add(d);
      if (l1Flagged.has(d)) outcome = d.status === "skipped" ? "level1_flagged_skipped" : "flagged_kept_imported";
      else if (l2Flagged.has(d)) outcome = d.status === "skipped" ? "level2_flagged_skipped" : "flagged_kept_imported";
      else outcome = d.status === "pending" ? "imported" : "winner_skipped_by_keep";
    }
    (origin === "new" ? outcomesNew : outcomesPrior)[outcome]++;
    rows.push({
      title: h.book_title,
      ts: fmt(h.kindle_timestamp),
      quotePreview: trunc(h.quote.replace(/\s+/g, " "), 70),
      origin,
      outcome,
    });
  }

  return {
    file: fileName,
    parsedEntries: parsed.highlights.length,
    malformed: parsed.malformedCount,
    oversized: parsed.oversizedCount,
    highlightsAfterAttach: withNotes.length,
    staged: detected.rows.length,
    exactRemoved: detected.exactDuplicatesRemoved,
    level1Flagged: detected.flaggedCount,
    level2Flagged: l2Flagged.size,
    pendingAfterReview,
    imported,
    newTotal: rows.filter((r) => r.origin === "new").length,
    priorTotal: rows.filter((r) => r.origin === "prior").length,
    outcomesNew,
    outcomesPrior,
    rows,
  };
}

type Scenario = {
  label: string;
  sequence: ("Sep" | "Oct")[];
  opts: SimOptions;
  note?: string;
};

function runScenario(sc: Scenario, files: Record<"Sep" | "Oct", string>, now: Date) {
  const library: LibRow[] = [];
  const priorKeys = new Set<string>();
  const sessions: SessionResult[] = [];
  sc.sequence.forEach((name) => {
    const res = runSession(name, files[name], library, sc.opts, priorKeys, now);
    sessions.push(res);
    const withNotes = attachNotesAndFilter(parseClippings(files[name]).highlights);
    for (const h of withNotes) priorKeys.add(keyOf(h.book_title, h.kindle_timestamp, h.quote));
  });
  return { scenario: sc, sessions, libraryRows: library.length };
}

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------
describe.skipIf(!HAVE_FILES)("Kindle import dry run (local files, no database)", () => {
  it("lib module has no imports (cannot touch Supabase, React or the DOM)", () => {
    const src = readFileSync(path.resolve(process.cwd(), "src/lib/kindleImport.ts"), "utf8");
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/\brequire\(/);
  });

  it("parses both files, simulates Sep then Oct, and writes the report", { timeout: 120_000 }, () => {
    const files = {
      Sep: readFileSync(SEP_FILE, "utf8"),
      Oct: readFileSync(OCT_FILE, "utf8"),
    };
    const now = new Date();
    const L: string[] = [];
    const out = (s = "") => L.push(s);
    const json: Record<string, unknown> = { generatedAt: fmt(now), files: { Sep: path.basename(SEP_FILE), Oct: path.basename(OCT_FILE) } };

    // ---------------- Part A: per-file report ----------------
    const perFile: Record<string, unknown> = {};
    const attachedByFile: Record<string, ParsedHighlight[]> = {};
    for (const name of ["Sep", "Oct"] as const) {
      const contents = files[name];
      const cls = classify(contents);
      const parsed = parseClippings(contents);
      const attached = attachNotesAndFilter(parsed.highlights);
      attachedByFile[name] = attached;
      const notes = analyseNotes(parsed.highlights, attached);
      const detected = detectDuplicatesLevel1(attached);
      const pairs = level1Pairs(detected.rows);

      // Harness self-checks: classifier and note analysis must agree with the real functions.
      expect(cls.keptEntries).toBe(parsed.highlights.length);
      expect(cls.malformed).toBe(parsed.malformedCount);
      expect(cls.oversized).toBe(parsed.oversizedCount);
      expect(notes.consistent).toBe(true);

      const types = { Highlight: 0, Note: 0, Bookmark: 0 };
      for (const e of parsed.highlights) types[e.entry_type]++;
      const stamps = attached.map((h) => h.kindle_timestamp).filter((d): d is Date => !!d);
      const minTs = stamps.length ? new Date(Math.min(...stamps.map((d) => d.getTime()))) : null;
      const maxTs = stamps.length ? new Date(Math.max(...stamps.map((d) => d.getTime()))) : null;

      out(`${"=".repeat(100)}`);
      out(`FILE ${name}: ${path.basename(name === "Sep" ? SEP_FILE : OCT_FILE)}`);
      out(`${"=".repeat(100)}`);
      out(`blocks: ${cls.totalBlocks} | parseClippings: kept ${parsed.highlights.length} (Highlight ${types.Highlight}, Note ${types.Note}, Bookmark ${types.Bookmark}) | malformedCount ${parsed.malformedCount} | oversizedCount ${parsed.oversizedCount}`);
      out(`notes in file ${notes.notesBefore} -> after chain collapse ${notes.notesAfter}`);
      out(`after attachNotesAndFilter: ${attached.length} highlights | notes attached ${notes.attachedCount} | notes dropped (no same-book preceding highlight) ${notes.dropped} | highlights carrying notes ${notes.stats.length}`);
      out(`highlight timestamps: ${fmt(minTs)}  ->  ${fmt(maxTs)}`);
      out("");
      out("Block outcomes (harness classification, cross-checked against parseClippings totals):");
      for (const [k, v] of Object.entries(cls.reasons).sort((a, b) => b[1] - a[1])) out(`  ${num(v, 4)}  ${k}`);
      out("");
      out("Books (raw title line -> parsed title | author | garbled? | highlights kept | notes | empty/malformed entries):");
      const bookRows = Array.from(cls.books.values()).sort((a, b) => b.highlights + b.notes - (a.highlights + a.notes));
      for (const b of bookRows) {
        out(`  ${col(trunc(b.rawTitle, 44), 44)} -> ${col(trunc(b.title, 34), 34)} | ${col(trunc(b.author ?? "(none)", 26), 26)} | ${col(b.garbled ? "GARBLED" : "-", 7)} | H ${num(b.highlights, 3)} | N ${num(b.notes, 3)} | E ${num(b.emptyEntries, 2)}`);
      }
      out("");
      out("Highlights carrying more than 3 attached notes (keystroke spam candidates):");
      const spam = notes.stats.filter((s) => s.notes > 3);
      if (!spam.length) out("  (none)");
      for (const s of spam) out(`  ${num(s.notes, 3)} notes -> my_notes ${num(s.myNotesLength, 6)} chars | ${trunc(s.book, 40)} | "${s.quotePreview}"`);
      out(`  all highlights with notes: ${notes.stats.map((s) => s.notes).join(", ") || "(none)"}`);
      out("");
      out(`Level 1 on this file alone: exact duplicates removed ${detected.exactDuplicatesRemoved} | near-duplicates flagged ${detected.flaggedCount} | rows staged ${detected.rows.length} | pending ${detected.rows.filter((r) => r.status === "pending").length}`);
      for (const p of pairs) {
        out(`  [${trunc(p.book, 28)}] ${p.how} | loser ${p.loserLen} chars ⊂ winner ${p.winnerLen} chars | loser has notes: ${p.loserHasNotes ? "YES (lost if skipped)" : "no"}`);
        out(`      loser : ${p.loser}`);
        out(`      winner: ${p.winner}`);
      }
      out("");

      perFile[name] = {
        blocks: cls.totalBlocks,
        parsed: { total: parsed.highlights.length, ...types },
        malformedCount: parsed.malformedCount,
        oversizedCount: parsed.oversizedCount,
        afterAttach: attached.length,
        notesAttached: notes.attachedCount,
        notesDropped: notes.dropped,
        reasons: cls.reasons,
        books: Array.from(cls.books.values()),
        notesStats: notes.stats,
        level1: { exactRemoved: detected.exactDuplicatesRemoved, flagged: detected.flaggedCount, staged: detected.rows.length, pairs },
        timestampRange: { min: fmt(minTs), max: fmt(maxTs) },
      };
    }
    json.perFile = perFile;

    // ---------------- Part B/C: simulations ----------------
    // Step-3 renames are derived at runtime: any title the review gate would force you to fix
    // (underscore or bare lowercase), but not titles that trip only the '--' rule.
    const needsManualFix = (t: string) =>
      looksGarbled(t) && (t.includes("_") || (!/\s/.test(t) && /^[a-z0-9]+$/.test(t)));
    const RENAMES: Record<string, string> = {};
    const renameCategories = { underscore: 0, bareLowercase: 0 };
    for (const name of ["Sep", "Oct"] as const) {
      for (const h of attachedByFile[name]) {
        if (!needsManualFix(h.book_title) || RENAMES[h.book_title]) continue;
        RENAMES[h.book_title] = `${h.book_title} [renamed]`;
        if (h.book_title.includes("_")) renameCategories.underscore++;
        else renameCategories.bareLowercase++;
      }
    }
    out(`S5 rename rule renames ${Object.keys(RENAMES).length} distinct titles (underscore ${renameCategories.underscore}, bare lowercase ${renameCategories.bareLowercase}); '--'-only titles are left alone`);
    json.renamedTitles = Object.keys(RENAMES);
    const scenarios: Scenario[] = [
      { label: "S2  Sep -> Oct, review = skip every flagged row", sequence: ["Sep", "Oct"], opts: { reviewPolicy: "skip" } },
      { label: "S5  Sep -> Oct, Step-3 renames of garbled-looking titles in both sessions", sequence: ["Sep", "Oct"], opts: { reviewPolicy: "skip", renameMap: RENAMES } },
      { label: "S6  Sep -> Oct, review = KEEP every flagged row (worst case)", sequence: ["Sep", "Oct"], opts: { reviewPolicy: "keep" } },
      { label: "C1  CONTROL: Oct alone into an empty library", sequence: ["Oct"], opts: { reviewPolicy: "skip" } },
      { label: "C3  CONTROL: Oct -> Sep (reverse order)", sequence: ["Oct", "Sep"], opts: { reviewPolicy: "skip" } },
    ];

    const scenarioJson: unknown[] = [];
    const summaryRows: string[] = [];
    for (const sc of scenarios) {
      const run = runScenario(sc, files, now);
      out(`${"-".repeat(100)}`);
      out(sc.label);
      out(`options: review=${sc.opts.reviewPolicy} renames=${sc.opts.renameMap ? Object.keys(sc.opts.renameMap).length : 0}`);
      for (const s of run.sessions) {
        // each session's outcomes must account for every highlight that came out of the parser
        expect(Object.values(s.outcomesNew).reduce((a, b) => a + b, 0) + Object.values(s.outcomesPrior).reduce((a, b) => a + b, 0)).toBe(s.highlightsAfterAttach);
        out(`  session ${s.file}`);
        out(`    parsed entries ${s.parsedEntries} | malformed ${s.malformed} | highlights after notes ${s.highlightsAfterAttach} | staged ${s.staged} | exact dups removed ${s.exactRemoved}`);
        out(`    Level-1 flagged ${s.level1Flagged} | Level-2 flagged ${s.level2Flagged} | pending after review ${s.pendingAfterReview} | IMPORTED ${s.imported}`);
        if (s.priorTotal > 0 || sc.sequence.indexOf(s.file as "Sep" | "Oct") > 0) {
          out(`    of the file's highlights: ${s.newTotal} NEW (not in an earlier file) | ${s.priorTotal} already in an earlier file`);
          out(`    ${col("outcome", 26)} ${num("new", 5)} ${num("prior", 6)}`);
          for (const o of OUTCOMES) out(`    ${col(o, 26)} ${num(s.outcomesNew[o], 5)} ${num(s.outcomesPrior[o], 6)}`);
        }
      }
      const last = run.sessions[run.sessions.length - 1];
      const importedNew = last.outcomesNew.imported + last.outcomesNew.flagged_kept_imported;
      const importedPrior = last.outcomesPrior.imported + last.outcomesPrior.flagged_kept_imported;
      const legitDedupe = last.outcomesNew.exact_duplicate_removed + last.outcomesNew.level1_flagged_skipped;
      out(`  >>> final session vs expectation: new highlights available ${last.newTotal} | imported ${importedNew} | shortfall ${last.newTotal - importedNew} | re-imported old ones ${importedPrior} | library rows after run ${run.libraryRows}`);
      out(`      of the shortfall: within-file dedupe/near-dup (Level 1) ${legitDedupe}, matched as duplicate of library (Level 2) ${last.outcomesNew.level2_flagged_skipped}, other ${last.newTotal - importedNew - legitDedupe - last.outcomesNew.level2_flagged_skipped}`);
      summaryRows.push(`  ${col(sc.label.slice(0, 3), 4)} new ${num(last.newTotal, 3)} | imported new ${num(importedNew, 3)} | L1 dedupe ${num(legitDedupe, 3)} | L2 skipped ${num(last.outcomesNew.level2_flagged_skipped, 3)} | re-imported old ${num(importedPrior, 3)}`);
      scenarioJson.push({ label: sc.label, options: sc.opts, sessions: run.sessions, libraryRows: run.libraryRows });
    }
    json.scenarios = scenarioJson;

    out(`${"=".repeat(100)}`);
    out("SUMMARY vs EXPECTED (final session of each scenario). 'new' = highlights not present in the earlier file(s).");
    out("Expected for Sep -> Oct: 65 new highlights; 0 re-imports of the 50 that Sep already contains.");
    out(`${"=".repeat(100)}`);
    for (const r of summaryRows) out(r);

    const report = L.join("\n");
    console.log(report);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(path.join(OUT_DIR, "report.txt"), report, "utf8");
    writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(json, null, 2), "utf8");
  });
});
