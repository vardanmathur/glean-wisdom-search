import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import ThinkHeader from "@/components/think/ThinkHeader";
import ForgeMode, { ForgeHighlight } from "@/components/think/ForgeMode";
import OpponentMode, { OpponentHighlight } from "@/components/think/OpponentMode";
import { Loader2 } from "lucide-react";

const ADMIN_EMAIL = "vardan@gmail.com";
const DEFAULT_DAILY_LIMIT = 3;

const FORGE_PROMPT =
  "You are a warm thinking partner. The user has read a book highlight and shared what it means to them personally right now. In maximum 150 words: reflect back what you hear in their response, add one dimension or question that deepens their thinking, and end with one gentle challenge. No preamble. Be warm and intellectually honest.";

const OPPONENT_PROMPT_EARLY =
  "You are a sharp but warm sparring partner. The user is arguing against a book highlight. Push back on the user's argument specifically — not the original highlight. Find the weakness in what they wrote. Keep each response under 120 words.";

const OPPONENT_PROMPT_FINAL =
  "You are a sharp but warm sparring partner. This is the user's third and final argument against a book highlight. Push back briefly on their latest point, then write a warm 1-paragraph takeaway synthesising both sides fairly — what holds up, what doesn't, what the tension reveals. Keep the whole response under 200 words.";

type Mode = "forge" | "opponent";

