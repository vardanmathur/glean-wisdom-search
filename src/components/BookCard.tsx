import { Book } from "@/lib/data";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";

interface BookCardProps {
  book: Book;
  reason?: string;
}

const BookCard = ({ book, reason }: BookCardProps) => {
  return (
    <Link
      to={`/book/${encodeURIComponent(book.title)}`}
      className="flex gap-4 rounded-lg border bg-card p-4 card-shadow hover:card-shadow-hover transition-all duration-300"
    >
      <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <BookOpen className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <h3 className="font-display text-base font-semibold text-foreground truncate">{book.title}</h3>
        <p className="text-sm text-muted-foreground">{book.author}</p>
        {reason && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{reason}</p>
        )}
      </div>
    </Link>
  );
};

export default BookCard;
