import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Leaf, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RefineError, refineSynthesis, type Highlight } from "@/lib/data";
import {
  MAX_REFINE_CONTEXT_CHARS,
  canRefine,
  cleanContext,
  historyForRequest,
  refineErrorMessage,
  type RefineTurn,
} from "@/lib/refine";

interface RefineThreadProps {
  /** The search query, i.e. the question as asked. */
  question: string;
  /** The turn-1 synthesis text. */
  synthesis: string;
  /** Every highlight the person has already been shown (original results plus earlier additions). */
  known: Highlight[];
  turns: RefineTurn[];
  onTurn: (turn: RefineTurn) => void;
  /** The first search found little in the library. */
  coveragePoor?: boolean;
}

// Under the turn-1 card: earlier refinements stacked, then the box for the next one.
// The call happens only in submit(), which only the button runs: no effects, no auto-retry.
const RefineThread = ({ question, synthesis, known, turns, onTurn, coveragePoor = false }: RefineThreadProps) => {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const submit = async () => {
    const context = cleanContext(text);
    if (!context || inFlight.current || !canRefine(turns)) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const r = await refineSynthesis({ question, synthesis, context, history: historyForRequest(turns), highlights: known, coveragePoor });
      onTurn({ context, answer: r.answer, searchedFor: r.searchedFor, added: r.added });
      setText("");
    } catch (e) {
      setError(refineErrorMessage(e instanceof RefineError ? e.code : undefined));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <div className="mb-8 -mt-4 space-y-4" data-testid="refine-thread">
      {turns.map((t, i) => (
        <div key={i} className="space-y-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">You added:</span> {t.context}
          </p>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-6">
            <div className="mb-3 flex items-center gap-2">
              <Leaf className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Refined</h3>
            </div>
            <div className="prose prose-sm max-w-none text-base leading-relaxed text-foreground prose-p:my-2 prose-strong:text-foreground">
              <ReactMarkdown>{t.answer}</ReactMarkdown>
            </div>
            {t.searchedFor && <p className="mt-4 text-xs text-muted-foreground">Searched again for: {t.searchedFor}</p>}
            {t.added.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t.added.length} new highlight{t.added.length !== 1 ? "s" : ""} added below
              </p>
            )}
          </div>
        </div>
      ))}

      {canRefine(turns) ? (
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_REFINE_CONTEXT_CHARS}
            rows={3}
            disabled={pending}
            placeholder="Tell Glean what's missing or specific to your situation…"
            className="text-sm"
          />
          <div className="flex items-center gap-3">
            <Button type="button" onClick={submit} disabled={pending || !cleanContext(text)}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refining…
                </>
              ) : (
                "Refine"
              )}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Start a new search to go further.</p>
      )}
    </div>
  );
};

export default RefineThread;