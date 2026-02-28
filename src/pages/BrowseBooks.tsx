import { useQuery } from "@tanstack/react-query";
import { getAllBooks } from "@/lib/data";
import BookCard from "@/components/BookCard";
import { Loader2 } from "lucide-react";

const BrowseBooks = () => {
  const { data: books = [], isLoading } = useQuery({
    queryKey: ["all-books"],
    queryFn: getAllBooks,
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl text-foreground mb-2">Browse by Book</h1>
      <p className="text-muted-foreground mb-8">
        Explore highlights from {books.length} book{books.length !== 1 ? "s" : ""}
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              reason={`${book.highlightCount} highlight${book.highlightCount !== 1 ? "s" : ""}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BrowseBooks;
