import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getAmazonUrl, getAllBooks, getGoodreadsUrl } from "@/lib/data";
import SortFilterBar, { SortOption } from "@/components/SortFilterBar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BookOpen, Loader2, ShoppingCart } from "lucide-react";

const BrowseBooks = () => {
  const { data: books = [], isLoading } = useQuery({
    queryKey: ["all-books"],
    queryFn: getAllBooks,
  });
  const [sort, setSort] = useState<SortOption>("most-highlights");

  const sorted = useMemo(() => {
    const list = [...books];
    switch (sort) {
      case "name-asc":
        return list.sort((a, b) => a.title.localeCompare(b.title));
      case "most-highlights":
        return list.sort((a, b) => (b.highlightCount ?? 0) - (a.highlightCount ?? 0));
      case "fewest-highlights":
        return list.sort((a, b) => (a.highlightCount ?? 0) - (b.highlightCount ?? 0));
      case "longest":
        return list.sort((a, b) => (b.avgHighlightLength ?? 0) - (a.avgHighlightLength ?? 0));
      case "shortest":
        return list.sort((a, b) => (a.avgHighlightLength ?? 0) - (b.avgHighlightLength ?? 0));
      default:
        return list;
    }
  }, [books, sort]);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-3xl text-foreground mb-2">Browse by Book</h1>
        <p className="text-muted-foreground mb-6">
          Explore highlights from {books.length} book{books.length !== 1 ? "s" : ""}
        </p>

        <SortFilterBar sort={sort} onSortChange={setSort} />

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 w-full overflow-hidden">
            {sorted.map((book) => {
              const reason = `${book.highlightCount} highlight${
                book.highlightCount !== 1 ? "s" : ""
              }`;

              return (
                <div
                  key={book.id}
                  className="group relative flex gap-4 rounded-lg border bg-card p-4 card-shadow hover:card-shadow-hover transition-all duration-300"
                >
                  <Link
                    to={`/book/${encodeURIComponent(book.title)}`}
                    className="absolute inset-0 z-0 rounded-lg"
                  />

                  <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary overflow-hidden">
                    {book.coverImageUrl ? (
                      <img src={book.coverImageUrl} alt={book.title} className="h-full w-full object-cover" />
                    ) : (
                      <BookOpen className="h-6 w-6" />
                    )}
                  </div>

                  <div className="min-w-0 relative z-10 overflow-hidden">
                <Tooltip>
                  <TooltipTrigger className="w-full text-left block max-w-full overflow-hidden">
                    <h3 className="font-display text-base font-semibold text-foreground break-words cursor-default">{book.title}</h3>
                  </TooltipTrigger>
                  <TooltipContent>{book.title} by {book.author}</TooltipContent>
                </Tooltip>
                <p className="text-sm text-muted-foreground">{book.author}</p>
                    {reason && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{reason}</p>
                    )}
                  </div>

                  <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 opacity-90 md:opacity-0 md:pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
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
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 text-center text-xs text-muted-foreground">
          As an Amazon Associate I earn from qualifying purchases.
        </div>
      </div>
    </TooltipProvider>
  );
};

export default BrowseBooks;
