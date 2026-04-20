import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Loader2, type LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useFeatureInterest, type InterestFeature } from "@/hooks/useFeatureInterest";

interface ComingSoonCardProps {
  feature: InterestFeature;
  title: string;
  description: string;
  icon?: LucideIcon;
}

const ComingSoonCard = ({ feature, title, description }: ComingSoonCardProps) => {
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

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-foreground/70">
        <Lock className="h-3 w-3" />
        Coming soon · {title}
      </span>
      <span className="text-muted-foreground">{description}</span>
      {registered ? (
        <span className="text-primary/80 text-xs">Interest noted ✓</span>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          disabled={submitting || loading}
          className="inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline underline-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
          {!user ? "Sign in to express interest" : "I'm interested"}
        </button>
      )}
    </div>
  );
};

export default ComingSoonCard;
