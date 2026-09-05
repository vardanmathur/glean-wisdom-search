import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Download } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";

interface SearchLogRow {
  id: string;
  query: string;
  result_count: number;
  coverage: string;
  created_at: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

function toCsv(rows: SearchLogRow[]): string {
  const header = ["query", "result_count", "coverage", "created_at"];
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [escape(r.query), escape(r.result_count), escape(r.coverage), escape(r.created_at)].join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

const AdminSearchLogs = () => {
  const { authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [search, setSearch] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["search-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("search_logs")
        .select("id, query, result_count, coverage, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });

  const stats = useMemo(() => {
    const totalSearches = logs.length;
    const goodCoverage = totalSearches
      ? Math.round((logs.filter((l) => l.coverage === "good").length / totalSearches) * 100)
      : 0;
    const counts = new Map<string, number>();
    for (const l of logs) counts.set(l.query, (counts.get(l.query) ?? 0) + 1);
    let topQuery = "";
    let topCount = 0;
    for (const [q, c] of counts) {
      if (c > topCount) {
        topQuery = q;
        topCount = c;
      }
    }
    return { totalSearches, goodCoverage, topQuery };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter((l) => l.query.toLowerCase().includes(q));
  }, [logs, search]);

  const handleExport = () => {
    const csv = toCsv(filteredLogs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `glean_search_logs_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (authLoading || adminLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const topQueryDisplay =
    stats.topQuery.length > 30 ? `${stats.topQuery.slice(0, 30)}…` : stats.topQuery;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>
        <h1 className="font-display text-3xl font-semibold text-foreground">Search Logs</h1>
        <p className="mt-2 text-muted-foreground">What people are searching for</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Searches</div>
          <div className="font-display text-2xl text-foreground mt-1">{stats.totalSearches}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Good Coverage</div>
          <div className="font-display text-2xl text-foreground mt-1">{stats.goodCoverage}%</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Top Query</div>
          <div className="font-display text-2xl text-foreground mt-1 truncate" title={stats.topQuery}>
            {topQueryDisplay || "—"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by query..."
          className="h-10 flex-1 max-w-sm rounded-md border border-input bg-background px-3 text-sm text-foreground"
        />
        <button
          type="button"
          onClick={handleExport}
          disabled={filteredLogs.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          No searches logged yet.
        </div>
      ) : (
        <div className="rounded-xl border bg-card card-shadow overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Query</th>
                  <th className="text-left font-medium px-4 py-3">Results</th>
                  <th className="text-left font-medium px-4 py-3">Coverage</th>
                  <th className="text-left font-medium px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-t">
                    <td className="px-4 py-3 text-foreground break-words max-w-md">{log.query}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
                        {log.result_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          log.coverage === "good"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {log.coverage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y">
            {filteredLogs.map((log) => (
              <div key={log.id} className="rounded-lg border bg-card p-3 space-y-1">
                <div className="text-sm text-foreground break-words">{log.query}</div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
                    {log.result_count} result{log.result_count !== 1 ? "s" : ""}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      log.coverage === "good"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {log.coverage}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{formatDate(log.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSearchLogs;
