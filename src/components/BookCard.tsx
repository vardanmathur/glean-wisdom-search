import { Book } from "@/lib/data";
import { Link } from "react-router-dom";
import BookCover from "@/components/BookCover";

interface BookCardProps {
  book: Book;
  reason?: string;
  matchedHighlightCount?: number;
}

const BookCard = ({ book, reason, matchedHighlightCount }: BookCardProps) => {
  return (
    <Link
      to={`/book/${encodeURIComponent(book.title)}`}
      className="flex gap-4 rounded-lg border bg-card p-4 card-shadow hover:card-shadow-hover transition-all duration-300"
    >
      <BookCover
        title={book.title}
        author={book.author}
        sourceUrl={book.coverImageUrl}
        cachedUrl={book.coverCachedUrl}
        cachedFrom={book.coverCachedFrom}
        bookId={book.id}
        className="h-20 w-14 shrink-0 rounded-md bg-primary/10"
      />
      <div className="min-w-0">
        <h3 className="font-display text-base font-semibold text-foreground">{book.title}</h3>
        <p className="text-sm text-muted-foreground">{book.author}</p>
        {matchedHighlightCount != null && matchedHighlightCount > 0 && (
          <p className="text-xs text-primary font-medium mt-1">
            {matchedHighlightCount} relevant highlight{matchedHighlightCount !== 1 ? "s" : ""} from this book
          </p>
        )}
        {reason && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{reason}</p>
        )}
      </div>
    </Link>
  );
};

export default BookCard;
