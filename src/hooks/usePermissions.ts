import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/useIsAdmin';

export function usePermissions() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permLoading, setPermLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPermissions([]);
      setPermLoading(false);
      return;
    }
    let cancelled = false;
    setPermLoading(true);
    supabase
      .from('user_permissions')
      .select('feature')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (cancelled) return;
        setPermissions(data?.map((r) => r.feature as string) ?? []);
        setPermLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const hasPermission = (feature: string) =>
    isAdmin || permissions.includes(feature);

  return { hasPermission, permissions, loading: permLoading || adminLoading };
}
