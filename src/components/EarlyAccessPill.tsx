import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/context/AuthContext";
import { useFeatureInterest, type InterestFeature } from "@/hooks/useFeatureInterest";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const AVAILABLE_FEATURES: InterestFeature[] = ["think", "import"];
const DISMISS_KEY = "glean_early_access_pill_dismissed";

const EarlyAccessPill = () => {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { hasInterest, loading: interestLoading } = useFeatureInterest();
  const { hasPermission, loading: permsLoading } = usePermissions();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  if (!isMobile || !user || isAdmin || adminLoading || interestLoading || permsLoading || dismissed) {
    return null;
  }

  // Hide if user already has permission for all features (Early Access section is hidden too)
  const hasAllPerms = AVAILABLE_FEATURES.every((f) => hasPermission(f));
  if (hasAllPerms) return null;

  // Show only if there's at least one feature they haven't yet requested
  const hasUnrequested = AVAILABLE_FEATURES.some((f) => !hasInterest(f));
  if (!hasUnrequested) return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const handleClick = () => {
    const el = document.getElementById("early-access");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
    >
      <div
        className={`pointer-events-auto transition-all duration-300 ease-out ${
          mounted ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center gap-2 rounded-full bg-primary text-primary-foreground pl-4 pr-2 py-2.5 shadow-lg shadow-primary/30 active:scale-[0.98] transition-transform"
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">
            Early Access — Think! and Import available
          </span>
          <span
            role="button"
            tabIndex={0}
            aria-label="Dismiss"
            onClick={handleDismiss}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleDismiss(e as unknown as React.MouseEvent);
              }
            }}
            className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-primary-foreground/15 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>
    </div>
  );
};

export default EarlyAccessPill;
