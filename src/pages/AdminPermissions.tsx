import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Check, X, Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import FeatureInterestTable from "@/components/admin/FeatureInterestTable";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const FEATURES = [
  { key: "import", label: "Import" },
  { key: "think", label: "Think!" },
//  { key: "contribute", label: "Contribute" },
] as const;

interface ProfileRow {
  id: string;
  display_name: string | null;
}

interface PermissionRow {
  user_id: string;
  feature: string;
}

interface InterestRow {
  id: string;
  user_id: string;
  feature: string;
  created_at: string;
  display_name: string | null;
}

type FeedbackKind = "success" | "error";

const AdminPermissions = () => {
  const { user, authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [interestRows, setInterestRows] = useState<InterestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [interestLoading, setInterestLoading] = useState(true);
  const [feedback, setFeedback] = useState<Record<string, FeedbackKind>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user || !isAdmin) return;
    const load = async () => {
      setLoading(true);
      setInterestLoading(true);
      const [
        { data: profileData },
        { data: permData },
        { data: interestData },
      ] = await Promise.all([
        supabase.from("user_profiles").select("id, display_name"),
        supabase.from("user_permissions").select("user_id, feature"),
        supabase
          .from("feature_interest")
          .select("id, user_id, feature, created_at")
          .order("created_at", { ascending: false }),
      ]);
      const profiles = profileData ?? [];
      setProfiles(profiles);
      setPermissions(permData ?? []);
      const profileMap = new Map<string, string | null>(
        profiles.map((p) => [p.id, p.display_name])
      );
      setInterestRows(
        (interestData ?? []).map((r) => ({
          id: r.id,
          user_id: r.user_id,
          feature: r.feature,
          created_at: r.created_at,
          display_name: profileMap.get(r.user_id) ?? null,
        }))
      );
      setLoading(false);
      setInterestLoading(false);
    };
    load();
  }, [user, isAdmin]);

  const permSet = useMemo(() => {
    const s = new Set<string>();
    permissions.forEach((p) => s.add(`${p.user_id}::${p.feature}`));
    return s;
  }, [permissions]);

  if (authLoading || adminLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const flashFeedback = (key: string, kind: FeedbackKind) => {
    setFeedback((prev) => ({ ...prev, [key]: kind }));
    setTimeout(() => {
      setFeedback((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 2000);
  };

  const grantPermission = async (targetUserId: string, feature: string) => {
    const key = `${targetUserId}::${feature}`;
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const { error } = await supabase.from("user_permissions").insert({
        user_id: targetUserId,
        feature,
        granted_by: user.id,
      });
      if (error && error.code !== "23505") throw error;
      setPermissions((prev) =>
        prev.some((p) => p.user_id === targetUserId && p.feature === feature)
          ? prev
          : [...prev, { user_id: targetUserId, feature }]
      );
      flashFeedback(key, "success");
    } catch (err) {
      console.error("Grant failed:", err);
      flashFeedback(key, "error");
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    }
  };

  const revokePermission = async (targetUserId: string, feature: string) => {
    const key = `${targetUserId}::${feature}`;
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const { error } = await supabase
        .from("user_permissions")
        .delete()
        .eq("user_id", targetUserId)
        .eq("feature", feature);
      if (error) throw error;
      setPermissions((prev) =>
        prev.filter((p) => !(p.user_id === targetUserId && p.feature === feature))
      );
      // Clear "What's new" dismissed flag so banner re-shows on re-grant
      try {
        localStorage.removeItem(`glean_whats_new_dismissed_${feature}`);
      } catch {
        // ignore storage errors
      }
      flashFeedback(key, "success");
    } catch (err) {
      console.error("Revoke failed:", err);
      flashFeedback(key, "error");
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    }
  };

  const togglePermission = async (
    targetUserId: string,
    feature: string,
    currentlyHas: boolean
  ) => {
    if (currentlyHas) {
      await revokePermission(targetUserId, feature);
    } else {
      await grantPermission(targetUserId, feature);
    }
  };

  const handleInterestRevoke = async (
    targetUserId: string,
    feature: string,
    displayName: string
  ) => {
    const confirmed = window.confirm(
      `Are you sure you want to revoke ${feature} access for ${displayName}?`
    );
    if (!confirmed) return;
    await revokePermission(targetUserId, feature);
    // Also remove the matching feature_interest row so the user can request again
    try {
      const { error } = await supabase
        .from("feature_interest")
        .delete()
        .eq("user_id", targetUserId)
        .eq("feature", feature);
      if (error) throw error;
      setInterestRows((prev) =>
        prev.filter(
          (r) => !(r.user_id === targetUserId && r.feature === feature)
        )
      );
    } catch (err) {
      console.error("Failed to clear feature_interest row:", err);
    }
  };

const sortedProfiles = [...profiles]
.sort((a, b) => {
  const an = (a.display_name || a.id).toLowerCase();
  const bn = (b.display_name || b.id).toLowerCase();
  return an.localeCompare(bn);
})
.filter((p) => {
  if (search.trim().length === 0) return true;
  const name = (p.display_name || p.id).toLowerCase();
  return name.includes(search.toLowerCase());
});

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          User Permissions
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage feature access for Glean users
        </p>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="mt-4 h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm text-foreground"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-xl border bg-card card-shadow overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">User</th>
                  {FEATURES.map((f) => (
                    <th key={f.key} className="text-center font-medium px-4 py-3">
                      {f.label}
                    </th>
                  ))}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {sortedProfiles.map((p) => {
                  const isAdmin = p.id === user.id;
                  const displayName =
                    p.display_name?.trim() || `User ${p.id.slice(0, 8)}`;
                  const rowFeedback = Object.entries(feedback).find(([k]) =>
                    k.startsWith(`${p.id}::`)
                  );
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="px-4 py-3 text-foreground">
                        <div className="font-medium truncate max-w-[280px]">
                          {displayName}
                        </div>
                        {isAdmin && (
                          <div className="text-xs text-primary">Admin</div>
                        )}
                      </td>
                      {FEATURES.map((f) => {
                        const key = `${p.id}::${f.key}`;
                        const has = isAdmin || permSet.has(key);
                        const isPending = pending[key];
                        return (
                          <td key={f.key} className="text-center px-4 py-3">
                            <input
                              type="checkbox"
                              checked={has}
                              disabled={isAdmin || isPending}
                              onChange={() =>
                                togglePermission(p.id, f.key, has)
                              }
                              className="h-4 w-4 rounded border-input accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </td>
                        );
                      })}
                      <td className="px-2">
                        {rowFeedback?.[1] === "success" && (
                          <Check className="h-4 w-4 text-primary animate-in fade-in" />
                        )}
                        {rowFeedback?.[1] === "error" && (
                          <X className="h-4 w-4 text-destructive animate-in fade-in" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y">
            {sortedProfiles.map((p) => {
              const isAdmin = p.id === user.id;
              const displayName =
                p.display_name?.trim() || `User ${p.id.slice(0, 8)}`;
              const rowFeedback = Object.entries(feedback).find(([k]) =>
                k.startsWith(`${p.id}::`)
              );
              return (
                <div key={p.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-medium text-foreground truncate max-w-[220px]">
                        {displayName}
                      </div>
                      {isAdmin && (
                        <div className="text-xs text-primary">Admin</div>
                      )}
                    </div>
                    {rowFeedback?.[1] === "success" && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                    {rowFeedback?.[1] === "error" && (
                      <X className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {FEATURES.map((f) => {
                      const key = `${p.id}::${f.key}`;
                      const has = isAdmin || permSet.has(key);
                      const isPending = pending[key];
                      return (
                        <label
                          key={f.key}
                          className="flex items-center gap-2 rounded-lg border bg-secondary/30 px-3 py-2 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={has}
                            disabled={isAdmin || isPending}
                            onChange={() =>
                              togglePermission(p.id, f.key, has)
                            }
                            className="h-4 w-4 rounded border-input accent-primary"
                          />
                          <span className="text-foreground">{f.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <FeatureInterestTable
        rows={interestRows}
        loading={interestLoading}
        permissions={permSet}
        pending={pending}
        feedback={feedback}
        onGrant={grantPermission}
        onRevoke={handleInterestRevoke}
      />
    </div>
  );
};

export default AdminPermissions;
