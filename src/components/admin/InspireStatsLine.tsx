import { useQuery } from "@tanstack/react-query";
import { describeInspireLine, fetchInspireSummary } from "@/lib/inspire";

// Admin Studio: one compact line on how much of the public library "Inspire Me" has shown so far.
const InspireStatsLine = () => {
  const { data } = useQuery({
    queryKey: ["inspire-summary"],
    queryFn: fetchInspireSummary,
    staleTime: 60 * 1000,
    retry: false,
  });
  if (!data) return null;
  return <p className="mb-3 text-xs text-muted-foreground">{describeInspireLine(data)}</p>;
};

export default InspireStatsLine;
