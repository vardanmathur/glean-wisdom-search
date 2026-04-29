import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, Loader2, ArrowRight, type LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useFeatureInterest, type InterestFeature } from "@/hooks/useFeatureInterest";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface ComingSoonCardProps {
  feature: InterestFeature;
  title: string;
  description: string;
  icon?: LucideIcon;
  featureRoute: string;
}

const ComingSoonCard = ({
  feature,
  title,
  description,
  icon: Icon,
  featureRoute,
}: ComingSoonCardProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasInterest, register, loading } = useFeatureInterest();
  const { hasPermission, loading: permsLoading } = usePermissions();
  const { isAdmin } = useIsAdmin();
  const [submitting, setSubmitting] = useState(false);

  const granted = !!user && !isAdmin && hasPermission(feature);
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

  // Granted user — clean single-line teal entry point (no lock)
  if (granted) {
    // For Import: route directly to the user-scoped Studio instead of the importer landing.
    const isImport = feature === "import";
    const target = isImport ? "/studio" : featureRoute;
    const label = isImport ? "My Studio" : `${title} is unlocked — Try it now`;
    return (
      <Link
        to={target}
        className="flex items-center gap-2 py-2 text-sm text-primary hover:text-primary/80 transition-colors group"
      >
        <span aria-hidden>🎉</span>
        {Icon && <Icon className="h-4 w-4" strokeWidth={2} />}
        <span className="font-medium">{label}</span>
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted-foreground py-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-foreground/70">
        <Lock className="h-3 w-3" />
        {Icon && <Icon className="h-4 w-4 text-primary" strokeWidth={2} />}
        {title}
      </span>
      <span className="text-muted-foreground">{description}</span>

      {isAdmin ? (
        <Link
          to="/admin/permissions"
          className="inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline underline-offset-2 transition-colors"
        >
          Manage access →
        </Link>
      ) : registered ? (
        <span className="text-primary/80 text-xs">Access requested ✓</span>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          disabled={submitting || loading || permsLoading}
          className="inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline underline-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
          {!user ? "Sign in to request access" : "Request Early Access"}
        </button>
      )}
    </div>
  );
};

export default ComingSoonCard;
