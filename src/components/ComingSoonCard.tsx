import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Check, Loader2, type LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useFeatureInterest, type InterestFeature } from "@/hooks/useFeatureInterest";

interface ComingSoonCardProps {
  feature: InterestFeature;
  title: string;
  description: string;
  icon: LucideIcon;
}

const ComingSoonCard = ({ feature, title, description, icon: Icon }: ComingSoonCardProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasInterest, register, loading } = useFeatureInterest();
  const [submitting, setSubmitting] = useState(false);

  const registered = hasInterest(feature);

  const handleClick = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (registered || submitting) return;
    setSubmitting(true);
    await register(feature);
    setSubmitting(false);
  };

  const buttonLabel = !user
    ? "Sign in to express interest"
    : registered
      ? "Interest noted — we'll be in touch ✓"
      : submitting
        ? "Saving…"
        : "I'm interested";

  return (
    <div className="relative rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-card p-5 card-shadow">
      <div className="flex items-start gap-3 mb-3">
        <div className="relative shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-card border border-primary/30 text-primary">
            <Lock className="h-3 w-3" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-primary/70 mb-1">
            Coming Soon
          </div>
          <h3 className="font-display text-lg font-semibold text-foreground leading-tight">
            {title}
          </h3>
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        {description}
      </p>

      <button
        type="button"
        onClick={handleClick}
        disabled={registered || submitting || loading}
        className={
          registered
            ? "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-4 py-2 text-sm font-medium text-primary cursor-default"
            : "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        }
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {registered && <Check className="h-4 w-4" />}
        {buttonLabel}
      </button>
    </div>
  );
};

export default ComingSoonCard;
