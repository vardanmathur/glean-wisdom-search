import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  searchHighlightsSemantic,
  getRecommendedBooks,
  synthesiseWisdom,
} from "@/lib/data";
import type { Highlight } from "@/lib/data";
import HighlightCard from "@/components/HighlightCard";
import BookCard from "@/components/BookCard";
import DownloadWorksheetButton from "@/components/DownloadWorksheetButton";
import { ArrowLeft, Leaf } from "lucide-react";
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

function getUniqueBooks(
  highlights: Highlight[]
): { title: string; author: string; coverImageUrl?: string }[] {
  const seen = new Set<string>();
  const books: { title: string; author: string; coverImageUrl?: string }[] = [];
  for (const h of highlights) {
    const key = `${h.bookTitle}::${h.author}`;
    if (!seen.has(key)) {
      seen.add(key);
      books.push({ title: h.bookTitle, author: h.author, coverImageUrl: h.coverImageUrl });
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
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-8 mb-8 card-shadow-hover">
      <div className="flex items-center gap-2 mb-5">
        <Leaf className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium tracking-[0.2em] text-primary uppercase">
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

const SkeletonHighlightCard = () => (
  <div className="rounded-lg border bg-card p-5 space-y-3">
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-[92%]" />
    <Skeleton className="h-4 w-[78%]" />
    <div className="flex items-center gap-2 pt-2">
      <Skeleton className="h-10 w-8 rounded" />
      <div className="space-y-1.5 flex-1">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  </div>
);

const SearchResults = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";

  const FIVE_MIN = 5 * 60 * 1000;

  // Single source of truth — semantic search (with internal keyword fallback in data.ts)
  const searchQuery = useQuery({
    queryKey: ["search-semantic", query],
    queryFn: () => searchHighlightsSemantic(query),
    enabled: !!query,
    staleTime: Infinity,
    gcTime: FIVE_MIN,
  });

  const data = searchQuery.data;
  const isLoading = searchQuery.isLoading || (!!query && !data);
  const results: Highlight[] = data?.highlights ?? [];
  const coverage = data?.coverage ?? "good";
  const isPoor = coverage === "poor";
  const totalFound = data?.totalFound ?? 0;

  // Synthesis runs only after search completes successfully with results — never refires
  const { data: synthesis = "", isLoading: isSynthesising } = useQuery({
    queryKey: ["synthesis", query, results.length, isPoor],
    queryFn: () => synthesiseWisdom(query, results, isPoor),
    enabled: searchQuery.isSuccess && results.length > 0,
    staleTime: Infinity,
    gcTime: FIVE_MIN,
  });

  // Recommended books — only for good coverage with results
  const { data: recommendedBooks = [] } = useQuery({
    queryKey: ["recommended", query, results.length],
    queryFn: () => getRecommendedBooks(query, results),
    enabled: searchQuery.isSuccess && results.length > 0 && !isPoor,
    staleTime: Infinity,
    gcTime: FIVE_MIN,
  });

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 overflow-x-hidden">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Refine your search
      </Link>

      <h1 className="font-display text-2xl text-foreground mb-2">
        Results for "{query}"
      </h1>

      {!isLoading && results.length > 0 && !!synthesis && (
        <div className="mb-6 mt-2">
          <DownloadWorksheetButton
            query={query}
            synthesis={synthesis}
            highlights={results}
            disabled={isSynthesising}
          />
        </div>
      )}

      {isLoading ? (
        <div className="mt-6">
          <p className="text-sm text-muted-foreground italic mb-4 animate-pulse">
            Finding the most relevant wisdom…
          </p>
          <div className="space-y-4">
            <SkeletonHighlightCard />
            <SkeletonHighlightCard />
            <SkeletonHighlightCard />
          </div>
        </div>
      ) : isPoor ? (
        <>
          <div className="rounded-lg border bg-muted/40 p-5 mb-6 mt-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {data?.message ||
                "This topic isn't well covered in Glean's library yet. Here are some loosely related ideas that might still help:"}
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
      ) : results.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center card-shadow mt-4">
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
          <p className="text-sm text-muted-foreground mb-6">
            {totalFound <= 10
              ? `${totalFound || results.length} highlight${(totalFound || results.length) !== 1 ? "s" : ""} found`
              : `10 of ${totalFound} highlights used for synthesis`}
          </p>

          <SynthesisCard
            synthesis={synthesis}
            isLoading={isSynthesising}
            highlightCount={results.length}
          />

          <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 px-4 py-4">
            <p className="text-xs font-semibold tracking-widest text-primary uppercase mb-3">
              Explore these books
            </p>
            <div className="flex flex-wrap gap-5">
              {getUniqueBooks(results).slice(0, 3).map((book) => (
                <Link
                  key={`${book.title}::${book.author}`}
                  to={`/book/${encodeURIComponent(book.title)}`}
                  className="group flex flex-col items-center w-20 hover:opacity-90 transition-opacity"
                >
                  {book.coverImageUrl ? (
                    <img
                      src={book.coverImageUrl}
                      alt={book.title}
                      className="h-[88px] w-16 rounded-md object-cover shadow-sm"
                    />
                  ) : (
                    <div className="h-[88px] w-16 rounded-md bg-primary/15 flex items-center justify-center shadow-sm">
                      <span className="text-xl font-semibold text-primary">
                        {book.title?.charAt(0) || "?"}
                      </span>
                    </div>
                  )}
                  <span className="mt-2 text-xs font-medium text-primary/80 group-hover:text-primary text-center line-clamp-2 leading-tight">
                    {book.title}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <Separator className="mt-6 mb-6" />

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

      {recommendedBooks.length > 0 && !isPoor && (
        <div>
          <h2 className="font-display text-xl text-foreground mb-4">
            Books to go deeper
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recommendedBooks.map((b) => (
              <BookCard
                key={b.id}
                book={b}
                reason={b.description}
                matchedHighlightCount={b.matchedHighlightCount}
              />
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
