import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import ThinkHeader from "@/components/think/ThinkHeader";
import ForgeMode, { ForgeHighlight } from "@/components/think/ForgeMode";
import OpponentMode, { OpponentHighlight, OpponentPersona } from "@/components/think/OpponentMode";
import { Loader2, Flame, Swords } from "lucide-react";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";
import { useAuthGate } from "@/hooks/useAuthGate";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const DEFAULT_DAILY_LIMIT = 3;
const THINK_SESSION_KEY = "glean_think_session";

const FORGE_PROMPT =
  "You are a warm thinking partner. The user has read a book highlight and shared what it means to them personally right now. In maximum 150 words: reflect back what you hear in their response, add one dimension or question that deepens their thinking, and end with one gentle challenge. No preamble. Be warm and intellectually honest.";

const OPPONENT_TAKEAWAY_PROMPT =
  "This is the final exchange. Write a warm 1-paragraph takeaway that synthesises both sides of the conversation fairly — what held up, what didn't, and what the tension between the two positions reveals. Speak as yourself, not as the sparring partner persona. Be honest and generous.";

const OPPONENT_PERSONAS: OpponentPersona[] = [
  {
    key: "roommate",
    label: "The Roommate",
    defaultName: "Alex",
    description: "Casual, direct, no filter. Calls you out like a friend.",
    systemPrompt:
      "You are the user's college roommate — someone who knows them well and has no filter. Speak casually, use contractions, maybe light humour. Push back on weak arguments like a good friend would — directly but without malice. Keep it real and keep it short. Under 100 words per response. Address the user's sparring partner name if they've set one.",
  },
  {
    key: "parent",
    label: "The Parent",
    defaultName: "Mom",
    description: "Loving, patient, always sees the bigger picture.",
    systemPrompt:
      "You are the user's parent — loving, wise, and always seeing the bigger picture. You're not here to win the argument, you're here to help them grow. Speak warmly. Gently challenge assumptions. Ask the question they're avoiding. Under 100 words per response.",
  },
  {
    key: "partner",
    label: "The Partner",
    defaultName: "Sam",
    description: "Knows you deeply, won't let you off the hook.",
    systemPrompt:
      "You are the user's life partner — someone who loves them deeply but won't let them get away with lazy thinking. You know their patterns. You see when they're rationalising. Push them to think smarter, not just harder. Be encouraging but sharp. Under 100 words per response.",
  },
  {
    key: "mentor",
    label: "The Mentor",
    defaultName: "Coach",
    description: "Professional, structured, draws on experience.",
    systemPrompt:
      "You are the user's trusted professional mentor — experienced, measured, focused on their growth. Bring frameworks and perspective. Challenge their thinking with better questions, not just counter-arguments. Be direct but respectful. Under 100 words per response.",
  },
  {
    key: "teacher",
    label: "The Teacher",
    defaultName: "Prof",
    description: "Socratic. Responds only with questions, never answers.",
    systemPrompt:
      "You are the user's most memorable old teacher — wise, patient, and Socratic. You never tell them what to think. You only ask questions that make them think harder. Respond with 2-3 precise questions that expose the assumptions in their argument. No statements, no answers — only questions. Under 80 words.",
  },
];

type Mode = "forge" | "opponent";

