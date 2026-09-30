import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Shared queryKey — every caller (HighlightCard, BookDetail, Import, ...)
// dedupes onto the same cached request instead of firing one fetch per
// instance. HighlightCard alone can render 10-20+ times on one page.
//
// public.tags is now the sole source of truth for the tag taxonomy —
// no ALL_TAGS fallback. A failed fetch returns [] rather than a stale
// hardcoded list.
export function useAllTags(): string[] {
  const { data } = useQuery({
    queryKey: ["tags-table"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("tags")
          .select("name")
          .order("name", { ascending: true });
        if (error) {
          console.error("useAllTags: failed to fetch tags", error);
          return [];
        }
        return (data ?? []).map((row) => row.name);
      } catch (err) {
        console.error("useAllTags: failed to fetch tags", err);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 min — tags don't change often; avoids refetch on every focus/remount
  });

  return data ?? [];
}
