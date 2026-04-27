import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";

const OPPONENT_HISTORY_KEY = "glean_think_opponent_history";

export interface OpponentHighlight {
  id: string;
  quote: string;
  bookTitle?: string | null;
  author?: string | null;
}

export interface OpponentPersona {
  key: string;
  label: string;
  defaultName: string;
  description: string;
  systemPrompt: string;
}

type Msg = { role: "user" | "assistant"; content: string };

interface OpponentModeProps {
  highlight: OpponentHighlight;
  personas: OpponentPersona[];
  selectedPersona: OpponentPersona | null;
  personaName: string;
  onPersonaConfirm: (persona: OpponentPersona, name: string) => void;
  onSubmit: (messages: Msg[]) => Promise<{ ok: boolean; response?: string; error?: string }>;
  onAllComplete: (history: Msg[]) => void;
  onComplete: () => void;
  disabled?: boolean;
}

const OPPONENT_PROMPT = "Write the strongest case against this";
const MAX_EXCHANGES = 3;

const OpponentMode = ({
  highlight,
  personas,
  selectedPersona,
  personaName,
  onPersonaConfirm,
  onSubmit,
  onAllComplete,
  onComplete,
  disabled,
}: OpponentModeProps) => {
  // Local picker state — only used until persona is confirmed
  const [pickerPersona, setPickerPersona] = useState<OpponentPersona | null>(null);
  const [nameInput, setNameInput] = useState("");

  // Conversation persisted across mobile PWA backgrounding. Keyed on the
  // highlight id so unrelated sessions don't bleed into each other.
  const historyKey = `${OPPONENT_HISTORY_KEY}_${highlight.id}_history`;
  const inputKey = `${OPPONENT_HISTORY_KEY}_${highlight.id}_input`;
  const [history, setHistory, clearHistory] = useSessionStorageState<Msg[]>(historyKey, []);
  const [input, setInput, clearInput] = useSessionStorageState<string>(inputKey, "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exchangesDone = history.filter((m) => m.role === "assistant").length;
  const sessionComplete = exchangesDone >= MAX_EXCHANGES;

  // ===== Persona picker screen =====
  if (!selectedPersona) {
    if (!pickerPersona) {
      return (
        <div className="space-y-6">
          <div>
            <h2 className="font-display text-xl text-foreground mb-1">Choose your sparring partner</h2>
            <p className="text-sm text-muted-foreground">Each persona challenges you differently.</p>
          </div>
          <div className="grid gap-3">
            {personas.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  setPickerPersona(p);
                  setNameInput(p.defaultName);
                }}
                className="text-left rounded-lg border bg-card p-4 hover:border-primary hover:bg-primary/5 transition-colors card-shadow"
              >
                <div className="font-display text-base text-foreground">
                  {p.label} <span className="text-muted-foreground">— "{p.defaultName}"</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Name editor for chosen persona
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl text-foreground mb-1">{pickerPersona.label}</h2>
          <p className="text-sm text-muted-foreground">{pickerPersona.description}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            What's your sparring partner's name today?
          </label>
          <Input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={pickerPersona.defaultName}
            className="text-base"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              const finalName = nameInput.trim() || pickerPersona.defaultName;
              onPersonaConfirm(pickerPersona, finalName);
            }}
          >
            Confirm
          </Button>
          <button
            onClick={() => {
              setPickerPersona(null);
              setNameInput("");
            }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Pick a different persona
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!input.trim() || submitting || sessionComplete || disabled) return;
    setSubmitting(true);
    setError(null);

    const userMsg: Msg = { role: "user", content: input.trim() };
    const nextHistory = [...history, userMsg];

    const contextHeader: Msg = {
      role: "user",
      content: `The book highlight under debate is:\n"${highlight.quote}"${highlight.bookTitle ? ` — ${highlight.bookTitle}` : ""}\n\nMy argument against it: ${userMsg.content}`,
    };

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

  const displayName = personaName || selectedPersona.defaultName;

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
          const isFinal = !isUser && i === history.length - 1 && history.filter((x) => x.role === "assistant").length >= MAX_EXCHANGES;
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
                {isUser ? "You:" : isFinal ? "Takeaway:" : `${displayName} says:`}
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
          <Button variant="outline" onClick={() => { clearHistory(); clearInput(); onComplete(); }}>Start a new session</Button>
        </div>
      )}
    </div>
  );
};

export default OpponentMode;
