import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

// Tagged AND (no embedding OR never refreshed): the same filter generate-embeddings uses.
const NEEDS_REFRESH = "embedding.is.null,embedding_refreshed_at.is.null";
const MAX_ROUNDS = 100;

interface RefreshResponse {
  processed?: number;
  remaining?: number;
  skipped_untagged?: number;
  errors?: string[];
}

interface RunResult {
  rebuilt: number;
  skipped: number | null;
  failed: number;
}

const FingerprintPanel = () => {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ rebuilt: number; remaining: number | null } | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  const { data: counts, isLoading } = useQuery({
    queryKey: ["fingerprint-status"],
    queryFn: async () => {
      const [needs, untagged] = await Promise.all([
        supabase
          .from("highlights")
          .select("id", { count: "exact", head: true })
          .not("tags", "is", null)
          .filter("tags", "neq", "{}")
          .or(NEEDS_REFRESH),
        supabase
          .from("highlights")
          .select("id", { count: "exact", head: true })
          .or("tags.is.null,tags.eq.{}"),
      ]);
      if (needs.error) throw needs.error;
      if (untagged.error) throw untagged.error;
      return { needs: needs.count ?? 0, untagged: untagged.count ?? 0 };
    },
    staleTime: 30 * 1000,
  });

  const refreshNow = async () => {
    setRunning(true);
    setResult(null);
    setProgress({ rebuilt: 0, remaining: counts?.needs ?? null });
    let rebuilt = 0;
    let skipped: number | null = null;
    let failed = 0;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const { data, error } = await supabase.functions.invoke("generate-embeddings");
        if (error) throw error;
        const r = (data ?? {}) as RefreshResponse;
        const processed = r.processed ?? 0;
        rebuilt += processed;
        if (typeof r.skipped_untagged === "number") skipped = r.skipped_untagged;
        const remaining = r.remaining ?? 0;
        setProgress({ rebuilt, remaining });
        if (remaining <= 0) {
          failed = 0;
          break;
        }
        // Nothing was rebuilt but rows remain: they are failing. Stop instead of looping forever.
        if (processed === 0) {
          failed = r.errors?.length ?? remaining;
          break;
        }
      }
      setResult({ rebuilt, skipped, failed });
    } catch (err) {
      console.error(err);
      toast.error("Refresh stopped — please try again");
      setResult({ rebuilt, skipped, failed });
    } finally {
      setRunning(false);
      queryClient.invalidateQueries({ queryKey: ["fingerprint-status"] });
    }
  };

  return (
    <section className="mb-8 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
          <Fingerprint className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold text-foreground">Highlight fingerprints</h2>
          {isLoading ? (
            <p className="mt-1 text-sm text-muted-foreground">Checking…</p>
          ) : counts ? (
            <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{counts.needs}</span> highlight
                {counts.needs === 1 ? "" : "s"} need fingerprint refresh
              </p>
              <p>
                <span className="font-medium text-foreground">{counts.untagged}</span> untagged highlight
                {counts.untagged === 1 ? "" : "s"} have no fingerprint (by design)
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-destructive">Couldn't load fingerprint counts.</p>
          )}

          {running && progress && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Rebuilt {progress.rebuilt}
              {progress.remaining !== null ? ` · ${progress.remaining} remaining` : ""}
            </p>
          )}

          {!running && result && (
            <p className="mt-3 text-sm text-foreground">
              Done. Rebuilt {result.rebuilt}
              {result.skipped !== null ? ` · skipped ${result.skipped} untagged` : ""} · failed {result.failed}
            </p>
          )}

          <Button
            onClick={refreshNow}
            disabled={running || isLoading || (counts?.needs ?? 0) === 0}
            className="mt-4 h-11 w-full gap-1.5 sm:h-9 sm:w-auto"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {running ? "Refreshing…" : "Refresh now"}
          </Button>
        </div>
      </div>
    </section>
  );
};

export default FingerprintPanel;
