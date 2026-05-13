import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAuthGate } from "@/hooks/useAuthGate";
import { supabase } from "@/integrations/supabase/client";

interface Session {
  id: string;
  mode: string;
  user_input: string | null;
  ai_response: string | null;
  created_at: string;
  promoted: boolean;
}

interface OpponentRound {
  round: number;
  user: string;
  ai: string;
}

interface OpponentData {
  persona: string;
  personaName: string | null;
  rounds: OpponentRound[];
  takeaway: string;
}

const truncate = (s: string | null, n: number) =>
  !s ? "" : s.length > n ? s.slice(0, n).trimEnd() + "…" : s;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

const ThinkHistory = () => {
  const { user, authLoading } = useAuth();
  useAuthGate("/auth", (u) => !!u);

  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("think_sessions")
        .select("id, mode, user_input, ai_response, created_at, promoted")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) {
        console.error(error);
        setSessions([]);
      } else {
        setSessions(data || []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading || !user || sessions === null) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <Link
        to="/think"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Think!
      </Link>

      <div className="border-b pb-4 mb-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">History</div>
        <h1 className="font-display text-2xl text-foreground">Your Think! Sessions</h1>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">No Think! sessions yet.</p>
          <Link to="/think" className="text-sm text-primary hover:underline">
            Start your first session
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const isOpen = expandedId === s.id;
            const isForge = s.mode === "forge";
            const preview = s.user_input ?? "[Opponent session]";
            return (
              <button
                key={s.id}
                onClick={() => setExpandedId(isOpen ? null : s.id)}
                className="w-full text-left rounded-lg border bg-card p-4 hover:border-primary/40 transition-colors card-shadow"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      isForge
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isForge ? "Forge" : "Opponent"}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(s.created_at)}</span>
                </div>
                <p className="text-sm text-foreground">
                  {isOpen ? preview : truncate(preview, 120)}
                </p>
                {isOpen && s.ai_response && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      AI response
                    </div>
                    {(() => {
                      try {
                        const data: OpponentData = JSON.parse(s.ai_response);
                        return (
                          <div className="space-y-4">
                            <div className="text-xs text-muted-foreground italic">
                              Sparring with: {data.personaName || data.persona}
                            </div>
                            <div className="space-y-4">
                              {data.rounds.map((round, idx) => (
                                <div key={idx} className={idx > 0 ? "pt-4 border-t border-border/40" : ""}>
                                  <div className="mb-2">
                                    <span className="text-[10px] font-medium text-muted-foreground uppercase block mb-0.5">
                                      You:
                                    </span>
                                    <p className="text-sm text-foreground whitespace-pre-wrap">
                                      {round.user}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-medium text-muted-foreground uppercase block mb-0.5">
                                      AI:
                                    </span>
                                    <p className="text-sm text-foreground whitespace-pre-wrap">
                                      {round.ai}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="pt-3 border-t">
                              <div className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-1">
                                Takeaway
                              </div>
                              <p className="text-sm text-foreground whitespace-pre-wrap">{data.takeaway}</p>
                            </div>
                          </div>
                        );
                      } catch (e) {
                        // If parse fails, it's a Forge session or unexpected format
                        return <p className="text-sm text-foreground whitespace-pre-wrap">{s.ai_response}</p>;
                      }
                    })()}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ThinkHistory;
