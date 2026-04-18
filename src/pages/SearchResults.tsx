import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  searchHighlights,
  searchHighlightsSemantic,
  getRecommendedBooks,
  synthesiseWisdom,
  getAmazonUrl,
} from "@/lib/data";
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

  // Phase 1 — fast keyword search (typically <500ms). Renders immediately so users
  // never see a blank screen for long.
  const {
    data: keywordData,
    isLoading: kwLoading,
    isFetching: kwFetching,
  } = useQuery({
    queryKey: ["search-keyword", query],
    queryFn: () => searchHighlights(query),
    enabled: !!query,
  });

  // Phase 2 — semantic search runs in PARALLEL with Phase 1 (not gated on it).
  // When it resolves, it replaces Phase 1 results.
  const {
    data: semanticData,
    isLoading: semLoading,
    isFetching: semFetching,
    isError: semError,
  } = useQuery({
    queryKey: ["search-semantic", query],
    queryFn: () => searchHighlightsSemantic(query),
    enabled: !!query,
  });

  const keywordReady = !!keywordData && !kwLoading && !kwFetching;
  const semanticReady = !!semanticData && !semLoading && !semFetching;

  // Display priority: semantic > keyword > loading
  const usingSemantic = semanticReady;
  const results: Highlight[] = semanticReady
    ? semanticData!.highlights
    : keywordReady
    ? keywordData!.highlights
    : [];
  const totalFound = semanticReady
    ? semanticData!.totalFound
    : keywordReady
    ? keywordData!.totalFound
    : 0;
  const coverage = semanticReady ? semanticData!.coverage : "good";
  const coverageMessage = semanticReady ? semanticData!.message : null;
  const isPoor = semanticReady && coverage === "poor";

  // Diagnostic: trace what each phase returns so we can spot when semantic falls back silently
  if (typeof window !== "undefined" && query) {
    // eslint-disable-next-line no-console
    console.log("[SearchResults]", {
      query,
      keywordReady,
      semanticReady,
      semanticCoverage: semanticData?.coverage,
      semanticHighlights: semanticData?.highlights.length,
      isPoor,
      totalFound,
    });
  }

  // Show Phase 1 keyword results with a "refining" indicator while semantic is still loading
  const showRefiningIndicator =
    keywordReady && !semanticReady && !semError;

  // Synthesis only runs after Phase 2 (semantic) results — never on Phase 1 keyword results
  const { data: synthesis = "", isLoading: isSynthesising } = useQuery({
    queryKey: ["synthesis", query, semanticData?.highlights.length ?? 0, isPoor],
    queryFn: () => synthesiseWisdom(query, semanticData!.highlights, isPoor),
    enabled: !!query && semanticReady && (semanticData?.highlights.length ?? 0) > 0,
  });

  // Recommended books only after Phase 2 completes
  const { data: recommendedBooks = [] } = useQuery({
    queryKey: ["recommended", query, semanticData?.highlights ?? []],
    queryFn: () => getRecommendedBooks(query, semanticData!.highlights),
    enabled:
      !!query && semanticReady && (semanticData?.highlights.length ?? 0) > 0 && !isPoor,
  });

  // Initial loading: nothing has resolved yet
  const initialLoading = !keywordReady && !semanticReady;

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

      {initialLoading ? (
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
          {/* Hide the count line entirely while loading to avoid "0 highlights found" flicker */}
          {(usingSemantic || keywordReady) && (
            <p className="text-sm text-muted-foreground mb-2">
              {totalFound <= 10
                ? `${totalFound} highlight${totalFound !== 1 ? "s" : ""} found`
                : `10 of ${totalFound} highlights used for synthesis`}
            </p>
          )}

          {showRefiningIndicator && (
            <p className="text-xs italic text-primary/80 mb-6 flex items-center gap-1.5">
              Refining results with semantic search
              <span className="inline-flex gap-0.5">
                <span className="h-1 w-1 rounded-full bg-primary/60 animate-pulse" />
                <span
                  className="h-1 w-1 rounded-full bg-primary/60 animate-pulse"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="h-1 w-1 rounded-full bg-primary/60 animate-pulse"
                  style={{ animationDelay: "300ms" }}
                />
              </span>
            </p>
          )}

          {!showRefiningIndicator && (usingSemantic || keywordReady) && (
            <div className="mb-6" />
          )}

          {/* Synthesis only shown once semantic results are in */}
          {usingSemantic && (
            <SynthesisCard
              synthesis={synthesis}
              isLoading={isSynthesising}
              highlightCount={results.length}
            />
          )}

          {usingSemantic && results.length > 0 && (
            <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
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

          {results.length === 0 && (usingSemantic || (keywordReady && !semLoading && !semFetching)) ? (
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
          ) : results.length > 0 ? (
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
          ) : null}
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
