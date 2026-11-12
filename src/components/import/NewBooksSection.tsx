import { useMemo, useState } from "react";
import { AlertTriangle, BookPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { countUndecided, type BookChoice, type BookRef, type NewBookItem } from "@/lib/bookAliases";

interface NewBooksSectionProps {
  items: NewBookItem[];
  choices: Record<string, BookChoice>;
  /** Existing books, for the manual match list and for naming a chosen book. */
  books: BookRef[];
  onChoose: (key: string, choice: BookChoice | null) => void;
  /** Loading books and aliases failed, so no matching suggestions are available. */
  loadFailed?: boolean;
  onRetry?: () => void;
}

const bookLabel = (b: BookRef) => (b.author ? `${b.title} by ${b.author}` : b.title);

// Import review: book titles that match neither an existing book nor an alias. A likely existing book is
// suggested; the user picks "Use existing" or "Create new" for each suggestion before importing.
const NewBooksSection = ({ items, choices, books, onChoose, loadFailed, onRetry }: NewBooksSectionProps) => {
  const [matching, setMatching] = useState<NewBookItem | null>(null);
  const [query, setQuery] = useState("");

  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? books.filter((b) => b.title.toLowerCase().includes(q) || (b.author ?? "").toLowerCase().includes(q))
      : books;
    return list.slice(0, 50);
  }, [books, query]);

  const warning = loadFailed ? (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-3 rounded-lg border-2 border-amber-500 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-sm font-semibold">
          Couldn't check against your library, so matching suggestions are unavailable. Retry before importing large files.
        </p>
      </div>
      {onRetry && (
        <Button onClick={onRetry} className="h-11 shrink-0 sm:h-9">
          Retry
        </Button>
      )}
    </div>
  ) : null;

  if (items.length === 0) {
    return warning ? (
      <Card className="p-6">
        <h2 className="mb-3 font-display text-xl font-semibold text-foreground">New books</h2>
        {warning}
      </Card>
    ) : null;
  }
  const left = countUndecided(items, choices);

  const closeMatch = () => {
    setMatching(null);
    setQuery("");
  };

  return (
    <Card className="p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-foreground">New books</h2>
        <span className="text-sm text-muted-foreground">{left === 0 ? "All decided" : `${left} left to decide`}</span>
      </div>
      {warning}
      <p className="mb-4 text-sm text-muted-foreground">
        These titles are not in your library yet. If one looks like a book you already have, choose it so the highlights
        go to the same book.
      </p>

      <div className="space-y-3">
        {items.map((item) => {
          const choice = choices[item.key];
          const chosen = choice?.kind === "existing" ? byId.get(choice.bookId) : undefined;
          return (
            <div key={item.key} className="space-y-2 rounded-md border border-border/60 bg-background/40 p-3">
              <p className="break-words text-sm text-foreground">
                <span className="font-medium">New book:</span> {item.title}
                {item.author ? <span className="text-muted-foreground"> — {item.author}</span> : null}
              </p>

              {choice?.kind === "existing" ? (
                <p className="break-words text-sm text-muted-foreground">
                  Will use your existing <span className="font-medium text-foreground">{chosen ? bookLabel(chosen) : "book"}</span>.
                </p>
              ) : choice?.kind === "new" ? (
                <p className="text-sm text-muted-foreground">Will be created as a new book.</p>
              ) : item.suggestion ? (
                <p className="break-words text-sm text-muted-foreground">
                  Looks like your existing{" "}
                  <span className="font-medium text-foreground">{bookLabel(item.suggestion)}</span>.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Will be created.</p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {!choice && item.suggestion && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => onChoose(item.key, { kind: "existing", bookId: item.suggestion!.id })}
                      className="h-10 sm:h-8"
                    >
                      Use existing
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onChoose(item.key, { kind: "new" })} className="h-10 sm:h-8">
                      Create new
                    </Button>
                  </>
                )}
                {choice && (
                  <Button size="sm" variant="ghost" onClick={() => onChoose(item.key, null)} className="h-10 sm:h-8">
                    Change
                  </Button>
                )}
                {!choice && !item.suggestion && (
                  <button
                    type="button"
                    onClick={() => setMatching(item)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <BookPlus className="h-3.5 w-3.5" /> Match to an existing book…
                  </button>
                )}
                {!choice && item.suggestion && (
                  <button
                    type="button"
                    onClick={() => setMatching(item)}
                    className="text-xs text-primary hover:underline"
                  >
                    Pick a different book…
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!matching} onOpenChange={(o) => !o && closeMatch()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Match to an existing book</DialogTitle>
            <DialogDescription className="break-words">
              {matching ? `Which book is “${matching.title}”?` : ""}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or author"
            aria-label="Search your books"
            autoFocus
          />
          <ul className="max-h-[50vh] min-w-0 space-y-1 overflow-y-auto">
            {matches.length === 0 ? (
              <li className="p-2 text-sm text-muted-foreground">No books match.</li>
            ) : (
              matches.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (matching) onChoose(matching.key, { kind: "existing", bookId: b.id });
                      closeMatch();
                    }}
                    className="w-full break-words rounded-md border border-transparent p-2 text-left text-sm hover:border-border hover:bg-muted/50"
                  >
                    <span className="font-medium text-foreground">{b.title}</span>
                    {b.author ? <span className="text-muted-foreground"> — {b.author}</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default NewBooksSection;
