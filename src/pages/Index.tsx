import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Search, Leaf, Brain, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import InstallPrompt from "@/components/InstallPrompt";
import ComingSoonCard from "@/components/ComingSoonCard";
import { useQuery } from "@tanstack/react-query";
import { getGleanStats } from "@/lib/data";

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

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4">
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

      <section className="w-full max-w-2xl mb-12 rounded-xl bg-primary/5 border-l-2 border-primary/30 px-4 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Early Access
        </h3>
        <div className="flex flex-col divide-y divide-primary/10">
          <ComingSoonCard
            feature="think"
            title="Think!"
            description="A daily practice for your mind. Forge your thinking or stress-test your beliefs against the wisdom in your library."
            icon={Brain}
          />
          <ComingSoonCard
            feature="import"
            title="Import"
            description="Your Kindle highlights are a goldmine of your own past wisdom. Import brings them back to life."
            icon={Upload}
          />
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

      <footer className="mt-auto py-8 text-center text-xs text-muted-foreground">
        Built for Glean — extract meaning from what you've read · Built by: Vardan Mathur · February 2026
        <span className="mx-1">·</span>
        <Link to="/privacy" className="underline hover:text-foreground transition-colors">Privacy Policy</Link>
      </footer>
    </div>
  );
};

export default Index;
