import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export interface OpponentHighlight {
  id: string;
  quote: string;
  bookTitle?: string | null;
  author?: string | null;
}

type Msg = { role: "user" | "assistant"; content: string };

interface OpponentModeProps {
  highlight: OpponentHighlight;
  onSubmit: (messages: Msg[]) => Promise<{ ok: boolean; response?: string; error?: string }>;
  onAllComplete: (history: Msg[]) => void;
  onComplete: () => void;
  disabled?: boolean;
}

const OPPONENT_PROMPT = "Write the strongest case against this";
const MAX_EXCHANGES = 3;

const OpponentMode = ({ highlight, onSubmit, onAllComplete, onComplete, disabled }: OpponentModeProps) => {
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exchangesDone = history.filter((m) => m.role === "assistant").length;
  const sessionComplete = exchangesDone >= MAX_EXCHANGES;

  const handleSubmit = async () => {
    if (!input.trim() || submitting || sessionComplete || disabled) return;
    setSubmitting(true);
    setError(null);

    const userMsg: Msg = { role: "user", content: input.trim() };
    const nextHistory = [...history, userMsg];

    // Prepend highlight context as the first user message implicitly via system in edge fn.
    // But to keep AI grounded, include the highlight as the opening user turn:
    const contextHeader: Msg = {
      role: "user",
      content: `The book highlight under debate is:\n"${highlight.quote}"${highlight.bookTitle ? ` — ${highlight.bookTitle}` : ""}\n\nMy argument against it: ${userMsg.content}`,
    };

    // For round 1, send the contextual header. For later rounds, send raw history.
    const messagesForApi: Msg[] = history.length === 0
      ? [contextHeader]
      : [
          {
            role: "user",
            content: `The book highlight under debate is:\n"${highlight.quote}"${highlight.bookTitle ? ` — ${highlight.bookTitle}` : ""}`,
          },
          ...nextHistory,
        ];

    const result = await onSubmit(messagesForApi);

    if (!result.ok || !result.response) {
      setSubmitting(false);
      setError(result.error || "Something went wrong. Please try again.");
      return;
    }

    const assistantMsg: Msg = { role: "assistant", content: result.response };
    const finalHistory = [...nextHistory, assistantMsg];
    setHistory(finalHistory);
    setInput("");
    setSubmitting(false);

    if (finalHistory.filter((m) => m.role === "assistant").length >= MAX_EXCHANGES) {
      onAllComplete(finalHistory);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4 card-shadow">
        <p className="font-body text-foreground leading-relaxed">"{highlight.quote}"</p>
        {(highlight.bookTitle || highlight.author) && (
          <p className="text-xs text-muted-foreground mt-2">
            — {highlight.bookTitle}{highlight.author ? `, ${highlight.author}` : ""}
          </p>
        )}
      </div>

      {/* Conversation history */}
      <div className="space-y-4">
        {history.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <div
              key={i}
              className={
                isUser
                  ? "rounded-lg border bg-muted/40 p-4"
                  : "rounded-lg border border-primary/20 bg-primary/5 p-4"
              }
            >
              <div className={`text-xs uppercase tracking-wider mb-2 ${isUser ? "text-muted-foreground" : "text-primary"}`}>
                {isUser ? "You" : "Sparring partner"}
              </div>
              <p className="font-body text-foreground leading-relaxed whitespace-pre-wrap">{m.content}</p>
            </div>
          );
        })}
        {submitting && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      {!sessionComplete && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            {history.length === 0 ? OPPONENT_PROMPT : "Your reply"}
          </label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Take your time…"
            className="min-h-[120px] text-base"
            disabled={submitting}
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">
              Round {exchangesDone + 1} of {MAX_EXCHANGES}
            </span>
            <Button onClick={handleSubmit} disabled={submitting || !input.trim() || disabled}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending…</> : "Submit"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {sessionComplete && (
        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground mb-3">That's a wrap for this session.</p>
          <Button variant="outline" onClick={onComplete}>Start a new session</Button>
        </div>
      )}
    </div>
  );
};

export default OpponentMode;
