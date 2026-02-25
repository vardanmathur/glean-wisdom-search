import { useSearchParams, Link } from "react-router-dom";
import { searchHighlights, getRecommendedBooks } from "@/lib/data";
import HighlightCard from "@/components/HighlightCard";
import BookCard from "@/components/BookCard";
import { ArrowLeft } from "lucide-react";

const SearchResults = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const results = searchHighlights(query);
  const recommendedBooks = getRecommendedBooks(query);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Refine your search
      </Link>

      <h1 className="font-display text-2xl text-foreground mb-2">
        Results for "{query}"
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        {results.length} highlight{results.length !== 1 ? "s" : ""} found
      </p>

      {results.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center card-shadow">
          <p className="text-muted-foreground mb-2">No highlights matched your search.</p>
          <p className="text-sm text-muted-foreground">
            Try different keywords or{" "}
            <Link to="/topics" className="text-primary hover:underline">
              browse by topic
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-4 mb-12">
          {results.map((h, i) => (
            <HighlightCard key={h.id} highlight={h} index={i} />
          ))}
        </div>
      )}

      {recommendedBooks.length > 0 && (
        <div>
          <h2 className="font-display text-xl text-foreground mb-4">
            Books You Might Find Useful
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recommendedBooks.map((b) => (
              <BookCard key={b.id} book={b} reason={b.description} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchResults;
