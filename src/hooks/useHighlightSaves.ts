import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for the current user's saved highlight ids.
 * One DB query per session, deduped by React Query — every card derives its
 * own state from this Set with O(1) lookup.
 */
export function useSavedHighlightIds() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["saved-highlight-ids", user?.id],
    queryFn: async (): Promise<Set<string>> => {
      if (!user) return new Set();
      const { data, error } = await supabase
        .from("saved_highlights")
        .select("highlight_id")
        .eq("user_id", user.id);
      if (error || !data) return new Set();
      return new Set(data.map((r) => r.highlight_id));
    },
    enabled: !!user,
    staleTime: Infinity,
  });
}

/** O(1) derived selector — no fetching. */
export function useIsHighlightSaved(highlightId: string): boolean {
  const { data } = useSavedHighlightIds();
  return data?.has(highlightId) ?? false;
}

/**
 * Save count across all users for a single highlight.
 * Currently hidden in UI; cheap (head-only count query) and called once per card
 * but only when the count is rendered (caller controls visibility).
 */
export function useHighlightSaveCount(highlightId: string, enabled = true) {
  return useQuery({
    queryKey: ["highlight-save-count", highlightId],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("saved_highlights")
        .select("highlight_id", { count: "exact", head: true })
        .eq("highlight_id", highlightId);
      if (error) return 0;
      return count ?? 0;
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Batch fetch save counts for many highlights at once — used by sort-by-most-saved
 * on book/topic pages to avoid N round-trips.
 */
export function useHighlightSaveCounts(highlightIds: string[]) {
  return useQuery({
    queryKey: ["highlight-save-counts", [...highlightIds].sort().join(",")],
    queryFn: async (): Promise<Map<string, number>> => {
      if (highlightIds.length === 0) return new Map();
      const { data, error } = await supabase
        .from("saved_highlights")
        .select("highlight_id")
        .in("highlight_id", highlightIds);
      if (error || !data) return new Map();
      const counts = new Map<string, number>();
      for (const row of data) {
        counts.set(row.highlight_id, (counts.get(row.highlight_id) ?? 0) + 1);
      }
      return counts;
    },
    enabled: highlightIds.length > 0,
    staleTime: 60_000,
  });
}

export function useToggleSave() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (highlightId: string) => {
      if (!user) {
        navigate("/auth");
        throw new Error("auth-required");
      }
      // Check current state via cached set
      const cached = qc.getQueryData<Set<string>>(["saved-highlight-ids", user.id]);
      const isSaved = cached?.has(highlightId) ?? false;

      if (isSaved) {
        const { error } = await supabase
          .from("saved_highlights")
          .delete()
          .eq("user_id", user.id)
          .eq("highlight_id", highlightId);
        if (error) throw error;
        return { highlightId, action: "removed" as const };
      } else {
        const { error } = await supabase
          .from("saved_highlights")
          .insert({ user_id: user.id, highlight_id: highlightId });
        if (error) throw error;
        return { highlightId, action: "added" as const };
      }
    },
    onSuccess: ({ highlightId, action }) => {
      // Optimistic-style update of the ids set
      qc.setQueryData<Set<string>>(["saved-highlight-ids", user?.id], (prev) => {
        const next = new Set(prev ?? []);
        if (action === "added") next.add(highlightId);
        else next.delete(highlightId);
        return next;
      });
      qc.invalidateQueries({ queryKey: ["highlight-save-count", highlightId] });
      qc.invalidateQueries({ queryKey: ["highlight-save-counts"] });
      qc.invalidateQueries({ queryKey: ["saved-highlights-list"] });
    },
  });
}
