import { useState } from "react";
import { Link } from "react-router-dom";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";

/**
 * Persisted state (sessionStorage) — survives mobile PWA backgrounding / window switch.
 *   • input     → glean_think_forge_<highlightId>_input
 *   • response  → glean_think_forge_<highlightId>_response
 *   • done      → glean_think_forge_<highlightId>_done
 * Cleared on: skip (refetches new highlight) and "Start a new session" (onComplete).
 */

export interface ForgeHighlight {
  id: string;
  quote: string;
  bookTitle?: string | null;
  author?: string | null;
}

interface ForgeModeProps {
  highlights: ForgeHighlight[];
  onSubmit: (input: string) => Promise<{ ok: boolean; response?: string; error?: string }>;
  onComplete: () => void;
  onSkip: () => Promise<boolean>;
  disabled?: boolean;
}

const FORGE_PROMPT = "What does this mean to you right now?";

const ForgeMode = ({ highlights, onSubmit, onComplete, onSkip, disabled }: ForgeModeProps) => {
  const hlId = highlights[0]?.id ?? "none";
  const [input, setInput, clearInput] = useSessionStorageState<string>(`glean_think_forge_${hlId}_input`, "");
  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [response, setResponse, clearResponse] = useSessionStorageState<string | null>(`glean_think_forge_${hlId}_response`, null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone, clearDone] = useSessionStorageState<boolean>(`glean_think_forge_${hlId}_done`, false);

  const highlight = highlights[0];

  const handleSubmit = async () => {
    if (!input.trim() || submitting || disabled) return;
    setSubmitting(true);
    setError(null);
    const result = await onSubmit(input.trim());
    setSubmitting(false);
    if (result.ok && result.response) {
      setResponse(result.response);
      setDone(true);
    } else {
      setError(result.error || "Something went wrong. Please try again.");
    }
  };

  const handleSkip = async () => {
    if (skipping || submitting || done) return;
    setSkipping(true);
    setError(null);
    clearInput();
    clearResponse();
    clearDone();
    await onSkip();
    setSkipping(false);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {skipping ? (
          <div className="rounded-lg border bg-card p-6 card-shadow flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : highlight ? (
          <div className="rounded-lg border bg-card p-4 card-shadow">
            <p className="font-body text-foreground leading-relaxed">"{highlight.quote}"</p>
            {(highlight.bookTitle || highlight.author) && (
              <p className="text-xs text-muted-foreground mt-2">
                — {highlight.bookTitle}{highlight.author ? `, ${highlight.author}` : ""}
              </p>
            )}
          </div>
        ) : null}

        {!done && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSkip}
              disabled={skipping || submitting}
              className="text-xs text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline disabled:opacity-50"
            >
              {skipping ? "Loading…" : "Skip — show me something else"}
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">{FORGE_PROMPT}</label>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Take your time…"
          className="min-h-[140px] text-base"
          disabled={done || submitting || skipping}
        />
      </div>

      {!done && (
        <Button
          onClick={handleSubmit}
          disabled={submitting || skipping || !input.trim() || disabled}
          className="w-full sm:w-auto"
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Thinking…</>
          ) : (
            "Submit"
          )}
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {response && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
          <div className="text-xs uppercase tracking-wider text-primary mb-2">Response</div>
          <p className="font-body text-foreground leading-relaxed whitespace-pre-wrap">{response}</p>
        </div>
      )}

      {done && (
        <div className="pt-4 border-t space-y-3">
          <p className="text-sm text-muted-foreground">That's a wrap for this session.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={() => { clearInput(); clearResponse(); clearDone(); onComplete(); }}>Start a new session</Button>
            <Link
              to="/"
              className="text-sm text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
            >
              That's enough for today
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default ForgeMode;
