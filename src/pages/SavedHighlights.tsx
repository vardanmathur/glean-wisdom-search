import { highlights } from "@/lib/data";
import { useSavedHighlights } from "@/context/SavedHighlightsContext";
import HighlightCard from "@/components/HighlightCard";
import { Bookmark } from "lucide-react";
import { Link } from "react-router-dom";

const SavedHighlights = () => {
  const { savedIds } = useSavedHighlights();
  const savedHighlights = highlights.filter((h) => savedIds.includes(h.id));

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl text-foreground mb-2">Saved Highlights</h1>
      <p className="text-muted-foreground mb-8">Your personal collection of wisdom</p>

      {savedHighlights.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center card-shadow">
          <Bookmark className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-2">No saved highlights yet.</p>
          <p className="text-sm text-muted-foreground">
            <Link to="/" className="text-primary hover:underline">
              Search for wisdom
            </Link>{" "}
            and save the highlights that resonate with you.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {savedHighlights.map((h, i) => (
            <HighlightCard key={h.id} highlight={h} index={i} />
          ))}
        </div>
      )}
    </div>
  );
};

export default SavedHighlights;
