import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export function usePermissions() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPermissions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('user_permissions')
      .select('feature')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (cancelled) return;
        setPermissions(data?.map((r) => r.feature as string) ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const hasPermission = (feature: string) =>
    user?.email === 'vardan@gmail.com' || permissions.includes(feature);

  return { hasPermission, permissions, loading };
}