const todayUtc = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const Think = () => {
  const { user, authLoading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode, clearMode] = useSessionStorageState<Mode | null>(`${THINK_SESSION_KEY}_mode`, null);
  const [forgeHighlights, setForgeHighlights, clearForgeHighlights] =
    useSessionStorageState<ForgeHighlight[]>(`${THINK_SESSION_KEY}_forge`, []);
  const [opponentHighlight, setOpponentHighlight, clearOpponentHighlight] =
    useSessionStorageState<OpponentHighlight | null>(`${THINK_SESSION_KEY}_opponentHl`, null);
  const [modeLoading, setModeLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [creditsUsed, setCreditsUsed] = useState<number | null>(null);
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);

  // Opponent persona state — persisted across mobile PWA backgrounding so
  // an in-progress sparring session isn't wiped by a window switch.
  const [opponentPersona, setOpponentPersona, clearOpponentPersona] =
    useSessionStorageState<OpponentPersona | null>(`${THINK_SESSION_KEY}_persona`, null);
  const [opponentName, setOpponentName, clearOpponentName] =
    useSessionStorageState<string>(`${THINK_SESSION_KEY}_personaName`, "");

  // ===== Auth gate =====
  // Resilient against transient null-user states during PWA resume / token refresh.
  useAuthGate("/auth", (u) => !!u);

  const { isAdmin } = useIsAdmin();

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

  // ===== Fetch a single forge highlight (random tag, short, curated) =====
  const fetchForgeHighlight = useCallback(async (): Promise<ForgeHighlight | null> => {
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

  // ===== Mode selection handler =====
  const handleSelectMode = useCallback(async (chosen: Mode) => {
    setLoadError(null);
    setModeLoading(true);
    setMode(chosen);
    setForgeHighlights([]);
    setOpponentHighlight(null);
    setOpponentPersona(null);
    setOpponentName("");

    try {
      if (chosen === "forge") {
        const single = await fetchForgeHighlight();
        if (!single) {
          setLoadError("Couldn't load highlights. Try again.");
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
          setLoadError("Couldn't load highlights. Try again.");
        } else {
          const pick = rows[Math.floor(Math.random() * rows.length)];
          const enriched = await enrichWithBooks([pick]);
          setOpponentHighlight(enriched[0] || null);
        }
      }
    } catch (e) {
      console.error(e);
      setLoadError("Couldn't load highlights. Try again.");
    }
    setModeLoading(false);
  }, [fetchForgeHighlight]);

  // ===== Skip handler for Forge — refetch a new highlight, no credit cost =====
  const handleForgeSkip = useCallback(async (): Promise<boolean> => {
    setLoadError(null);
    try {
      const single = await fetchForgeHighlight();
      if (!single) {
        setLoadError("Couldn't load highlights. Try again.");
        return false;
      }
      setForgeHighlights([single]);
      return true;
    } catch (e) {
      console.error(e);
      setLoadError("Couldn't load highlights. Try again.");
      return false;
    }
  }, [fetchForgeHighlight]);

  // ===== Initial load: only credits, no highlights yet (selection screen first) =====
  useEffect(() => {
    if (!user) return;
    loadCredits();
  }, [user, loadCredits]);

  // ===== Back to mode selection (replaces shuffle behaviour) =====
  const handleBackToSelection = () => {
    clearMode();
    clearForgeHighlights();
    clearOpponentHighlight();
    clearOpponentPersona();
    clearOpponentName();
    setLoadError(null);
  };

  // ===== AI call wrapper with credit check + counter update =====
  const callAi = async (
    payload: { mode: "forge" | "opponent"; thinkPrompt: string; messages: { role: "user" | "assistant"; content: string }[] },
  ): Promise<{ ok: boolean; response?: string; error?: string }> => {
    if (!user) return { ok: false, error: "Not signed in" };

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

      const { error: upErr } = await supabase
        .from("think_usage")
        .upsert(
          { user_id: user.id, date: todayUtc(), ai_calls_used: used + 1 },
          { onConflict: "user_id,date" },
        );
      if (upErr) console.error("usage upsert failed:", upErr);

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

    let prompt: string;
    if (isFinal) {
      prompt = OPPONENT_TAKEAWAY_PROMPT;
    } else {
      const persona = opponentPersona ?? OPPONENT_PERSONAS[0];
      const name = (opponentName || persona.defaultName).trim();
      prompt = `${persona.systemPrompt}\n\nThe user has named you "${name}". Speak as ${name}.`;
    }

    return callAi({
      mode: "opponent",
      thinkPrompt: prompt,
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
    const payload = JSON.stringify({
      persona: opponentPersona?.key ?? null,
      personaName: opponentName || null,
      rounds: rounds.map((r, i) => ({ round: i + 1, user: r.user, ai: r.claude })),
      takeaway: last.claude,
    });
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
    // Clearing persisted state returns the user to the mode-selection
    // screen (mode === null) — no reload needed.
    clearMode();
    clearForgeHighlights();
    clearOpponentHighlight();
    clearOpponentPersona();
    clearOpponentName();
    setLoadError(null);
  };

  // ===== Render =====
  if (authLoading || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const limitReached = creditsUsed !== null && dailyLimit !== null && creditsUsed >= dailyLimit;
  const remaining = creditsUsed !== null && dailyLimit !== null ? Math.max(0, dailyLimit - creditsUsed) : null;

  // ===== Mode selection screen =====
  if (mode === null) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <div className="border-b pb-4 mb-8">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Think!</div>
        <Link to="/think/history" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          View history →
        </Link>
      </div>
      <h1 className="font-display text-2xl text-foreground">Today's practice — what would you like to do?</h1>
      <p className="text-xs text-muted-foreground mt-3">
            {remaining !== null && dailyLimit !== null ? (
              <>{remaining} of {dailyLimit} thinking credits remaining today</>
            ) : (
              <>Loading credits…</>
            )}
          </p>
        </div>

        {limitReached && (
          <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
            You've used your thinking credits for today. Come back tomorrow.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => handleSelectMode("forge")}
            disabled={modeLoading || limitReached}
            className="text-left rounded-lg border bg-card p-5 hover:border-primary hover:bg-primary/5 transition-colors card-shadow disabled:opacity-50"
          >
            <Flame className="h-5 w-5 text-primary mb-3" />
            <div className="font-display text-lg text-foreground mb-1">The Forge</div>
            <p className="text-sm text-muted-foreground">Reflect on a single idea from your library.</p>
          </button>
          <button
            onClick={() => handleSelectMode("opponent")}
            disabled={modeLoading || limitReached}
            className="text-left rounded-lg border bg-card p-5 hover:border-primary hover:bg-primary/5 transition-colors card-shadow disabled:opacity-50"
          >
            <Swords className="h-5 w-5 text-primary mb-3" />
            <div className="font-display text-lg text-foreground mb-1">The Opponent</div>
            <p className="text-sm text-muted-foreground">Challenge an idea with your sparring partner.</p>
          </button>
        </div>

        {modeLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {loadError && <p className="text-sm text-destructive mt-4">{loadError}</p>}
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <ThinkHeader
        modeName={mode === "forge" ? "The Forge" : "The Opponent"}
        creditsUsed={creditsUsed}
        dailyLimit={dailyLimit}
        onShuffle={handleBackToSelection}
        shuffling={false}
        personaName={mode === "opponent" && opponentPersona ? (opponentName || opponentPersona.defaultName) : null}
        shuffleLabel="Change mode"
      />

      {limitReached && (
        <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
          You've used your thinking credits for today. Come back tomorrow.
        </div>
      )}

      {modeLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : loadError ? (
        <p className="text-sm text-muted-foreground">{loadError}</p>
      ) : mode === "forge" && forgeHighlights.length >= 1 ? (
        <ForgeMode
          highlights={forgeHighlights}
          onSubmit={handleForgeSubmit}
          onComplete={startNewSession}
          onSkip={handleForgeSkip}
          disabled={limitReached}
        />
      ) : mode === "opponent" && opponentHighlight ? (
        <OpponentMode
          highlight={opponentHighlight}
          personas={OPPONENT_PERSONAS}
          selectedPersona={opponentPersona}
          personaName={opponentName}
          onPersonaConfirm={(persona, name) => {
            setOpponentPersona(persona);
            setOpponentName(name);
          }}
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
