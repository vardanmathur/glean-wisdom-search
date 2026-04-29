import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Highlight, getAmazonUrl } from "@/lib/data";
import { useAuth } from "@/context/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  useIsHighlightSaved,
  useToggleSave,
  useHighlightSaveCount,
} from "@/hooks/useHighlightSaves";
import {
  useIsThumbsUp,
  useIsThumbsDown,
  useToggleThumbsUp,
  useToggleThumbsDown,
} from "@/hooks/useHighlightFeedback";
import { Bookmark, ThumbsUp, ThumbsDown, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface HighlightCardProps {
  highlight: Highlight;
  index?: number;
  /** Toggle to reveal the per-card save count. Hidden by default until we want to expose it. */
  showSaveCount?: boolean;
}

const HighlightCard = ({ highlight, index = 0, showSaveCount = false }: HighlightCardProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { toast } = useToast();

  const saved = useIsHighlightSaved(highlight.id);
  const toggleSave = useToggleSave();
  const isUp = useIsThumbsUp(highlight.id);
  const isDown = useIsThumbsDown(highlight.id);
  const toggleUp = useToggleThumbsUp();
  const toggleDown = useToggleThumbsDown();

  // Only fetch the count when we actually render it
  const { data: saveCount } = useHighlightSaveCount(highlight.id, showSaveCount);

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

  const handleSaveClick = () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    toggleSave.mutate(highlight.id);
  };

  const handleThumbsUpClick = () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    toggleUp.mutate(highlight.id);
  };

  const handleThumbsDownClick = () => {
    toggleDown.mutate(highlight.id);
  };

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
      {/* Persistent action cluster — top right, always visible (mobile + desktop) */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        {/* Save — always visible */}
        <button
          onClick={handleSaveClick}
          className={`p-1.5 rounded-md transition-colors ${
            saved
              ? "text-primary"
              : "text-muted-foreground/60 hover:text-primary hover:bg-secondary"
          }`}
          title={saved ? "Saved" : "Save highlight"}
          aria-label={saved ? "Saved" : "Save highlight"}
        >
          <Bookmark className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
        </button>

        {/* Hidden save count — toggle showSaveCount prop to reveal */}
        <span className={showSaveCount ? "text-xs text-muted-foreground tabular-nums" : "hidden"}>
          {saveCount ?? 0}
        </span>

        {/* Thumbs up — always visible to authenticated users (redirects others to /auth) */}
        <button
          onClick={handleThumbsUpClick}
          className={`p-1.5 rounded-md transition-colors ${
            isUp
              ? "text-primary"
              : "text-muted-foreground/60 hover:text-primary hover:bg-secondary"
          }`}
          title={isUp ? "You marked this helpful" : "Mark as helpful"}
          aria-label="Mark as helpful"
        >
          <ThumbsUp className={`h-4 w-4 ${isUp ? "fill-current" : ""}`} />
        </button>

        {/* Thumbs down — admin only, always visible */}
        {isAdmin && (
          <button
            onClick={handleThumbsDownClick}
            className={`p-1.5 rounded-md transition-colors ${
              isDown
                ? "text-destructive"
                : "text-muted-foreground/60 hover:text-destructive hover:bg-secondary"
            }`}
            title={isDown ? "Thumbs down active" : "Thumbs down (admin)"}
            aria-label="Thumbs down"
          >
            <ThumbsDown className={`h-4 w-4 ${isDown ? "fill-current" : ""}`} />
          </button>
        )}

        {/* Report — hover-only */}
        {canReport && !reported && (
          <button
            onClick={() => setShowReportConfirm(true)}
            className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
            title="Report highlight"
            aria-label="Report highlight"
          >
            <Flag className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Report confirmation */}
      {showReportConfirm && (
        <div className="absolute top-12 right-3 z-10 rounded-lg border bg-popover p-3 shadow-md text-sm">
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

      <div className="flex gap-4 pr-20">
        {/* Book cover thumbnail — links to Amazon affiliate */}
        <a
          href={getAmazonUrl(highlight.bookTitle, highlight.author)}
          target="_blank"
          rel="noopener noreferrer"
          title="Find on Amazon"
          className="flex-shrink-0 hover:opacity-90 transition-opacity"
        >
          {highlight.coverImageUrl ? (
            <img
              src={highlight.coverImageUrl}
              alt={highlight.bookTitle}
              className="h-[70px] w-[53px] rounded-md object-cover"
            />
          ) : (
            <div className="h-[70px] w-[53px] rounded-md bg-primary/15 flex items-center justify-center">
              <span className="text-lg font-semibold text-primary">
                {highlight.bookTitle?.charAt(0) || "?"}
              </span>
            </div>
          )}
        </a>

        <div className="flex-1 min-w-0">
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

          <div className="mt-2">
            {highlight.source === "user" && displayName ? (
              <p className="text-xs text-muted-foreground">
                Added by {displayName}
              </p>
            ) : highlight.source === "user" ? (
              <p className="text-xs text-muted-foreground">Added by a reader</p>
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
        </div>
      </div>
    </div>
  );
};

export default HighlightCard;
