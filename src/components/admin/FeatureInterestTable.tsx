import { useState } from "react";
import { Loader2, Check, X, Sparkles } from "lucide-react";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

interface InterestRow {
  id: string;
  user_id: string;
  feature: string;
  created_at: string;
  display_name: string | null;
}

type FeedbackKind = "success" | "error";

interface FeatureInterestTableProps {
  rows: InterestRow[];
  loading: boolean;
  permissions: Set<string>;
  pending: Record<string, boolean>;
  feedback: Record<string, FeedbackKind>;
  onGrant: (userId: string, feature: string) => void;
  onRevoke: (userId: string, feature: string, displayName: string) => void;
}

const FeatureInterestTable = ({
  rows,
  loading,
  permissions,
  pending,
  feedback,
  onGrant,
  onRevoke,
}: FeatureInterestTableProps) => {
  const [showStale, setShowStale] = useState(false);

  const now = Date.now();
  const isCollapsible = (r: InterestRow) => {
    const key = `${r.user_id}::${r.feature}`;
    return now - new Date(r.created_at).getTime() > FIVE_DAYS_MS && permissions.has(key);
  };

  const staleCount = rows.filter(isCollapsible).length;
  const visibleRows = showStale ? rows : rows.filter((r) => !isCollapsible(r));

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
                  {visibleRows.map((r) => {
                    const key = `${r.user_id}::${r.feature}`;
                    const granted = permissions.has(key);
                    const isPending = pending[key];
                    const fb = feedback[key];
                    const displayName =
                      r.display_name?.trim() || `User ${r.user_id.slice(0, 8)}`;
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="px-4 py-3 text-foreground">
                          <div className="font-medium truncate max-w-[260px]">
                            {displayName}
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
                            {granted ? (
                              <button
                                onClick={() =>
                                  onRevoke(r.user_id, r.feature, displayName)
                                }
                                disabled={isPending}
                                className="rounded-md border border-destructive/30 bg-card px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60"
                              >
                                {isPending ? "Revoking…" : "Revoke"}
                              </button>
                            ) : (
                              <button
                                onClick={() => onGrant(r.user_id, r.feature)}
                                disabled={isPending}
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                              >
                                {isPending ? "Granting…" : "Grant Access"}
                              </button>
                            )}
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
              {visibleRows.map((r) => {
                const key = `${r.user_id}::${r.feature}`;
                const granted = permissions.has(key);
                const isPending = pending[key];
                const fb = feedback[key];
                const displayName =
                  r.display_name?.trim() || `User ${r.user_id.slice(0, 8)}`;
                return (
                  <div key={r.id} className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">
                          {displayName}
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
                      {granted ? (
                        <button
                          onClick={() =>
                            onRevoke(r.user_id, r.feature, displayName)
                          }
                          disabled={isPending}
                          className="flex-1 rounded-md border border-destructive/30 bg-card px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60"
                        >
                          {isPending ? "Revoking…" : "Revoke"}
                        </button>
                      ) : (
                        <button
                          onClick={() => onGrant(r.user_id, r.feature)}
                          disabled={isPending}
                          className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                        >
                          {isPending ? "Granting…" : "Grant Access"}
                        </button>
                      )}
                      {fb === "success" && <Check className="h-4 w-4 text-primary" />}
                      {fb === "error" && <X className="h-4 w-4 text-destructive" />}
                    </div>
                  </div>
                );
              })}
            </div>

            {staleCount > 0 && (
              <div className="border-t px-4 py-3 text-center">
                <button
                  onClick={() => setShowStale((s) => !s)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showStale
                    ? "Hide older requests"
                    : `Show ${staleCount} older request${staleCount !== 1 ? "s" : ""}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default FeatureInterestTable;
