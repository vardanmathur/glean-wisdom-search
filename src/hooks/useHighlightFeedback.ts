import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type FeedbackSets = {
  thumbsUp: Set<string>;
  thumbsDown: Set<string>;
};

/**
 * Single source of truth for the current user's feedback (both directions).
 * One DB query per session, deduped by React Query — cards derive O(1) state
 * from the cached Sets. With 1,380 highlights on a page this is still 1 query.
 */
export function useUserFeedback() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-feedback", user?.id],
    queryFn: async (): Promise<FeedbackSets> => {
      if (!user) return { thumbsUp: new Set(), thumbsDown: new Set() };
      const { data, error } = await supabase
        .from("feedback")
        .select("highlight_id, feedback_type")
        .eq("user_id", user.id);
      if (error || !data) return { thumbsUp: new Set(), thumbsDown: new Set() };
      const thumbsUp = new Set<string>();
      const thumbsDown = new Set<string>();
      for (const row of data) {
        if (row.feedback_type === "thumbs_up") thumbsUp.add(row.highlight_id);
        else if (row.feedback_type === "thumbs_down") thumbsDown.add(row.highlight_id);
      }
      return { thumbsUp, thumbsDown };
    },
    enabled: !!user,
    staleTime: Infinity,
  });
}

export function useIsThumbsUp(highlightId: string): boolean {
  const { data } = useUserFeedback();
  return data?.thumbsUp.has(highlightId) ?? false;
}

export function useIsThumbsDown(highlightId: string): boolean {
  const { data } = useUserFeedback();
  return data?.thumbsDown.has(highlightId) ?? false;
}

function makeToggle(type: "thumbs_up" | "thumbs_down") {
  return function useToggle() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const qc = useQueryClient();

    return useMutation({
      mutationFn: async (highlightId: string) => {
        if (!user) {
          navigate("/auth");
          throw new Error("auth-required");
        }
        const cached = qc.getQueryData<FeedbackSets>(["user-feedback", user.id]);
        const set = type === "thumbs_up" ? cached?.thumbsUp : cached?.thumbsDown;
        const isActive = set?.has(highlightId) ?? false;

        if (isActive) {
          const { error } = await supabase
            .from("feedback")
            .delete()
            .eq("user_id", user.id)
            .eq("highlight_id", highlightId)
            .eq("feedback_type", type);
          if (error) throw error;
          return { highlightId, action: "removed" as const };
        } else {
          // upsert-style: if user toggles up while down was active (or vice versa),
          // delete the opposite first to satisfy the unique (user_id, highlight_id) constraint.
          await supabase
            .from("feedback")
            .delete()
            .eq("user_id", user.id)
            .eq("highlight_id", highlightId);
          const { error } = await supabase
            .from("feedback")
            .insert({ user_id: user.id, highlight_id: highlightId, feedback_type: type });
          if (error) throw error;
          return { highlightId, action: "added" as const };
        }
      },
      onSuccess: ({ highlightId, action }) => {
        qc.setQueryData<FeedbackSets>(["user-feedback", user?.id], (prev) => {
          const next: FeedbackSets = {
            thumbsUp: new Set(prev?.thumbsUp ?? []),
            thumbsDown: new Set(prev?.thumbsDown ?? []),
          };
          // Always clear the opposite set first (unique constraint)
          next.thumbsUp.delete(highlightId);
          next.thumbsDown.delete(highlightId);
          if (action === "added") {
            if (type === "thumbs_up") next.thumbsUp.add(highlightId);
            else next.thumbsDown.add(highlightId);
          }
          return next;
        });
      },
    });
  };
}

export const useToggleThumbsUp = makeToggle("thumbs_up");
export const useToggleThumbsDown = makeToggle("thumbs_down");