const todayUtc = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const Think = () => {
  const { user, authLoading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode | null>(null);
  const [forgeHighlights, setForgeHighlights] = useState<ForgeHighlight[]>([]);
  const [opponentHighlight, setOpponentHighlight] = useState<OpponentHighlight | null>(null);
  const [loading, setLoading] = useState(true);
  const [shuffling, setShuffling] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [creditsUsed, setCreditsUsed] = useState<number | null>(null);
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);

  // ===== Auth gate =====
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  const isAdmin = user?.email === ADMIN_EMAIL;

  // ===== Load credits =====
  const loadCredits = useCallback(async () => {
    if (!user) return;
    const [{ data: cfg }, { data: usage }] = await Promise.all([
      supabase.from("think_config").select("daily_limit").eq("user_id", user.id).maybeSingle(),
      supabase.from("think_usage").select("ai_calls_used").eq("user_id", user.id).eq("date", todayUtc()).maybeSingle(),
    ]);
    setDailyLimit(cfg?.daily_limit ?? DEFAULT_DAILY_LIMIT);
    setCreditsUsed(usage?.ai_calls_used ?? 0);
  }, [user]);

  // ===== Fetch a single forge highlight (random tag, short, curated) =====
  const fetchForgeHighlight = useCallback(async (): Promise<ForgeHighlight | null> => {
    // Get distinct tags from public, curated highlights
    const { data: tagSample, error: tagErr } = await supabase
      .from("highlights")
      .select("tags")
      .eq("source", "curated")
      .or("visibility.eq.public,visibility.is.null")
      .not("tags", "is", null)
      .limit(500);
    if (tagErr) throw tagErr;

    const allTags = new Set<string>();
    (tagSample || []).forEach((r: any) => {
      (r.tags || []).forEach((t: string) => t && allTags.add(t));
    });
    const tagArr = Array.from(allTags);

    // Try up to 3 random tags
    for (let attempt = 0; attempt < 3 && tagArr.length > 0; attempt++) {
      const tag = tagArr[Math.floor(Math.random() * tagArr.length)];
      const { data: rows } = await supabase
        .from("highlights")
        .select("id, quote, book_id")
        .eq("source", "curated")
        .or("visibility.eq.public,visibility.is.null")
        .contains("tags", [tag])
        .limit(50);
      const short = (rows || []).filter((r: any) => r.quote && r.quote.length < 250);
      if (short.length >= 1) {
        const pick = short[Math.floor(Math.random() * short.length)];
        const enriched = await enrichWithBooks([pick]);
        return enriched[0] || null;
      }
    }

    // Fallback: any random short curated
    const { data: rows } = await supabase
      .from("highlights")
      .select("id, quote, book_id")
      .eq("source", "curated")
      .or("visibility.eq.public,visibility.is.null")
      .limit(200);
    const short = (rows || []).filter((r: any) => r.quote && r.quote.length < 250);
    if (short.length === 0) return null;
    const pick = short[Math.floor(Math.random() * short.length)];
    const enriched = await enrichWithBooks([pick]);
    return enriched[0] || null;
  }, []);

  // ===== Fetch highlights for given mode =====
  const fetchForRandomMode = useCallback(async () => {
    setLoadError(null);
    const chosen: Mode = Math.random() < 0.5 ? "forge" : "opponent";
    setMode(chosen);
    setForgeHighlights([]);
    setOpponentHighlight(null);

    try {
      if (chosen === "forge") {
        const single = await fetchForgeHighlight();
        if (!single) {
          setLoadError("Couldn't load highlights. Try shuffling.");
        } else {
          setForgeHighlights([single]);
        }
      } else {
        const { data: rows } = await supabase
          .from("highlights")
          .select("id, quote, book_id")
          .eq("source", "curated")
          .or("visibility.eq.public,visibility.is.null")
          .limit(300);
        if (!rows || rows.length === 0) {
          setLoadError("Couldn't load highlights. Try shuffling.");
        } else {
          const pick = rows[Math.floor(Math.random() * rows.length)];
          const enriched = await enrichWithBooks([pick]);
          setOpponentHighlight(enriched[0] || null);
        }
      }
    } catch (e) {
      console.error(e);
      setLoadError("Couldn't load highlights. Try shuffling.");
    }
  }, [fetchForgeHighlight]);

  // ===== Skip handler for Forge — refetch a new highlight, no credit cost =====
  const handleForgeSkip = useCallback(async (): Promise<boolean> => {
    setLoadError(null);
    try {
      const single = await fetchForgeHighlight();
      if (!single) {
        setLoadError("Couldn't load highlights. Try shuffling.");
        return false;
      }
      setForgeHighlights([single]);
      return true;
    } catch (e) {
      console.error(e);
      setLoadError("Couldn't load highlights. Try shuffling.");
      return false;
    }
  }, [fetchForgeHighlight]);

  const enrichWithBooks = async (rows: any[]): Promise<ForgeHighlight[]> => {
    const bookIds = Array.from(new Set(rows.map((r) => r.book_id).filter(Boolean)));
    let booksMap: Record<string, { title: string; author: string }> = {};
    if (bookIds.length > 0) {
      const { data: books } = await supabase.from("books").select("id, title, author").in("id", bookIds);
      (books || []).forEach((b: any) => {
        booksMap[b.id] = { title: b.title, author: b.author };
      });
    }
    return rows.map((r) => ({
      id: r.id,
      quote: r.quote,
      bookTitle: r.book_id ? booksMap[r.book_id]?.title : null,
      author: r.book_id ? booksMap[r.book_id]?.author : null,
    }));
  };

  // ===== Initial load =====
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      await Promise.all([loadCredits(), fetchForRandomMode()]);
      setLoading(false);
    })();
  }, [user, loadCredits, fetchForRandomMode]);

  // ===== Shuffle =====
  const handleShuffle = async () => {
    setShuffling(true);
    await fetchForRandomMode();
    setShuffling(false);
  };

  // ===== AI call wrapper with credit check + counter update =====
  const callAi = async (
    payload: { mode: "forge" | "opponent"; thinkPrompt: string; messages: { role: "user" | "assistant"; content: string }[] },
  ): Promise<{ ok: boolean; response?: string; error?: string }> => {
    if (!user) return { ok: false, error: "Not signed in" };

    // Re-read latest from DB
    const [{ data: cfg }, { data: usage }] = await Promise.all([
      supabase.from("think_config").select("daily_limit").eq("user_id", user.id).maybeSingle(),
      supabase.from("think_usage").select("ai_calls_used").eq("user_id", user.id).eq("date", todayUtc()).maybeSingle(),
    ]);
    const limit = cfg?.daily_limit ?? DEFAULT_DAILY_LIMIT;
    const used = usage?.ai_calls_used ?? 0;
    setDailyLimit(limit);
    setCreditsUsed(used);

    if (used >= limit) {
      return { ok: false, error: "You've used your thinking credits for today. Come back tomorrow." };
    }

    try {
      const { data, error } = await supabase.functions.invoke("synthesise-wisdom", { body: payload });
      if (error) {
        console.error("AI invoke error:", error);
        return { ok: false, error: "Something went wrong. Please try again." };
      }
      if (data?.error) {
        return { ok: false, error: data.error };
      }
      const response = data?.response;
      if (!response) {
        return { ok: false, error: "Something went wrong. Please try again." };
      }

      // Increment usage in DB
      const { error: upErr } = await supabase
        .from("think_usage")
        .upsert(
          { user_id: user.id, date: todayUtc(), ai_calls_used: used + 1 },
          { onConflict: "user_id,date" },
        );
      if (upErr) console.error("usage upsert failed:", upErr);

      // Refresh from DB so UI is source-of-truth-correct
      await loadCredits();

      return { ok: true, response };
    } catch (e) {
      console.error(e);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };

  // ===== Forge submit =====
  const handleForgeSubmit = async (input: string) => {
    const h = forgeHighlights[0];
    const highlightLine = h ? `"${h.quote}"${h.bookTitle ? ` — ${h.bookTitle}${h.author ? `, ${h.author}` : ""}` : ""}` : "";
    const userContent = `Highlight:\n${highlightLine}\n\nWhat this means to me right now: ${input}`;

    const result = await callAi({
      mode: "forge",
      thinkPrompt: FORGE_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    // Save session (non-blocking)
    if (result.ok && user) {
      supabase
        .from("think_sessions")
        .insert({
          user_id: user.id,
          mode: "forge",
          highlight_ids: forgeHighlights.map((h) => h.id),
          user_input: input,
          ai_response: result.response ?? null,
        })
        .then(({ error }) => {
          if (error) console.warn("Forge session save failed:", error);
        });
    }
    return result;
  };

  // ===== Opponent submit (per round) =====
  const handleOpponentSubmit = async (messages: { role: "user" | "assistant"; content: string }[]) => {
    const exchangesSoFar = messages.filter((m) => m.role === "assistant").length;
    const isFinal = exchangesSoFar === 2; // about to produce the 3rd assistant turn
    return callAi({
      mode: "opponent",
      thinkPrompt: isFinal ? OPPONENT_PROMPT_FINAL : OPPONENT_PROMPT_EARLY,
      messages,
    });
  };

  const handleOpponentAllComplete = (history: { role: "user" | "assistant"; content: string }[]) => {
    if (!user || !opponentHighlight) return;
    const rounds: any[] = [];
    let userTxt = "";
    history.forEach((m) => {
      if (m.role === "user") userTxt = m.content;
      else rounds.push({ user: userTxt, claude: m.content });
    });
    const last = rounds[rounds.length - 1];
    const payload = JSON.stringify([
      ...rounds.slice(0, -1).map((r, i) => ({ round: i + 1, user: r.user, claude: r.claude })),
      { round: rounds.length, user: last.user, claude: last.claude },
      { takeaway: last.claude },
    ]);
    supabase
      .from("think_sessions")
      .insert({
        user_id: user.id,
        mode: "opponent",
        highlight_ids: [opponentHighlight.id],
        user_input: null,
        ai_response: payload,
      })
      .then(({ error }) => {
        if (error) console.warn("Opponent session save failed:", error);
      });
  };

  const startNewSession = () => {
    window.location.reload();
  };

  // ===== Render =====
  if (authLoading || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Admin-only gate
  if (!isAdmin) {
    return <div className="min-h-[60vh]" />;
  }

  const limitReached = creditsUsed !== null && dailyLimit !== null && creditsUsed >= dailyLimit;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <ThinkHeader
        modeName={mode === "forge" ? "The Forge" : mode === "opponent" ? "The Opponent" : "…"}
        creditsUsed={creditsUsed}
        dailyLimit={dailyLimit}
        onShuffle={handleShuffle}
        shuffling={shuffling}
      />

      {limitReached && (
        <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
          You've used your thinking credits for today. Come back tomorrow.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : loadError ? (
        <p className="text-sm text-muted-foreground">{loadError}</p>
      ) : mode === "forge" && forgeHighlights.length >= 2 ? (
        <ForgeMode
          highlights={forgeHighlights}
          onSubmit={handleForgeSubmit}
          onComplete={startNewSession}
          disabled={limitReached}
        />
      ) : mode === "opponent" && opponentHighlight ? (
        <OpponentMode
          highlight={opponentHighlight}
          onSubmit={handleOpponentSubmit}
          onAllComplete={handleOpponentAllComplete}
          onComplete={startNewSession}
          disabled={limitReached}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No highlights available right now.</p>
      )}
    </div>
  );
};

export default Think;
