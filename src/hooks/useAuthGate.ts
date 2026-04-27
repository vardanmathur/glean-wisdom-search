import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * Resilient auth gate that absorbs the transient null-user states emitted by
 * Supabase during token refresh / mobile PWA resume. Instead of redirecting
 * immediately when `predicate(user)` is false, it:
 *
 *  1. Waits `delay` ms (default 2000) before redirecting.
 *  2. Subscribes to `onAuthStateChange` and cancels the redirect if
 *     SIGNED_IN or TOKEN_REFRESHED arrives with a user that satisfies the
 *     predicate.
 *  3. Does a final `getSession()` re-check before navigating, so a cached
 *     session is honoured even if the listener never fires.
 *
 * Always cleans up its timer + subscription on unmount or re-run.
 */
export function useAuthGate(
  redirectTo: string,
  predicate: (user: User | null) => boolean,
  options?: { delay?: number },
): void {
  const { user, authLoading } = useAuth();
  const navigate = useNavigate();
  const delay = options?.delay ?? 2000;

  useEffect(() => {
    if (authLoading) return;
    if (predicate(user)) return;

    let cancelled = false;

    const timer = setTimeout(async () => {
      if (cancelled) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!predicate(session?.user ?? null)) {
        navigate(redirectTo, { replace: true });
      }
    }, delay);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          if (predicate(session?.user ?? null)) {
            cancelled = true;
            clearTimeout(timer);
          }
        }
      },
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [user, authLoading, redirectTo, predicate, delay, navigate]);
}
