import { useEffect } from "react";
import { Highlight } from "@/lib/data";
import { useSavedHighlights } from "@/context/SavedHighlightsContext";
import { useAuth } from "@/context/AuthContext";
import { Bookmark, ThumbsUp, ThumbsDown, Flag } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface HighlightCardProps {
  highlight: Highlight;
  index?: number;
}

const HighlightCard = ({ highlight, index = 0 }: HighlightCardProps) => {
  const { isSaved, toggleSave } = useSavedHighlights();
  const { user } = useAuth();
  const { toast } = useToast();
  const saved = isSaved(highlight.id);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const [reported, setReported] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(highlight.displayName || null);

  useEffect(() => {
    if (highlight.source === "user" && highlight.userId && !displayName) {
      supabase
        .from("user_profiles")
        .select("display_name")
        .eq("id", highlight.userId)
        .single()
        .then(({ data }) => {
          if (data?.display_name) setDisplayName(data.display_name);
        });
    }
  }, [highlight.userId, highlight.source, displayName]);

  const isOwnHighlight = user && highlight.userId === user.id;
  const canReport = user && !isOwnHighlight && highlight.source !== "private";

  const handleReport = async () => {
    const { error } = await supabase
      .from("highlights")
      .update({ reported: true })
      .eq("id", highlight.id);

    if (!error) {
      setReported(true);
      toast({ title: "Highlight reported. We'll review it shortly." });
    }
    setShowReportConfirm(false);
  };

  return (
    <div
      className="group relative rounded-lg border bg-card p-6 card-shadow hover:card-shadow-hover transition-all duration-300 animate-fade-in"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Report button */}
      {canReport && !reported && (
        <button
          onClick={() => setShowReportConfirm(true)}
          className="absolute top-3 right-3 p-1 rounded text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
          title="Report highlight"
        >
          <Flag className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Report confirmation */}
      {showReportConfirm && (
        <div className="absolute top-3 right-3 z-10 rounded-lg border bg-popover p-3 shadow-md text-sm">
          <p className="text-foreground mb-2">Report as inappropriate?</p>
          <div className="flex gap-2">
            <button
              onClick={handleReport}
              className="rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowReportConfirm(false)}
              className="rounded-md border px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <blockquote className="font-display text-lg leading-relaxed text-foreground italic mb-4">
        "{highlight.text}"
      </blockquote>

      {highlight.myNotes && (
        <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2 mb-4 border-l-2 border-primary/30">
          <span className="font-medium text-foreground/70">Note:</span> {highlight.myNotes}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div>
          <Link
            to={`/book/${encodeURIComponent(highlight.bookTitle)}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {highlight.bookTitle}
          </Link>
          <span className="text-sm text-muted-foreground"> — {highlight.author}</span>
        </div>
      </div>

      {/* Attribution */}
      <div className="mt-2">
        {highlight.source === "user" && highlight.displayName ? (
          <p className="text-xs text-muted-foreground">
            Added by {highlight.displayName}
          </p>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary/70">
            ✦ Glean Pick
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {highlight.tags.map((tag) => (
          <Link
            key={tag}
            to={`/topics/${encodeURIComponent(tag)}`}
            className="rounded-md bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent-foreground hover:bg-accent/25 transition-colors"
          >
            {tag}
          </Link>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setFeedback(feedback === "up" ? null : "up")}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
            feedback === "up"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
        >
          <ThumbsUp className="h-3.5 w-3.5" /> Helpful
        </button>
        <button
          onClick={() => setFeedback(feedback === "down" ? null : "down")}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
            feedback === "down"
              ? "bg-destructive/10 text-destructive"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
        >
          <ThumbsDown className="h-3.5 w-3.5" /> Not relevant
        </button>
        <button
          onClick={() => toggleSave(highlight.id)}
          className={`ml-auto flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
            saved
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
        >
          <Bookmark className={`h-3.5 w-3.5 ${saved ? "fill-current" : ""}`} />
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
};

export default HighlightCard;
