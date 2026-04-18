import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

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
  disabled?: boolean;
}

const FORGE_PROMPT = "What single principle connects these ideas?";

const ForgeMode = ({ highlights, onSubmit, onComplete, disabled }: ForgeModeProps) => {
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {highlights.map((h, i) => (
          <div key={h.id} className="rounded-lg border bg-card p-4 card-shadow">
            <p className="font-body text-foreground leading-relaxed">"{h.quote}"</p>
            {(h.bookTitle || h.author) && (
              <p className="text-xs text-muted-foreground mt-2">
                — {h.bookTitle}{h.author ? `, ${h.author}` : ""}
              </p>
            )}
          </div>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">{FORGE_PROMPT}</label>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Take your time…"
          className="min-h-[140px] text-base"
          disabled={done || submitting}
        />
      </div>

      {!done && (
        <Button
          onClick={handleSubmit}
          disabled={submitting || !input.trim() || disabled}
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
        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground mb-3">That's a wrap for this session.</p>
          <Button variant="outline" onClick={onComplete}>Start a new session</Button>
        </div>
      )}
    </div>
  );
};

export default ForgeMode;
