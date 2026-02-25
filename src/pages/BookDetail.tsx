import { useParams } from "react-router-dom";
import { books, highlights, getBookByTitle } from "@/lib/data";
import HighlightCard from "@/components/HighlightCard";
import { BookOpen, ExternalLink, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const BookDetail = () => {
  const { title } = useParams();
  const decodedTitle = decodeURIComponent(title || "");
  const book = getBookByTitle(decodedTitle);

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

  const bookHighlights = highlights.filter((h) => book.highlightIds.includes(h.id));

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="flex gap-6 mb-8">
        <div className="flex h-32 w-24 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BookOpen className="h-10 w-10" />
        </div>
        <div>
          <h1 className="font-display text-3xl text-foreground">{book.title}</h1>
          <p className="text-muted-foreground mt-1">{book.author}</p>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{book.description}</p>
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
