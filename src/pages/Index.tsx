import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Search, Leaf, Brain, Upload, ArrowRight, Sparkles, Loader2, Shuffle } from "lucide-react";
import { Link } from "react-router-dom";
import InstallPrompt from "@/components/InstallPrompt";
import HighlightCard from "@/components/HighlightCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { getGleanStats, type Highlight } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

const exampleQueries = [
  "I'm struggling to motivate my team",
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
  const { data: stats } = useQuery({
    queryKey: ["glean-stats"],
    queryFn: getGleanStats,
  });

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

  const [sparkOpen, setSparkOpen] = useState(false);
  const [sparkLoading, setSparkLoading] = useState(false);
  const [sparkHighlight, setSparkHighlight] = useState<Highlight | null>(null);
  const [sparkError, setSparkError] = useState(false);

  const handleInspireMe = async () => {
    setSparkOpen(true);
    setSparkLoading(true);
    setSparkError(false);
    setSparkHighlight(null);
    try {
      const { count, error: countErr } = await supabase
        .from("highlights")
        .select("id", { count: "exact", head: true })
        .eq("visibility", "public");
      if (countErr || !count) throw countErr ?? new Error("no highlights");
      const offset = Math.floor(Math.random() * count);
      const { data, error } = await supabase
        .from("highlights")
        .select(
          "id, quote, tags, my_notes, source, visibility, user_id, book_id, books(title, author, cover_image_url), user_profiles(display_name)"
        )
        .eq("visibility", "public")
        .range(offset, offset)
        .single();
      if (error || !data) throw error ?? new Error("no row");
      const row: any = data;
      setSparkHighlight({
        id: row.id,
        text: row.quote,
        bookTitle: row.books?.title || "Unknown",
        author: row.books?.author || "Unknown",
        tags: row.tags || [],
        bookId: row.book_id,
        coverImageUrl: row.books?.cover_image_url,
        myNotes: row.my_notes || undefined,
        source: row.source || "curated",
        userId: row.user_id || undefined,
        displayName: row.user_profiles?.display_name || undefined,
        visibility: (row.visibility as "public" | "private") || undefined,
      });
    } catch {
      setSparkError(true);
    } finally {
      setSparkLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center px-4 pt-6">
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
            placeholder="What can I answer for you today?"
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
        <button
          onClick={handleInspireMe}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-all card-shadow"
        >
          <Sparkles className="h-4 w-4" />
          Inspire Me
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-3 mb-10">
        <InstallPrompt />
      </div>

      <section id="early-access" className="w-full max-w-2xl mb-12 rounded-xl bg-primary/5 border-l-2 border-primary/30 px-4 py-3 scroll-mt-20">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Early Access
        </h3>
        <div className="flex flex-col divide-y divide-primary/10">
          {[
            { icon: Brain, title: "Think!", description: "A daily practice for your mind. Forge your thinking or stress-test your beliefs against the wisdom in your library.", route: "/think", cta: "Try Think!" },
            { icon: Upload, title: "Import", description: "Your Kindle highlights are a goldmine of your own past wisdom. Import brings them back to life.", route: "/import", cta: "Go to Import" },
          ].map(({ icon: Icon, title, description, route, cta }) => (
            <div key={title} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted-foreground py-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-foreground/70">
                <Icon className="h-4 w-4 text-primary" strokeWidth={2} />
                {title}
              </span>
              <span className="text-muted-foreground">{description}</span>
              {user ? (
                <Link to={route} className="inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline underline-offset-2 transition-colors">
                  {cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate("/auth")}
                  className="inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline underline-offset-2 transition-colors"
                >
                  Sign in to try
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

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
      <Dialog open={sparkOpen} onOpenChange={setSparkOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="font-display">Your daily spark</DialogTitle>
          <button
            onClick={handleInspireMe}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 transition-all mr-6"
            title="Shuffle"
          >
            <Shuffle className="h-4 w-4" />
            Shuffle
          </button>
        </DialogHeader>
          {sparkLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {!sparkLoading && sparkError && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">Couldn't load a highlight. Try again.</p>
              <button
                onClick={handleInspireMe}
                className="rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-all"
              >
                Retry
              </button>
            </div>
          )}
          {!sparkLoading && !sparkError && sparkHighlight && (
            <HighlightCard highlight={sparkHighlight} index={0} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
