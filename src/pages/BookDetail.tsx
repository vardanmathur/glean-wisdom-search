import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getAmazonUrl, getBookByTitle, getGoodreadsUrl, getHighlightsByBook } from "@/lib/data";
import HighlightCard from "@/components/HighlightCard";
import SortFilterBar, { SortOption } from "@/components/SortFilterBar";
import { useHighlightSaveCounts } from "@/hooks/useHighlightSaves";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BookOpen, ExternalLink, ArrowLeft, Loader2, ShoppingCart } from "lucide-react";

const BookDetail = () => {
  const { title } = useParams();
  const decodedTitle = decodeURIComponent(title || "");

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
          <h1 className="font-display text-3xl text-foreground">{book.title}</h1>
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

      <h2 className="font-display text-xl text-foreground mb-4">
        Highlights ({bookHighlights.length})
      </h2>
      <div className="space-y-4">
        {bookHighlights.map((h, i) => (
          <HighlightCard key={h.id} highlight={h} index={i} />
        ))}
      </div>
    </div>
  );
};

export default BookDetail;
