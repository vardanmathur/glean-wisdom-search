import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Search, Leaf, Brain, Upload, X, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import InstallPrompt from "@/components/InstallPrompt";
import ComingSoonCard from "@/components/ComingSoonCard";
import EarlyAccessPill from "@/components/EarlyAccessPill";
import { useQuery } from "@tanstack/react-query";
import { getGleanStats } from "@/lib/data";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

const ADMIN_EMAIL = "vardan@gmail.com";

const FEATURE_META: Record<string, { label: string; route: string }> = {
  think: { label: "Think!", route: "/think" },
  import: { label: "Import", route: "/studio" },
};

const exampleQueries = [
  "I'm struggling to motivate my team",
  "I feel stuck in my career",
  "I can't stop procrastinating",
  "I'm anxious about a big decision",
];

const featuredTopics = [
  "Leadership", "Habits", "Purpose", "Success", "Relationships",
  "Anxiety", "Motivation", "Productivity", "Humility", "Happiness",
  "Investing", "Resilience",
];

const Index = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { user } = useAuth();
  const { hasPermission, loading: permsLoading } = usePermissions();
  const { data: stats } = useQuery({
    queryKey: ["glean-stats"],
    queryFn: getGleanStats,
  });

  const isAdmin = user?.email === ADMIN_EMAIL;
  const hasThink = !!user && !isAdmin && hasPermission("think");
  const hasImport = !!user && !isAdmin && hasPermission("import");
  const hideEarlyAccess = !isAdmin && hasThink && hasImport;

  // What's new banner — one per newly granted feature, dismissible per-feature
  const [bannerFeatures, setBannerFeatures] = useState<string[]>([]);
  useEffect(() => {
    if (!user || isAdmin || permsLoading) return;
    const granted: string[] = [];
    if (hasThink) granted.push("think");
    if (hasImport) granted.push("import");
    const visible = granted.filter(
      (f) => !localStorage.getItem(`glean_whats_new_dismissed_${f}`)
    );
    setBannerFeatures(visible);
  }, [user, isAdmin, permsLoading, hasThink, hasImport]);

  const dismissBanner = (feature: string) => {
    localStorage.setItem(`glean_whats_new_dismissed_${feature}`, "1");
    setBannerFeatures((prev) => prev.filter((f) => f !== feature));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleChipClick = (text: string) => {
    setQuery(text);
    navigate(`/search?q=${encodeURIComponent(text)}`);
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center px-4 pt-6">
      {bannerFeatures.length > 0 && (
        <div className="w-full max-w-2xl mb-6 flex flex-col gap-2">
          {bannerFeatures.map((f) => {
            const meta = FEATURE_META[f];
            if (!meta) return null;
            return (
              <div
                key={f}
                className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
              >
                <Link
                  to={meta.route}
                  className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors group"
                >
                  <span aria-hidden>🎉</span>
                  <span>
                    You now have access to{" "}
                    <span className="font-semibold">{meta.label}</span> —
                  </span>
                  <span className="font-medium inline-flex items-center gap-1">
                    Try it now
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => dismissBanner(f)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-1 flex-col items-center justify-center w-full">
      <div className="w-full max-w-2xl text-center mb-12">
        <div className="inline-flex items-center gap-2 text-primary mb-6">
          <Leaf className="h-8 w-8" />
        </div>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-foreground leading-tight mb-4 text-balance">
          What's on <span className="text-primary">your mind?</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Describe your challenge — I'll surface relevant wisdom <br />
          and help you think it through.
        </p>

        {stats && (
          <p className="text-sm text-muted-foreground mt-4">
            Curated from {stats.bookCount} books · {stats.highlightCount} highlights
          </p>
        )}
      </div>

      <form onSubmit={handleSearch} className="w-full max-w-xl mb-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What can I answer for you today today?"
            className="h-14 w-full rounded-xl border bg-card pl-12 pr-4 text-base font-body text-foreground placeholder:text-muted-foreground card-shadow focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>
      </form>

      <div className="flex flex-wrap justify-center gap-2 max-w-xl mb-8">
        {exampleQueries.map((q) => (
          <button
            key={q}
            onClick={() => handleChipClick(q)}
            className="rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all card-shadow"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-3 mb-10">
        <InstallPrompt />
      </div>

      {!hideEarlyAccess && (
        <section id="early-access" className="w-full max-w-2xl mb-12 rounded-xl bg-primary/5 border-l-2 border-primary/30 px-4 py-3 scroll-mt-20">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Early Access
          </h3>
          <div className="flex flex-col divide-y divide-primary/10">
            <ComingSoonCard
              feature="think"
              title="Think!"
              description="A daily practice for your mind. Forge your thinking or stress-test your beliefs against the wisdom in your library."
              icon={Brain}
              featureRoute="/think"
            />
            <ComingSoonCard
              feature="import"
              title="Import"
              description="Your Kindle highlights are a goldmine of your own past wisdom. Import brings them back to life."
              icon={Upload}
              featureRoute="/import"
            />
          </div>
        </section>
      )}

      <div className="w-full max-w-2xl text-center">
        <h2 className="font-display text-2xl text-foreground mb-6">Browse by Topic</h2>
        <div className="flex flex-wrap justify-center gap-2">
          {featuredTopics.map((topic) => (
            <Link
              key={topic}
              to={`/topics/${encodeURIComponent(topic)}`}
              className="rounded-full bg-primary/8 border border-primary/15 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/15 transition-colors"
            >
              {topic}
            </Link>
          ))}
        </div>
      </div>
      </div>

      <footer className="mt-auto py-8 text-center text-xs text-muted-foreground">
        Built for Glean — extract meaning from what you've read · Built by: Vardan Mathur · February 2026
        <span className="mx-1">·</span>
        <Link to="/privacy" className="underline hover:text-foreground transition-colors">Privacy Policy</Link>
      </footer>
      <EarlyAccessPill />
    </div>
  );
};

export default Index;
