import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getBookByTitle, getHighlightsByBook } from "@/lib/data";
import HighlightCard from "@/components/HighlightCard";
import { BookOpen, ExternalLink, ArrowLeft, Loader2 } from "lucide-react";

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
        <Link to="/" className="text-primary hover:underline text-sm mt-2 inline-block">
          Go home
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <Link
        to="/"
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
          {book.description && (
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{book.description}</p>
          )}
          <a
            href="#"
            className="inline-flex items-center gap-1.5 mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            View on Amazon <ExternalLink className="h-3.5 w-3.5" />
          </a>
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
