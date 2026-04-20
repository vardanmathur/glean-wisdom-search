import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type InterestFeature = "think" | "import";

export function useFeatureInterest() {
  const { user } = useAuth();
  const [interests, setInterests] = useState<Set<InterestFeature>>(new Set());
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  const fetchInterests = useCallback(async () => {
    if (!user) {
      setInterests(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("feature_interest")
      .select("feature")
      .eq("user_id", user.id);
    if (cancelledRef.current) return;
    if (error) {
      console.error("Failed to load feature interest:", error);
      setInterests(new Set());
    } else {
      setInterests(
        new Set((data ?? []).map((r) => r.feature as InterestFeature))
      );
    }
    setLoading(false);
  }, [user]);

  // Initial fetch + re-fetch on auth change / component mount
  useEffect(() => {
    cancelledRef.current = false;
    fetchInterests();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchInterests]);

  // Re-fetch when the tab/window regains focus so externally deleted rows
  // (e.g. an admin revoke) are picked up without a hard reload.
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      fetchInterests();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchInterests();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, fetchInterests]);

  const register = useCallback(
    async (
      feature: InterestFeature
    ): Promise<{ ok: boolean; alreadyRegistered?: boolean; error?: string }> => {
      if (!user) return { ok: false, error: "Not signed in" };
      const { error } = await supabase
        .from("feature_interest")
        .insert({ user_id: user.id, feature });
      if (error) {
        // Unique constraint violation = already registered (treat as success)
        if (error.code === "23505") {
          setInterests((prev) => new Set(prev).add(feature));
          return { ok: true, alreadyRegistered: true };
        }
        console.error("Failed to register interest:", error);
        return { ok: false, error: error.message };
      }
      setInterests((prev) => new Set(prev).add(feature));
      return { ok: true };
    },
    [user]
  );

  const hasInterest = (feature: InterestFeature) => interests.has(feature);

  return { hasInterest, register, loading, refetch: fetchInterests };
}
