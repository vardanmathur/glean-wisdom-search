import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchHighlights, getRecommendedBooks, synthesiseWisdom } from "@/lib/data";
import HighlightCard from "@/components/HighlightCard";
import BookCard from "@/components/BookCard";
import { ArrowLeft, Loader2, Leaf } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const SynthesisCard = ({
  synthesis,
  isLoading,
  highlightCount,
}: {
  synthesis: string;
  isLoading: boolean;
  highlightCount: number;
}) => {
  if (!isLoading && !synthesis) return null;

  return (
    <div className="rounded-xl border-l-4 border-primary bg-primary/5 p-6 mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Leaf className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium tracking-wide text-primary uppercase">
          Glean's take
        </h2>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[95%]" />
          <Skeleton className="h-4 w-[85%]" />
          <p className="text-xs text-muted-foreground mt-4 italic">
            Finding wisdom for your question…
          </p>
        </div>
      ) : (
        <>
          <p className="text-base leading-relaxed text-foreground whitespace-pre-line">
            {synthesis}
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            Based on {highlightCount} curated highlight{highlightCount !== 1 ? "s" : ""}
          </p>
        </>
      )}
    </div>
  );
};

const SearchResults = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["search", query],
    queryFn: () => searchHighlights(query),
    enabled: !!query,
  });

  const { data: recommendedBooks = [] } = useQuery({
    queryKey: ["recommended", query],
    queryFn: () => getRecommendedBooks(query),
    enabled: !!query,
  });

  const { data: synthesis = "", isLoading: isSynthesising } = useQuery({
    queryKey: ["synthesis", query, results.length],
    queryFn: () => synthesiseWisdom(query, results),
    enabled: !!query && results.length > 0,
  });

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

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-8">
            {results.length} highlight{results.length !== 1 ? "s" : ""} found
          </p>

          <SynthesisCard
            synthesis={synthesis}
            isLoading={isSynthesising}
            highlightCount={results.length}
          />

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
            <>
              <h2 className="font-display text-lg text-foreground mb-4">
                The wisdom behind this
              </h2>
              <div className="space-y-4 mb-12">
                {results.map((h, i) => (
                  <HighlightCard key={h.id} highlight={h} index={i} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {recommendedBooks.length > 0 && (
        <div>
          <h2 className="font-display text-xl text-foreground mb-4">
            Books to go deeper
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
