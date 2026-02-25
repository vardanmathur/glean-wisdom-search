import { topics, getHighlightsByTag } from "@/lib/data";
import { Link, useParams } from "react-router-dom";
import HighlightCard from "@/components/HighlightCard";
import { ArrowLeft } from "lucide-react";

const BrowseTopics = () => {
  const { tag } = useParams();

  if (tag) {
    const decodedTag = decodeURIComponent(tag);
    const tagHighlights = getHighlightsByTag(decodedTag);
    const topic = topics.find((t) => t.name === decodedTag);

    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <Link
          to="/topics"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> All Topics
        </Link>

        <h1 className="font-display text-3xl text-foreground mb-2">{decodedTag}</h1>
        {topic && (
          <p className="text-muted-foreground mb-8">{topic.description}</p>
        )}

        <div className="space-y-4">
          {tagHighlights.map((h, i) => (
            <HighlightCard key={h.id} highlight={h} index={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl text-foreground mb-2">Browse by Topic</h1>
      <p className="text-muted-foreground mb-8">
        Explore wisdom across {topics.length} topics
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((topic) => (
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
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default BrowseTopics;
