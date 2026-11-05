import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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

// Admin Hub: shows nothing while every tagged highlight is fingerprinted; otherwise one slim line with the button.
const FingerprintPanel = () => {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ rebuilt: number; remaining: number | null } | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  const { data: needs } = useQuery({
    queryKey: ["fingerprint-status"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("highlights")
        .select("id", { count: "exact", head: true })
        .not("tags", "is", null)
        .filter("tags", "neq", "{}")
        .or(NEEDS_REFRESH);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30 * 1000,
  });

  const refreshNow = async () => {
    setRunning(true);
    setResult(null);
    setProgress({ rebuilt: 0, remaining: needs ?? null });
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

  const outstanding = needs ?? 0;
  if (!running && !result && outstanding === 0) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-2 text-sm">
      {running && progress ? (
        <span className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Rebuilt {progress.rebuilt}
          {progress.remaining !== null ? ` · ${progress.remaining} remaining` : ""}
        </span>
      ) : result ? (
        <span className="text-foreground">
          Done. Rebuilt {result.rebuilt}
          {result.skipped !== null ? ` · skipped ${result.skipped} untagged` : ""} · failed {result.failed}
        </span>
      ) : (
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">{outstanding}</span> highlight{outstanding === 1 ? "" : "s"} need
          fingerprint refresh
        </span>
      )}
      {outstanding > 0 && (
        <Button size="sm" variant="outline" onClick={refreshNow} disabled={running} className="h-9">
          {running ? "Refreshing…" : "Refresh now"}
        </Button>
      )}
    </div>
  );
};

export default FingerprintPanel;
