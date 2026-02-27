import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Search, Leaf } from "lucide-react";
import { Link } from "react-router-dom";

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
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-foreground leading-tight mb-4">
          Find wisdom for <br />
          <span className="text-primary">any challenge</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Describe what you're going through. We'll surface the most relevant insights from the world's best books.
        </p>
      </div>

      <form onSubmit={handleSearch} className="w-full max-w-xl mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What challenge are you facing today?"
            className="h-14 w-full rounded-xl border bg-card pl-12 pr-4 text-base font-body text-foreground placeholder:text-muted-foreground card-shadow focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>
      </form>

      <div className="flex flex-wrap justify-center gap-2 max-w-xl mb-16">
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
        Built for Glean — extract meaning from what you've read · Founder: Vardan Mathur · February 2026
      </footer>
    </div>
  );
};

export default Index;
