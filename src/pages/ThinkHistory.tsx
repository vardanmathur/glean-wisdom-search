import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAuthGate } from "@/hooks/useAuthGate";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Session {
  id: string;
  mode: string;
  user_input: string | null;
  ai_response: string | null;
  created_at: string;
  promoted: boolean;
  highlight_ids: string[]; // Added highlight_ids to the Session interface
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

interface CachedHighlight {
  id: string;
  quote: string;
  bookTitle: string | null;
  author: string | null;
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
  const [cachedHighlights, setCachedHighlights] = useState<Map<string, CachedHighlight>>(new Map());
  const [fetchingHighlight, setFetchingHighlight] = useState<boolean>(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("think_sessions")
        .select("id, mode, user_input, ai_response, created_at, promoted, highlight_ids") // Select highlight_ids
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

  // Effect to fetch highlight when a card is expanded
  useEffect(() => {
    if (!expandedId || !sessions) return;

    const session = sessions.find(s => s.id === expandedId);
    if (!session || !session.highlight_ids || session.highlight_ids.length === 0) {
      setFetchingHighlight(false);
      return;
    }

    const highlightId = session.highlight_ids[0];
    if (cachedHighlights.has(highlightId)) {
      setFetchingHighlight(false);
      return;
    }

    let cancelled = false;
    setFetchingHighlight(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("highlights")
          .select("id, quote, books!highlights_book_id_fkey(title, author)") // Corrected select statement with table prefix
          .eq("id", highlightId)
          .single();

        if (cancelled) return;

        if (error) {
          console.error("Error fetching highlight:", error);
        } else if (data) {
          setCachedHighlights(prev => {
            const newMap = new Map(prev);
            newMap.set(highlightId, {
              id: data.id,
              quote: data.quote,
              bookTitle: data.books?.title || null,
              author: data.books?.author || null,
            });
            return newMap;
          });
        }
      } finally {
        if (!cancelled) {
          setFetchingHighlight(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      setFetchingHighlight(false);
    };
  }, [expandedId, sessions, cachedHighlights]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Delete this session?")) return;

    const { error } = await supabase
      .from("think_sessions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      toast.error("Failed to delete session");
    } else {
      setSessions((prev) => (prev ? prev.filter((s) => s.id !== id) : null));
      // Also remove from cache if it was a highlight session
      setCachedHighlights(prev => {
        const newMap = new Map(prev);
        const sessionToDelete = sessions?.find(s => s.id === id);
        if (sessionToDelete && sessionToDelete.highlight_ids && sessionToDelete.highlight_ids.length > 0) {
          newMap.delete(sessionToDelete.highlight_ids[0]);
        }
        return newMap;
      });
    }
  };

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
            const highlightId = s.highlight_ids && s.highlight_ids.length > 0 ? s.highlight_ids[0] : null;
            const cachedHighlight = highlightId ? cachedHighlights.get(highlightId) : null;

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
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatDate(s.created_at)}</span>
                    <button
                      onClick={(e) => handleDelete(e, s.id)}
                      className="text-muted-foreground/40 hover:text-destructive transition-colors"
                      title="Delete session"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-foreground">
                  {isOpen ? preview : truncate(preview, 120)}
                </p>
                {isOpen && s.ai_response && (
                  <div className="mt-3 pt-3 border-t">
                    {/* Display Original Highlight */}
                    {fetchingHighlight && !cachedHighlight && highlightId ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading original highlight...
                      </div>
                    ) : cachedHighlight ? (
                      <div className="mb-4">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                          Original Highlight
                        </div>
                        <div className="border-l-2 border-primary/30 pl-3">
                          <p className="italic text-sm text-foreground whitespace-pre-wrap">
                            "{cachedHighlight.quote}"
                          </p>
                          {(cachedHighlight.bookTitle || cachedHighlight.author) && (
                            <p className="text-xs text-muted-foreground text-right mt-1">
                              — {cachedHighlight.bookTitle}{cachedHighlight.author ? `, ${cachedHighlight.author}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : null}

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
