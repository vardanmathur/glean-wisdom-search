import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAllTopics, getHighlightsByTag, getRelatedTopics } from "@/lib/data";
import { Link, useParams } from "react-router-dom";
import HighlightCard from "@/components/HighlightCard";
import SortFilterBar, { SortOption } from "@/components/SortFilterBar";
import { ArrowLeft, Leaf, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";

const BrowseTopics = () => {
  const { tag } = useParams();

  if (tag) {
    return <TopicDetail tag={decodeURIComponent(tag)} />;
  }

  return <TopicsList />;
};

const TopicDetail = ({ tag }: { tag: string }) => {
  const { data: highlights = [], isLoading } = useQuery({
    queryKey: ["highlights-by-tag", tag],
    queryFn: () => getHighlightsByTag(tag),
  });

  const { data: topics = [] } = useQuery({
    queryKey: ["topics"],
    queryFn: getAllTopics,
  });

  const [summary, setSummary] = useState<string>("");
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const { data: relatedTopics = [] } = useQuery({
    queryKey: ["related-topics", tag],
    queryFn: () => getRelatedTopics(tag),
    enabled: !!tag,
  });

  useEffect(() => {
    let cancelled = false;

    if (!tag || isLoading || highlights.length === 0 || summary) {
      return;
    }

    const fetchSummary = async () => {
      try {
        setIsSummaryLoading(true);

        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 5000)
        );

        const invokePromise = supabase.functions.invoke("generate-topic-summary", {
          body: {
            topicName: tag,
            highlights: highlights.slice(0, 5).map((h) => h.text),
          },
        });

        const result = await Promise.race([invokePromise, timeoutPromise]);

        if (cancelled || result === null) {
          return;
        }

        const { data, error } = result;
        if (!error && data?.summary && typeof data.summary === "string") {
          setSummary(data.summary);
        }
      } catch {
        // Silent failure — degrade gracefully
      } finally {
        if (!cancelled) {
          setIsSummaryLoading(false);
        }
      }
    };

    fetchSummary();

    return () => {
      cancelled = true;
    };
  }, [tag, isLoading, highlights, summary]);

  const topic = topics.find((t) => t.name === tag);
  const bookCount = useMemo(() => {
    const ids = new Set<string>();
    for (const h of highlights) {
      if (h.bookId) ids.add(h.bookId);
    }
    return ids.size;
  }, [highlights]);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <Link
        to="/topics"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> All Topics
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Leaf className="h-5 w-5 text-primary" />
          <h1 className="font-display text-3xl text-foreground">{tag}</h1>
        </div>
        {!isLoading && (
          <p className="text-xs text-muted-foreground/60">
            {highlights.length} highlights · {bookCount} books
          </p>
        )}
        {isSummaryLoading && (
          <div className="space-y-2 mt-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
        {!isSummaryLoading && summary && (
          <div className="mt-4 border-l-2 border-primary bg-primary/5 rounded-r-md p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">AI Synthesis</p>
            <p className="text-sm leading-relaxed text-muted-foreground italic">{summary}</p>
          </div>
        )}
      </div>

      <Separator className="mb-6" />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {highlights.map((h, i) => (
              <HighlightCard key={h.id} highlight={h} index={i} />
            ))}
          </div>

          {relatedTopics.length >= 2 && (
            <div className="mt-10">
              <h2 className="font-display text-xl text-foreground mb-3">
                Related Topics
              </h2>
              <div className="flex flex-wrap gap-2">
                {relatedTopics.slice(0, 6).map((topic) => (
                  <Link
                    key={topic.id}
                    to={`/topics/${encodeURIComponent(topic.name)}`}
                    className="rounded-full bg-primary/8 border border-primary/20 px-3 py-1.5 text-xs sm:text-sm font-medium text-primary hover:bg-primary/15 transition-colors"
                  >
                    {topic.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const TopicsList = () => {
  const { data: topics = [], isLoading } = useQuery({
    queryKey: ["topics"],
    queryFn: getAllTopics,
  });
  const [sort, setSort] = useState<SortOption>("most-highlights");

  const sorted = useMemo(() => {
    const list = [...topics];
    switch (sort) {
      case "name-asc":
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case "most-highlights":
        return list.sort((a, b) => b.highlightCount - a.highlightCount);
      case "fewest-highlights":
        return list.sort((a, b) => a.highlightCount - b.highlightCount);
      case "longest":
        return list.sort((a, b) => (b.avgHighlightLength ?? 0) - (a.avgHighlightLength ?? 0));
      case "shortest":
        return list.sort((a, b) => (a.avgHighlightLength ?? 0) - (b.avgHighlightLength ?? 0));
      default:
        return list;
    }
  }, [topics, sort]);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl text-foreground mb-2">Browse by Topic</h1>
      <p className="text-muted-foreground mb-6">
        Explore wisdom across {topics.length} topics
      </p>

      <SortFilterBar sort={sort} onSortChange={setSort} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((topic) => (
            <Link
              key={topic.id}
              to={`/topics/${encodeURIComponent(topic.name)}`}
              className="group rounded-lg border bg-card p-5 card-shadow hover:card-shadow-hover hover:border-primary/20 transition-all duration-300"
            >
              <h3 className="font-display text-lg text-foreground group-hover:text-primary transition-colors">
                {topic.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {topic.description}
              </p>
              <p className="mt-3 text-xs text-primary font-medium">
                {topic.highlightCount} highlight{topic.highlightCount !== 1 ? "s" : ""}
                {topic.avgHighlightLength ? ` · avg ${topic.avgHighlightLength} chars` : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default BrowseTopics;
