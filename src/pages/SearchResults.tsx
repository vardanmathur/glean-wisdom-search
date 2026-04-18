import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchHighlightsSemantic, getRecommendedBooks, synthesiseWisdom, getAmazonUrl } from "@/lib/data";
import type { Highlight } from "@/lib/data";
import HighlightCard from "@/components/HighlightCard";
import BookCard from "@/components/BookCard";
import { ArrowLeft, Loader2, Leaf } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import ReactMarkdown from "react-markdown";

const SECTION_LABELS = [
  "MY UNDERSTANDING OF YOUR PROBLEM",
  "WHAT THE BOOKS SUGGEST",
  "ONE THING WORTH TRYING",
  "A BOOK WORTH READING",
  "SOMETHING TO SIT WITH",
] as const;

function parseSynthesisSections(text: string): { label: string; content: string }[] {
  const sections: { label: string; content: string }[] = [];

  for (let i = 0; i < SECTION_LABELS.length; i++) {
    const label = SECTION_LABELS[i];
    const startIdx = text.indexOf(label);
    if (startIdx === -1) continue;

    const contentStart = startIdx + label.length;
    const nextLabel = SECTION_LABELS[i + 1];
    const endIdx = nextLabel ? text.indexOf(nextLabel) : -1;
    const content = (endIdx === -1 ? text.slice(contentStart) : text.slice(contentStart, endIdx)).trim();

    if (content) {
      sections.push({ label, content });
    }
  }

  return sections;
}
function getUniqueBooks(highlights: Highlight[]): { title: string; author: string }[] {
  const seen = new Set<string>();
  const books: { title: string; author: string }[] = [];
  for (const h of highlights) {
    const key = `${h.bookTitle}::${h.author}`;
    if (!seen.has(key)) {
      seen.add(key);
      books.push({ title: h.bookTitle, author: h.author });
    }
  }
  return books;
}

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

  const sections = synthesis ? parseSynthesisSections(synthesis) : [];
  const hasSections = sections.length > 0;

  return (
    <div className="rounded-xl border-l-4 border-primary bg-primary/5 p-6 mb-8">
      <div className="flex items-center gap-2 mb-5">
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
          <Skeleton className="h-4 w-[60%]" />
          <Separator className="my-4 bg-primary/20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[90%]" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[80%]" />
          <p className="text-xs text-muted-foreground mt-4 italic">
            Finding wisdom for your question…
          </p>
        </div>
      ) : hasSections ? (
        <div className="space-y-5">
          {sections.map((section, i) => (
            <div key={section.label}>
              {i > 0 && <Separator className="mb-5 bg-primary/20" />}
              <h3 className="text-xs font-semibold tracking-widest text-primary uppercase mb-2">
                {section.label}
              </h3>
              <div className="text-base leading-relaxed text-foreground prose prose-sm max-w-none prose-p:my-2 prose-strong:text-foreground">
                <ReactMarkdown>{section.content}</ReactMarkdown>
              </div>
            </div>
          ))}
          {highlightCount > 0 && (
            <p className="text-xs text-muted-foreground mt-4">
              Based on {highlightCount} curated highlight{highlightCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="text-base leading-relaxed text-foreground prose prose-sm max-w-none prose-p:my-2 prose-strong:text-foreground">
            <ReactMarkdown>{synthesis}</ReactMarkdown>
          </div>
          {highlightCount > 0 && (
            <p className="text-xs text-muted-foreground mt-4">
              Based on {highlightCount} curated highlight{highlightCount !== 1 ? "s" : ""}
            </p>
          )}
        </>
      )}
    </div>
  );
};

const SearchResults = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";

  const { data: searchData, isLoading, isFetching } = useQuery({
    queryKey: ["search-semantic", query],
    queryFn: () => searchHighlightsSemantic(query),
    enabled: !!query,
  });

  // Only treat data as ready once the query has resolved for THIS query string.
  // This prevents a flicker of "0 highlights found" while loading or while
  // stale data from a previous query is still in cache.
  const dataReady = !!searchData && !isLoading && !isFetching;
  const results = dataReady ? searchData!.highlights : [];
  const totalFound = dataReady ? searchData!.totalFound : 0;
  const coverage = dataReady ? searchData!.coverage : "good";
  const coverageMessage = dataReady ? searchData!.message : null;
  const isPoor = dataReady && coverage === "poor";

  const { data: recommendedBooks = [] } = useQuery({
    queryKey: ["recommended", query, results],
    queryFn: () => getRecommendedBooks(query, results),
    enabled: !!query && results.length > 0 && !isPoor,
  });

  const { data: synthesis = "", isLoading: isSynthesising } = useQuery({
    queryKey: ["synthesis", query, results.length, isPoor],
    queryFn: () => synthesiseWisdom(query, results, isPoor),
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

      {!dataReady ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Finding the most relevant wisdom…
          </p>
        </div>
      ) : isPoor ? (
        <>
          <div className="rounded-lg border bg-muted/40 p-5 mb-6 mt-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {coverageMessage ||
                "Glean doesn't have strong coverage on this topic yet. Here are a few loosely related ideas that might still help."}
            </p>
          </div>

          <SynthesisCard
            synthesis={synthesis}
            isLoading={isSynthesising}
            highlightCount={0}
          />

          {results.length > 0 && (
            <div className="space-y-4 mb-12 opacity-80">
              {results.map((h, i) => (
                <div key={h.id}>
                  <HighlightCard highlight={h} index={i} />
                  <p className="text-xs text-muted-foreground mt-1 ml-1">Loosely related</p>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-8">
            {totalFound <= 10
              ? `${totalFound} highlight${totalFound !== 1 ? "s" : ""} found`
              : `10 of ${totalFound} highlights used for synthesis`}
          </p>

          <SynthesisCard
            synthesis={synthesis}
            isLoading={isSynthesising}
            highlightCount={results.length}
          />

          {results.length > 0 && (
            <div className="mb-6 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
              <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-2">Explore these books</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {getUniqueBooks(results).slice(0, 3).map((book) => (
                  <a
                    key={`${book.title}::${book.author}`}
                    href={getAmazonUrl(book.title, book.author)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary/80 hover:text-primary hover:underline transition-colors"
                  >
                    {book.title}
                  </a>
                ))}
              </div>
            </div>
          )}

          {results.length > 0 && <Separator className="mt-6 mb-6" />}

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
                  <div key={h.id}>
                    <HighlightCard highlight={h} index={i} />
                    {h.tier === "moderate" && (
                      <p className="text-xs text-muted-foreground mt-1 ml-1">Loosely related</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {recommendedBooks.length > 0 && !isPoor && (
        <div>
          <h2 className="font-display text-xl text-foreground mb-4">
            Books to go deeper
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recommendedBooks.map((b) => (
              <BookCard key={b.id} book={b} reason={b.description} matchedHighlightCount={b.matchedHighlightCount} />
            ))}
          </div>
        </div>
      )}
      <div className="mt-8 text-center text-xs text-muted-foreground">
        As an Amazon Associate I earn from qualifying purchases.
      </div>
    </div>
  );
};

export default SearchResults;
