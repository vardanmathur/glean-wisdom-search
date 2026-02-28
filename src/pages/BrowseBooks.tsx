import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAllBooks } from "@/lib/data";
import BookCard from "@/components/BookCard";
import SortFilterBar, { SortOption } from "@/components/SortFilterBar";
import { Loader2 } from "lucide-react";

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              reason={`${book.highlightCount} highlight${book.highlightCount !== 1 ? "s" : ""}${book.avgHighlightLength ? ` · avg ${book.avgHighlightLength} chars` : ""}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BrowseBooks;
