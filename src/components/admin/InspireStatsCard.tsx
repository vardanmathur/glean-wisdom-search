import { useQuery } from "@tanstack/react-query";
import { Shuffle } from "lucide-react";
import { describeInspireCoverage, fetchInspireSummary } from "@/lib/inspire";

// Admin Hub: how much of the public library "Inspire Me" has shown so far.
const InspireStatsCard = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["inspire-summary"],
    queryFn: fetchInspireSummary,
    staleTime: 30 * 1000,
  });
  const coverage = data ? describeInspireCoverage(data) : null;

  return (
    <section className="mb-8 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
          <Shuffle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold text-foreground">Inspire Me coverage</h2>
          {isLoading ? (
            <p className="mt-1 text-sm text-muted-foreground">Checking…</p>
          ) : isError || !coverage ? (
            <p className="mt-1 text-sm text-destructive">Couldn't load Inspire Me stats.</p>
          ) : (
            <>
              <p className="mt-1 text-sm font-medium text-foreground">{coverage.headline}</p>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary"
                role="progressbar"
                aria-valuenow={coverage.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Share of public highlights shown at least once"
              >
                <div className="h-full bg-primary" style={{ width: `${coverage.percent}%` }} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{coverage.detail}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default InspireStatsCard;
