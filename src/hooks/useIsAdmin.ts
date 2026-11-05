import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Role-based admin check. Calls the SECURITY DEFINER `has_role` RPC once
 * per user session. Replaces all hardcoded email comparisons in the frontend.
 *
 * Backed by React Query so every component that asks (there can be hundreds of book
 * covers on screen) shares one request instead of each firing its own.
 */
export function useIsAdmin() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["is-admin", user?.id ?? null],
    queryFn: async () => {
      const { data: isAdmin, error } = await supabase.rpc("has_role", { role_name: "admin" });
      return !error && !!isAdmin;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return { isAdmin: !!user && data === true, loading: !!user && isLoading };
}
