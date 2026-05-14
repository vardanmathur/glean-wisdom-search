import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getAmazonUrl, getBookByTitle, getGoodreadsUrl, getHighlightsByBook } from "@/lib/data";
import HighlightCard from "@/components/HighlightCard";
import SortFilterBar, { SortOption } from "@/components/SortFilterBar";
import { useHighlightSaveCounts } from "@/hooks/useHighlightSaves";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { BookOpen, ArrowLeft, Loader2, ShoppingCart, Pencil, RefreshCw } from "lucide-react";

const MIN_HIGHLIGHTS_FOR_SUMMARY = 10;

const BookDetail = () => {
  const { title } = useParams();
  const decodedTitle = decodeURIComponent(title || "");
  const { isAdmin } = useIsAdmin();

  const { data: book, isLoading } = useQuery({
    queryKey: ["book", decodedTitle],
    queryFn: () => getBookByTitle(decodedTitle),
    enabled: !!decodedTitle,
  });

  const { data: bookHighlights = [] } = useQuery({
    queryKey: ["book-highlights", book?.id],
    queryFn: () => getHighlightsByBook(book!.id),
    enabled: !!book?.id,
  });

  const [sort, setSort] = useState<SortOption>("most-saved");
  const highlightIds = useMemo(() => bookHighlights.map((h) => h.id), [bookHighlights]);
  const { data: saveCounts } = useHighlightSaveCounts(highlightIds);

  // --- Summary state ---
  const [summary, setSummary] = useState<string>("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const enoughHighlights = bookHighlights.length >= MIN_HIGHLIGHTS_FOR_SUMMARY;

  const fetchSummary = useMemo(
    () => async () => {
      if (!book?.id || !enoughHighlights) return;
      setSummaryLoading(true);
      setSummaryFailed(false);
      try {
        // Read cache for manually_edited flag
        const { data: cached } = await supabase
          .from("book_summaries")
          .select("summary, manually_edited")
          .eq("book_id", book.id)
          .maybeSingle();

        if (cached?.manually_edited) {
          setSummary(cached.summary);
          setManuallyEdited(true);
          setSummaryLoading(false);
          return;
        }

        const quotes = bookHighlights.slice(0, 20).map((h) => h.text);
        const { data, error } = await supabase.functions.invoke("generate-book-summary", {
          body: {
            bookId: book.id,
            bookTitle: book.title,
            author: book.author,
            highlights: quotes,
          },
        });

        if (error || !data?.summary) {
          setSummaryFailed(true);
          setSummary("");
          setManuallyEdited(false);
        } else {
          setSummary(data.summary);
          setManuallyEdited(false);
        }
      } catch (e) {
        console.error("Summary fetch failed:", e);
        setSummaryFailed(true);
      } finally {
        setSummaryLoading(false);
      }
    },
    [book?.id, book?.title, book?.author, bookHighlights, enoughHighlights]
  );

  useEffect(() => {
    if (book?.id && bookHighlights.length > 0 && enoughHighlights) {
      fetchSummary();
    } else if (book?.id && bookHighlights.length > 0 && !enoughHighlights) {
      setSummary("");
      setSummaryFailed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, bookHighlights.length, enoughHighlights]);

  const handleRegenerate = async () => {
    if (!book?.id) return;
    setSummary("");
    setSummaryLoading(true);
    const { error: deleteError } = await supabase
      .from("book_summaries")
      .delete()
      .eq("book_id", book.id);
    if (deleteError) {
      toast({ title: "Could not clear cache", description: deleteError.message, variant: "destructive" });
      setSummaryLoading(false);
      return;
    }
    await fetchSummary();
  };

  const openEdit = () => {
    setEditText(summary);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!book?.id) return;
    setSaving(true);
    const trimmed = editText.trim();

    // Try update first; if no row, insert.
    const { data: existing } = await supabase
      .from("book_summaries")
      .select("id")
      .eq("book_id", book.id)
      .maybeSingle();

    let dbError: string | null = null;
    if (existing) {
      const { error } = await supabase
        .from("book_summaries")
        .update({ summary: trimmed, manually_edited: true })
        .eq("book_id", book.id);
      if (error) dbError = error.message;
    } else {
      const { error } = await supabase
        .from("book_summaries")
        .insert({ book_id: book.id, summary: trimmed, manually_edited: true });
      if (error) dbError = error.message;
    }

    setSaving(false);
    if (dbError) {
      toast({ title: "Save failed", description: dbError, variant: "destructive" });
      return;
    }
    setSummary(trimmed);
    setManuallyEdited(true);
    setSummaryFailed(false);
    setEditOpen(false);
    toast({ title: "Summary updated" });
  };

  const sortedHighlights = useMemo(() => {
    const list = [...bookHighlights];
    switch (sort) {
      case "most-saved":
        return list.sort(
          (a, b) => (saveCounts?.get(b.id) ?? 0) - (saveCounts?.get(a.id) ?? 0)
        );
      case "longest":
        return list.sort((a, b) => b.text.length - a.text.length);
      case "shortest":
        return list.sort((a, b) => a.text.length - b.text.length);
      default:
        return list;
    }
  }, [bookHighlights, sort, saveCounts]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8 text-center">
        <p className="text-muted-foreground">Book not found.</p>
        <Link to="/books" className="text-primary hover:underline text-sm mt-2 inline-block">
          Go home
        </Link>
      </div>
    );
  }

  const showFallback = !enoughHighlights || summaryFailed;
  const goodreadsSearchUrl = `https://www.goodreads.com/search?q=${encodeURIComponent(
    `${book.title} ${book.author}`
  )}`;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <Link
        to="/books"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="flex gap-6 mb-8">
        <div className="flex h-32 w-24 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary overflow-hidden">
          {book.coverImageUrl ? (
            <img src={book.coverImageUrl} alt={book.title} className="h-full w-full object-cover" />
          ) : (
            <BookOpen className="h-10 w-10" />
          )}
        </div>
        <div>
          <h1 className="font-display text-xl sm:text-3xl text-foreground">{book.title}</h1>
          <p className="text-muted-foreground mt-1">{book.author}</p>
          <TooltipProvider delayDuration={0}>
            <div className="mt-2 flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={getAmazonUrl(book.title, book.author)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/80 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                    aria-label="Buy on Amazon"
                  >
                    <ShoppingCart className="h-4 w-4" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Buy on Amazon</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={getGoodreadsUrl(book.title, book.author)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/80 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                    aria-label="See on Goodreads"
                  >
                    <BookOpen className="h-4 w-4" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>See on Goodreads</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
          {book.description && (
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{book.description}</p>
          )}
        </div>
      </div>

      {/* About this book */}
      <section className="mb-8">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            About this book
          </span>
          {isAdmin && (
            <div className="flex items-center gap-1">
              {!manuallyEdited && summary && !summaryLoading && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRegenerate}
                  className="h-7 px-2 text-xs"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Regenerate
                </Button>
              )}
              {(summary || showFallback) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={openEdit}
                  className="h-7 w-7"
                  aria-label="Edit summary"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        {summaryLoading ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating summary...
          </div>
        ) : summary ? (
          <p className="text-sm text-muted-foreground leading-relaxed mt-2">{summary}</p>
        ) : (
          <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Not enough highlights for a full summary yet.{" "}
            <a
              href={goodreadsSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Learn more on Goodreads →
            </a>
          </div>
        )}
      </section>

      <h2 className="font-display text-xl text-foreground mb-4">
        Highlights ({bookHighlights.length})
      </h2>
      {bookHighlights.length > 1 && (
        <SortFilterBar
          sort={sort}
          onSortChange={setSort}
          options={["most-saved", "longest", "shortest"]}
        />
      )}
      <div className="space-y-4">
        {sortedHighlights.map((h, i) => (
          <HighlightCard key={h.id} highlight={h} index={i} />
        ))}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit book summary</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={6}
            placeholder="Write the summary..."
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editText.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BookDetail;
