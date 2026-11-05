import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  KIND_ORDER,
  defaultKeepId,
  findDuplicatePairs,
  groupPairsByKind,
  markContained,
  markDifference,
  mergeTagsAndNotes,
  pairKey,
  shouldMoveBookmark,
  type DuplicateKind,
  type DuplicatePair,
  type Marked,
} from "@/lib/findDuplicateHighlights";
import { refreshFingerprintAfterEdit } from "@/lib/refreshFingerprint";

export interface DupRow {
  id: string;
  quote: string;
  book_id: string | null;
  tags: string[] | null;
  my_notes: string | null;
  created_at: string;
  book_title: string | null;
  book_author: string | null;
}

const HIDDEN_KEY = "glean_hidden_duplicate_highlight_pairs";

const SECTION_TITLES: Record<DuplicateKind, { title: string; hint: string }> = {
  near_identical: { title: "Near-identical", hint: "Same book, same text apart from a few characters. Default keep: the older save." },
  contained: { title: "Contained", hint: "Same book, one save sits inside a longer one. Default keep: the longer text." },
  other_book: { title: "Same text in another book", hint: "For information. Default action: Not a duplicate." },
};

function readHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function saveHidden(hidden: Set<string>) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
  } catch {
    /* storage unavailable: hidden pairs just won't persist */
  }
}

const bookLabel = (r: DupRow) =>
  `${r.book_title ?? "Unknown book"}${r.book_author ? ` by ${r.book_author}` : ""}`;

const Marks = ({ text, marked }: { text: string; marked: Marked | null }) =>
  marked ? (
    <>
      {marked.before}
      {marked.match ? <mark className="rounded bg-primary/20 px-0.5 text-foreground">{marked.match}</mark> : null}
      {marked.after}
    </>
  ) : (
    <>{text}</>
  );

interface Props {
  rows: DupRow[];
  refreshing: boolean;
  onRefresh: () => void;
  onClose: () => void;
}

