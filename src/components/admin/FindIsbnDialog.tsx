import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { findIsbnCandidates, type IsbnCandidate } from "@/lib/findIsbns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  author: string;
  // ISBN-13 -> title of the other book that already has it.
  usedIsbns: Map<string, string>;
  onPick: (isbn13: string) => void;
}

type Status = "loading" | "failed" | "done";

const DEFAULT_ROWS = 3;
const MAX_ROWS = 5;

const FindIsbnDialog = ({ open, onOpenChange, title, author, usedIsbns, onPick }: Props) => {
  const isMobile = useIsMobile();
  const [status, setStatus] = useState<Status>("loading");
  const [candidates, setCandidates] = useState<IsbnCandidate[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus("loading");
    setCandidates([]);
    setShowMore(false);
    findIsbnCandidates(title, author)
      .then((result) => {
        if (cancelled) return;
        setCandidates(result.candidates);
        setStatus(result.failed ? "failed" : "done");
      })
      .catch((err) => {
        console.error("[FindIsbn] lookup failed", err);
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
    // The title and author are read once per search (when the layer opens or Retry is pressed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attempt]);

  // Rows already used by another book sink to the bottom; the first strong, free row is the best match.
  const ordered = useMemo(() => {
    const free = candidates.filter((c) => !usedIsbns.has(c.isbn13));
    const used = candidates.filter((c) => usedIsbns.has(c.isbn13));
    return [...free, ...used];
  }, [candidates, usedIsbns]);
  const bestIsbn = useMemo(
    () => ordered.find((c) => c.match === "strong" && !usedIsbns.has(c.isbn13))?.isbn13 ?? null,
    [ordered, usedIsbns],
  );
  const capped = ordered.slice(0, MAX_ROWS);
  const visible = showMore ? capped : capped.slice(0, DEFAULT_ROWS);

  const pick = (isbn13: string) => {
    onPick(isbn13);
    onOpenChange(false);
  };

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto px-1">
      {status === "loading" && (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching editions…
        </p>
      )}

      {status === "failed" && (
        <div className="flex flex-wrap items-center gap-3 py-6 text-sm text-destructive">
          <span>Search failed - try again</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </Button>
        </div>
      )}

      {status === "done" && ordered.length === 0 && (
        <p className="py-6 text-sm text-muted-foreground">No editions found</p>
      )}

      {status === "done" && visible.length > 0 && (
        <ul className="space-y-2 py-1">
          {visible.map((c) => {
            const usedBy = usedIsbns.get(c.isbn13);
            // Open Library only knows when the work was first published, not this edition's year.
            const year = c.year && c.source === "Open Library" ? `first published ${c.year}` : c.year;
            const line2 = [c.authors.join(", "), c.publisher, year].filter(Boolean).join(" · ");
            return (
              <li key={c.isbn13}>
                <button
                  type="button"
                  disabled={!!usedBy}
                  onClick={() => pick(c.isbn13)}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                    usedBy ? "cursor-not-allowed opacity-50" : "hover:bg-muted active:bg-muted"
                  }`}
                >
                  {c.coverUrl && (
                    <img
                      src={c.coverUrl}
                      alt=""
                      className="h-10 w-7 shrink-0 rounded-sm border object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{c.title}</span>
                    {line2 && <span className="block truncate text-xs text-muted-foreground">{line2}</span>}
                    <span className="block truncate text-[11px] tabular-nums text-muted-foreground">
                      {c.isbn13}
                      {usedBy ? ` · Already used by ${usedBy}` : ""}
                    </span>
                  </span>
                  {c.isbn13 === bestIsbn && (
                    <Badge variant="secondary" className="shrink-0 whitespace-nowrap font-normal">
                      Best match
                    </Badge>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {status === "done" && !showMore && capped.length > DEFAULT_ROWS && (
        <div className="py-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowMore(true)}>
            Show more
          </Button>
        </div>
      )}
    </div>
  );

  const cancel = (
    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
      Cancel
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Pick the right edition</DrawerTitle>
            <DrawerDescription className="break-words">
              {title}
              {author ? ` · ${author}` : ""}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col px-4">{body}</div>
          <div className="p-4">{cancel}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>Pick the right edition</DialogTitle>
          <DialogDescription className="break-words">
            {title}
            {author ? ` · ${author}` : ""}
          </DialogDescription>
        </DialogHeader>
        {body}
        <div className="flex justify-end">{cancel}</div>
      </DialogContent>
    </Dialog>
  );
};

export default FindIsbnDialog;
