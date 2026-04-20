import { useEffect, useState } from "react";
import { Loader2, Check, X, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface InterestRow {
  id: string;
  user_id: string;
  feature: string;
  created_at: string;
  display_name: string | null;
}

interface PermissionRow {
  user_id: string;
  feature: string;
}

type FeedbackKind = "success" | "error";

const FeatureInterestTable = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<InterestRow[]>([]);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, FeedbackKind>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [
        { data: interestData },
        { data: profileData },
        { data: permData },
      ] = await Promise.all([
        supabase
          .from("feature_interest")
          .select("id, user_id, feature, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("user_profiles").select("id, display_name"),
        supabase.from("user_permissions").select("user_id, feature"),
      ]);

      const profileMap = new Map<string, string | null>(
        (profileData ?? []).map((p) => [p.id, p.display_name])
      );

      setRows(
        (interestData ?? []).map((r) => ({
          id: r.id,
          user_id: r.user_id,
          feature: r.feature,
          created_at: r.created_at,
          display_name: profileMap.get(r.user_id) ?? null,
        }))
      );
      setPermissions(
        new Set((permData ?? []).map((p) => `${p.user_id}::${p.feature}`))
      );
      setLoading(false);
    };
    load();
  }, []);

  const flash = (key: string, kind: FeedbackKind) => {
    setFeedback((prev) => ({ ...prev, [key]: kind }));
    setTimeout(() => {
      setFeedback((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 2000);
  };

  const handleGrant = async (targetUserId: string, feature: string) => {
    const key = `${targetUserId}::${feature}`;
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const { error } = await supabase.from("user_permissions").insert({
        user_id: targetUserId,
        feature,
        granted_by: user?.id,
      });
      if (error && error.code !== "23505") throw error;
      setPermissions((prev) => new Set(prev).add(key));
      flash(key, "success");
    } catch (err) {
      console.error("Grant failed:", err);
      flash(key, "error");
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <div className="mt-12">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="font-display text-2xl font-semibold text-foreground">
          Feature Interest
        </h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Users who've expressed interest in upcoming features.
      </p>

      <div className="rounded-xl border bg-card card-shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No interest registered yet.
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">User</th>
                    <th className="text-left font-medium px-4 py-3">Feature</th>
                    <th className="text-left font-medium px-4 py-3">Date</th>
                    <th className="text-right font-medium px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const key = `${r.user_id}::${r.feature}`;
                    const granted = permissions.has(key);
                    const isPending = pending[key];
                    const fb = feedback[key];
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="px-4 py-3 text-foreground">
                          <div className="font-medium truncate max-w-[260px]">
                            {r.display_name?.trim() || `User ${r.user_id.slice(0, 8)}`}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary capitalize">
                            {r.feature}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(r.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            {fb === "success" && <Check className="h-4 w-4 text-primary" />}
                            {fb === "error" && <X className="h-4 w-4 text-destructive" />}
                            <button
                              onClick={() => handleGrant(r.user_id, r.feature)}
                              disabled={granted || isPending}
                              className={
                                granted
                                  ? "rounded-md border bg-secondary px-3 py-1.5 text-xs text-muted-foreground cursor-default"
                                  : "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                              }
                            >
                              {granted ? "Access granted" : isPending ? "Granting…" : "Grant Access"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y">
              {rows.map((r) => {
                const key = `${r.user_id}::${r.feature}`;
                const granted = permissions.has(key);
                const isPending = pending[key];
                const fb = feedback[key];
                return (
                  <div key={r.id} className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">
                          {r.display_name?.trim() || `User ${r.user_id.slice(0, 8)}`}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(r.created_at)}
                        </div>
                      </div>
                      <span className="shrink-0 inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary capitalize">
                        {r.feature}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleGrant(r.user_id, r.feature)}
                        disabled={granted || isPending}
                        className={
                          granted
                            ? "flex-1 rounded-md border bg-secondary px-3 py-2 text-xs text-muted-foreground cursor-default"
                            : "flex-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                        }
                      >
                        {granted ? "Access granted" : isPending ? "Granting…" : "Grant Access"}
                      </button>
                      {fb === "success" && <Check className="h-4 w-4 text-primary" />}
                      {fb === "error" && <X className="h-4 w-4 text-destructive" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FeatureInterestTable;