const DuplicateHighlightPairs = ({ rows, refreshing, onRefresh, onClose }: Props) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [rowMap, setRowMap] = useState<Map<string, DupRow>>(() => new Map(rows.map((r) => [r.id, r])));
  const [pairs, setPairs] = useState<DuplicatePair[]>(() => findDuplicatePairs(rows));
  const [hidden, setHidden] = useState<Set<string>>(readHidden);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [keepOverride, setKeepOverride] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmPair, setConfirmPair] = useState<DuplicatePair | null>(null);

  // A fresh scan replaces everything on screen.
  useEffect(() => {
    setRowMap(new Map(rows.map((r) => [r.id, r])));
    setPairs(findDuplicatePairs(rows));
    setSkipped(new Set());
    setKeepOverride({});
  }, [rows]);

  const keyOf = (p: DuplicatePair) => pairKey(p.first, p.second);
  const keepFor = (p: DuplicatePair) => keepOverride[keyOf(p)] ?? defaultKeepId(p);
  const otherFor = (p: DuplicatePair) => (keepFor(p) === p.first ? p.second : p.first);

  const visible = useMemo(
    () => pairs.filter((p) => !hidden.has(pairKey(p.first, p.second)) && !skipped.has(pairKey(p.first, p.second))),
    [pairs, hidden, skipped],
  );
  const hiddenCount = useMemo(
    () => pairs.filter((p) => hidden.has(pairKey(p.first, p.second))).length,
    [pairs, hidden],
  );
  const grouped = useMemo(() => groupPairsByKind(visible), [visible]);

  const markNotDuplicate = (p: DuplicatePair) => {
    const next = new Set(hidden);
    next.add(keyOf(p));
    setHidden(next);
    saveHidden(next);
  };

  const skip = (p: DuplicatePair) => setSkipped((prev) => new Set(prev).add(keyOf(p)));

  const showHiddenAgain = () => {
    const next = new Set<string>();
    setHidden(next);
    saveHidden(next);
  };

  // Copies tags and notes onto the kept highlight, saves it, refreshes its fingerprint, then deletes the other.
  const keepAndDelete = async (p: DuplicatePair) => {
    const keep = rowMap.get(keepFor(p));
    const other = rowMap.get(otherFor(p));
    if (!keep || !other) return;
    const key = keyOf(p);
    setBusyKey(key);
    try {
      const merged = mergeTagsAndNotes(keep, other);
      if (merged.changed) {
        const updates = { tags: merged.tags, my_notes: merged.my_notes };
        const { error } = await supabase.from("highlights").update(updates).eq("id", keep.id);
        if (error) throw error;
        refreshFingerprintAfterEdit(keep.id, { quote: keep.quote, tags: keep.tags, my_notes: keep.my_notes }, updates);
        setRowMap((prev) => new Map(prev).set(keep.id, { ...keep, tags: merged.tags, my_notes: merged.my_notes }));
      }
      // Deleting a highlight also deletes its bookmarks, so move yours onto the kept copy first.
      if (user) {
        const { data: saved, error: savedError } = await supabase
          .from("saved_highlights")
          .select("highlight_id")
          .eq("user_id", user.id)
          .in("highlight_id", [keep.id, other.id]);
        if (savedError) throw savedError;
        if (shouldMoveBookmark((saved ?? []).map((r) => r.highlight_id), other.id, keep.id)) {
          const { error: moveError } = await supabase
            .from("saved_highlights")
            .insert({ user_id: user.id, highlight_id: keep.id });
          // 23505 = already saved (duplicate key): nothing to move.
          if (moveError && moveError.code !== "23505") throw moveError;
          queryClient.invalidateQueries({ queryKey: ["saved-highlight-ids"] });
          queryClient.invalidateQueries({ queryKey: ["saved-highlights-list"] });
        }
      }
      const { error: delError } = await supabase.from("highlights").delete().eq("id", other.id);
      if (delError) {
        toast.error(merged.changed ? "Tags and notes were copied, but the delete failed" : "Delete failed");
        console.error("Duplicate delete failed:", delError);
        return;
      }
      setPairs((prev) => prev.filter((x) => x.first !== other.id && x.second !== other.id));
      setRowMap((prev) => {
        const next = new Map(prev);
        next.delete(other.id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["studio-highlights"] });
      toast.success("Kept one, deleted the other");
    } catch (err) {
      console.error("Keep and delete failed:", err);
      toast.error("Couldn't save — nothing was deleted");
    } finally {
      setBusyKey(null);
    }
  };

  const counts = KIND_ORDER.map((k) => grouped[k].length);
  const total = counts.reduce((a, b) => a + b, 0);

  const renderVersion = (p: DuplicatePair, row: DupRow, marked: Marked | null, size: "longer" | "shorter" | null) => {
    const isKeep = keepFor(p) === row.id;
    const key = keyOf(p);
    return (
      <label
        key={row.id}
        className={`flex min-w-0 cursor-pointer flex-col gap-2 rounded-md border p-3 ${
          isKeep ? "border-primary/40 bg-primary/5" : "border-border"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="radio"
            name={`keep-${key}`}
            checked={isKeep}
            onChange={() => setKeepOverride((prev) => ({ ...prev, [key]: row.id }))}
            className="accent-primary"
          />
          <span className={isKeep ? "font-medium text-primary" : "text-muted-foreground"}>
            {isKeep ? "Keep" : "Delete"}
          </span>
          {size && <span className="text-muted-foreground">{size}</span>}
          <span className="text-muted-foreground">{new Date(row.created_at).toLocaleDateString()}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          <Marks text={row.quote} marked={marked} />
        </p>
        <p className={`break-words text-xs ${p.kind === "other_book" ? "font-medium text-foreground" : "text-muted-foreground"}`}>
          {bookLabel(row)}
        </p>
        {(row.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {row.tags!.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">
                {t}
              </Badge>
            ))}
          </div>
        )}
        {row.my_notes && row.my_notes.trim() && (
          <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded bg-secondary/50 p-2 text-xs text-muted-foreground">
            Notes: {row.my_notes}
          </p>
        )}
      </label>
    );
  };

  const renderPair = (p: DuplicatePair) => {
    const a = rowMap.get(p.first);
    const b = rowMap.get(p.second);
    if (!a || !b) return null;
    const key = keyOf(p);
    const busy = busyKey === key;
    // Highlight the shared part: where the shorter text sits in the longer one, or what differs between near copies.
    let markA: Marked | null = null;
    let markB: Marked | null = null;
    if (p.kind === "near_identical") {
      const diff = markDifference(a.quote, b.quote);
      markA = diff.a;
      markB = diff.b;
    } else {
      markB = markContained(b.quote, a.quote);
    }
    const crossBook = p.kind === "other_book";
    const sizeA = p.kind === "near_identical" || a.quote.trim().length === b.quote.trim().length ? null : "shorter";
    const sizeB = sizeA ? "longer" : null;
    const deleteBtn = (
      <Button
        variant={crossBook ? "outline" : "destructive"}
        onClick={() => (crossBook ? setConfirmPair(p) : keepAndDelete(p))}
        disabled={busy}
        className="h-11 gap-1.5 sm:h-9"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        Keep selected, delete other{crossBook ? "…" : ""}
      </Button>
    );
    const notDup = (
      <Button variant={crossBook ? "default" : "outline"} onClick={() => markNotDuplicate(p)} disabled={busy} className="h-11 sm:h-9">
        Not a duplicate
      </Button>
    );
    return (
      <div key={key} className="space-y-3 rounded-lg border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2">
          {renderVersion(p, a, markA, sizeA)}
          {renderVersion(p, b, markB, sizeB)}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {crossBook ? (
            <>
              {notDup}
              {deleteBtn}
            </>
          ) : (
            <>
              {deleteBtn}
              {notDup}
            </>
          )}
          <Button variant="ghost" onClick={() => skip(p)} disabled={busy} className="h-11 sm:h-9">
            Skip
          </Button>
        </div>
      </div>
    );
  };

  const confirmKeep = confirmPair ? rowMap.get(keepFor(confirmPair)) : undefined;
  const confirmOther = confirmPair ? rowMap.get(otherFor(confirmPair)) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">Duplicates</h2>
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "No likely duplicates left to review."
              : `${total} pair${total === 1 ? "" : "s"} to review: ${counts[0]} near-identical, ${counts[1]} contained, ${counts[2]} in another book`}
            {hiddenCount > 0 && ` · ${hiddenCount} hidden as not duplicates`}
          </p>
        </div>
        <div className="flex gap-2">
          {hiddenCount > 0 && (
            <Button variant="ghost" size="sm" onClick={showHiddenAgain}>
              Show hidden again
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-2">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close duplicates view
          </Button>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          {refreshing ? "Scanning…" : "All clean — nothing left to review."}
        </div>
      ) : (
        KIND_ORDER.map((kind) =>
          grouped[kind].length === 0 ? null : (
            <section key={kind} className="space-y-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-foreground">
                  {SECTION_TITLES[kind].title} ({grouped[kind].length})
                </h3>
                <p className="text-sm text-muted-foreground">{SECTION_TITLES[kind].hint}</p>
              </div>
              {grouped[kind].map(renderPair)}
            </section>
          ),
        )
      )}

      <AlertDialog open={!!confirmPair} onOpenChange={(o) => !o && setConfirmPair(null)}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the copy in another book?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {confirmKeep && confirmOther && (
                <>
                  This deletes the copy in <span className="font-medium text-foreground">{bookLabel(confirmOther)}</span> and keeps
                  the one in <span className="font-medium text-foreground">{bookLabel(confirmKeep)}</span>. Tags and notes from the
                  deleted copy are copied onto the kept one first. This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const p = confirmPair;
                setConfirmPair(null);
                if (p) keepAndDelete(p);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DuplicateHighlightPairs;
