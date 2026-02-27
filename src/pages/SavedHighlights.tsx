import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSavedHighlights } from "@/context/SavedHighlightsContext";
import HighlightCard from "@/components/HighlightCard";
import { Bookmark, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { Highlight } from "@/lib/data";

const SavedHighlights = () => {
  const { savedIds } = useSavedHighlights();

  const { data: savedHighlights = [], isLoading } = useQuery({
    queryKey: ["saved-highlights", savedIds],
    queryFn: async (): Promise<Highlight[]> => {
      if (savedIds.length === 0) return [];
      const { data, error } = await supabase
        .from("highlights")
        .select("*, books(title, author, cover_image_url)")
        .in("id", savedIds);
      if (error || !data) return [];
      return data.map((row) => ({
        id: row.id,
        text: row.quote,
        bookTitle: row.books?.title || "Unknown",
        author: row.books?.author || "Unknown",
        tags: row.tags || [],
        bookId: row.book_id || undefined,
        coverImageUrl: row.books?.cover_image_url || undefined,
      }));
    },
    enabled: savedIds.length > 0,
  });

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl text-foreground mb-2">Saved Highlights</h1>
      <p className="text-muted-foreground mb-8">Your personal collection of wisdom</p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : savedHighlights.length === 0 ? (
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
