import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ALL_TAGS } from "@/lib/tags";

// Shared queryKey — every caller (HighlightCard, BookDetail, Import, ...)
// dedupes onto the same cached request instead of firing one fetch per
// instance. HighlightCard alone can render 10-20+ times on one page.
export function useAllTags(): string[] {
  const { data } = useQuery({
    queryKey: ["all-tags"],
    queryFn: async () => {
      // Fetch all distinct tags from DB, merge with ALL_TAGS taxonomy
      try {
        const { data, error } = await supabase
          .from("highlights")
          .select("tags");
        if (error || !data) return ALL_TAGS;

        // Extract all distinct tags from DB
        const dbTagSet = new Set<string>();
        data.forEach(row => {
          (row.tags ?? []).forEach((t: string) => {
            if (t) dbTagSet.add(t);
          });
        });

        // Merge: ALL_TAGS first (canonical), then any
        // DB tags not in taxonomy
        const taxonomySet = new Set(ALL_TAGS.map(
          t => t.toLowerCase()
        ));
        const extraTags = Array.from(dbTagSet).filter(
          t => !taxonomySet.has(t.toLowerCase())
        );

        return extraTags.length > 0 ? [...ALL_TAGS, ...extraTags.sort()] : ALL_TAGS;
      } catch {
        return ALL_TAGS; // keep ALL_TAGS as fallback
      }
    },
    placeholderData: ALL_TAGS, // instant, synchronous — no loading state, no flicker
    staleTime: 5 * 60 * 1000, // 5 min — tags don't change often; avoids refetch on every focus/remount
  });

  return data ?? ALL_TAGS;
}
