import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { refreshFingerprint } from "@/lib/refreshFingerprint";
import {
  decideCurrent,
  fetchOverlapHighlights,
  fetchOverlapPairs,
  fitHint,
  initReview,
  isReviewDone,
  resolveOverlap,
  sharePercent,
  skipCurrent,
  undoLast,
  undoOverlap,
  type ReviewState,
  type TagOverlapPair,
} from "@/lib/tagOverlap";

interface PairReviewProps {
  tagA: string;
  tagB: string;
  onBack: () => void;
}

const PairReview = ({ tagA, tagB, onBack }: PairReviewProps) => {
  const [state, setState] = useState<ReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  // Fetched once per visit: refetching mid-review would reset the queue.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tag-overlap-highlights", tagA, tagB],
    queryFn: () => fetchOverlapHighlights(tagA, tagB),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data && !state) setState(initReview(data));
  }, [data, state]);

  if (isLoading || (data && !state)) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !state) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Couldn't load highlights for this pair.</p>
        <Button variant="outline" onClick={onBack}>Back to pairs</Button>
      </div>
    );
  }

  const total = state.items.length;
  const done = isReviewDone(state);
  const item = done ? null : state.items[state.pos];
  const canUndo = state.decided.length > 0 && !busy;

  const resolve = async (removed: string | null) => {
    if (!item) return;
    setBusy(true);
    try {
      const res = await resolveOverlap(item.highlight_id, tagA, tagB, removed);
      if (!res.success) {
        toast.error(res.error ?? "Something went wrong");
        setState(skipCurrent(state));
        return;
      }
      if (removed) refreshFingerprint([item.highlight_id]);
      setState(decideCurrent(state, removed));
      setNotesOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save — please try again");
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    const last = state.decided[state.decided.length - 1];
    if (!last) return;
    const target = state.items[last.index];
    setBusy(true);
    try {
      const res = await undoOverlap(target.highlight_id, tagA, tagB);
      if (!res.success) {
        toast.error(res.error ?? "Something went wrong");
        return;
      }
      if (last.removed) refreshFingerprint([target.highlight_id]);
      setState(undoLast(state, res.tags));
      setNotesOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't undo — please try again");
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    setState(skipCurrent(state));
    setNotesOpen(false);
  };

  const header = (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-base font-medium text-foreground break-words">
          {tagA} <span className="text-muted-foreground">vs</span> {tagB}
        </p>
        <p className="text-xs text-muted-foreground">
          {done ? `${total} of ${total}` : `${state.pos + 1} of ${total}`}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onBack} className="shrink-0">
        All pairs
      </Button>
    </div>
  );

  if (!item) {
    return (
      <div>
        {header}
        <div className="rounded-xl border bg-card p-6 text-center">
          <p className="text-sm text-foreground">
            {total === 0
              ? "Nothing left to review for this pair."
              : `Done. ${state.decided.length} decided, ${state.skipped} skipped.`}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={onBack} className="h-11 sm:h-9">Back to pairs</Button>
            <Button variant="outline" onClick={undo} disabled={!canUndo} className="h-11 gap-1.5 sm:h-9">
              <Undo2 className="h-4 w-4" /> Undo last
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hint = fitHint(item.fit_a, item.fit_b, tagA, tagB);
  const fmt = (v: number | null) => (v === null ? "n/a" : v.toFixed(2));

  return (
    <div>
      {header}
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <blockquote className="whitespace-pre-wrap break-words text-base leading-relaxed text-foreground">
          {item.quote}
        </blockquote>
        <p className="mt-3 text-sm text-muted-foreground break-words">
          {item.book_title} — {item.book_author}
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {item.tags.map((t) => {
            const inPair = t === tagA || t === tagB;
            return (
              <span
                key={t}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  inPair ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                }`}
              >
                {t}
              </span>
            );
          })}
        </div>

        {item.my_notes && item.my_notes.trim() && (
          <Collapsible open={notesOpen} onOpenChange={setNotesOpen} className="mt-3">
            <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ChevronDown className={`h-4 w-4 transition-transform ${notesOpen ? "rotate-180" : ""}`} />
              Notes
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-secondary/50 p-3 text-sm text-foreground">
                {item.my_notes}
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}

        <p className="mt-4 text-sm text-muted-foreground break-words">
          Fit: {tagA} {fmt(item.fit_a)} · {tagB} {fmt(item.fit_b)}
          <span className="ml-2 font-medium text-foreground">{hint}</span>
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Button onClick={() => resolve(null)} disabled={busy} className="h-11 break-words">
            Keep both
          </Button>
          <Button variant="outline" onClick={() => resolve(tagA)} disabled={busy} className="h-auto min-h-11 whitespace-normal break-words">
            Remove {tagA}
          </Button>
          <Button variant="outline" onClick={() => resolve(tagB)} disabled={busy} className="h-auto min-h-11 whitespace-normal break-words">
            Remove {tagB}
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={skip} disabled={busy} className="h-11">
            Skip
          </Button>
          <Button variant="ghost" onClick={undo} disabled={!canUndo} className="h-11 gap-1.5">
            <Undo2 className="h-4 w-4" /> Undo last
          </Button>
        </div>
      </div>
    </div>
  );
};

const TagOverlapReview = () => {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<{ a: string; b: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tag-overlap-pairs"],
    queryFn: () => fetchOverlapPairs(),
    staleTime: 0,
  });

  const leave = () => {
    setActive(null);
    queryClient.invalidateQueries({ queryKey: ["tag-overlap-pairs"] });
    queryClient.invalidateQueries({ queryKey: ["tag-counts"] });
  };

  if (active) return <PairReview tagA={active.a} tagB={active.b} onBack={leave} />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Couldn't load tag pairs.</p>
        <Button variant="outline" onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }

  const pairs: TagOverlapPair[] = (data ?? []).filter((p) => p.to_review > 0);

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Tag pairs that often sit on the same highlight, most overlapping first. Review one highlight at a time.
      </p>
      {pairs.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          No pairs left to review.
        </div>
      ) : (
        <div className="space-y-2">
          {pairs.map((p) => (
            <div
              key={`${p.tag_a}|${p.tag_b}`}
              className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium text-foreground break-words">
                  {p.tag_a} ({p.count_a}) · {p.tag_b} ({p.count_b})
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p.shared} shared · {sharePercent(p.share_of_smaller)}% of smaller · {p.to_review} left to review
                </p>
              </div>
              <Button
                size="sm"
                variant={p.to_review < p.shared ? "default" : "outline"}
                onClick={() => setActive({ a: p.tag_a, b: p.tag_b })}
                className="h-10 shrink-0 sm:h-8"
              >
                {p.to_review < p.shared ? "Continue" : "Review"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TagOverlapReview;
