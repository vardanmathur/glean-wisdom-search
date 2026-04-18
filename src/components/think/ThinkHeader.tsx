import { Shuffle, Loader2 } from "lucide-react";

interface ThinkHeaderProps {
  modeName: string;
  creditsUsed: number | null;
  dailyLimit: number | null;
  onShuffle: () => void;
  shuffling?: boolean;
}

const ThinkHeader = ({ modeName, creditsUsed, dailyLimit, onShuffle, shuffling }: ThinkHeaderProps) => {
  const remaining = creditsUsed !== null && dailyLimit !== null ? Math.max(0, dailyLimit - creditsUsed) : null;

  return (
    <div className="border-b pb-4 mb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Today's mode</div>
          <h1 className="font-display text-2xl text-foreground">{modeName}</h1>
        </div>
        <button
          onClick={onShuffle}
          disabled={shuffling}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 px-3 py-1.5 text-sm text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
          aria-label="Shuffle to a new mode"
        >
          {shuffling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />}
          Shuffle
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        {remaining !== null && dailyLimit !== null ? (
          <>{remaining} of {dailyLimit} thinking credits remaining today</>
        ) : (
          <>Loading credits…</>
        )}
      </p>
    </div>
  );
};

export default ThinkHeader;
