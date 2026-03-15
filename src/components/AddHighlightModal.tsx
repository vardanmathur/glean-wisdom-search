import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X } from "lucide-react";

interface AddHighlightModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ALL_TAGS = [
  "Ambition", "Anxiety", "Art", "Career", "Children", "Communication",
  "Death", "Decision Making", "Desires", "Expectations", "Family",
  "Forgiveness", "Friends", "Funny", "Habits", "Happiness", "Health",
  "Hiring", "Honesty", "Humility", "Influence", "Investing",
  "Leadership", "Learning", "Life", "Living with Others", "Love",
  "Luck", "Marriage", "Mental Health", "Mistakes", "Money",
  "Motivation", "Needs & Wants", "Negotiation", "Outcomes",
  "Overwhelmed", "People", "Perseverance", "Pithy", "Positivity",
  "Priorities", "Prioritization", "Procrastinating", "Productivity",
  "Purpose", "Quality", "Reading", "Relationships", "Resilience",
  "Stars", "Success", "Teaching", "Thinking", "Time Management",
  "Trust", "Willpower", "Work",
];

interface BookSuggestion {
  id: string;
  title: string;
  author: string;
}

const AddHighlightModal = ({ open, onOpenChange }: AddHighlightModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [highlightText, setHighlightText] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [personalNote, setPersonalNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Book autocomplete
  const [bookSuggestions, setBookSuggestions] = useState<BookSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedBookId) {
      setBookSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (bookTitle.trim().length < 2) {
      setBookSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("books")
        .select("id, title, author")
        .ilike("title", `%${bookTitle.trim()}%`)
        .limit(6);
      setBookSuggestions(data || []);
      setShowSuggestions(true);
    }, 250);
    return () => clearTimeout(timeout);
  }, [bookTitle, selectedBookId]);

  const selectBook = (book: BookSuggestion) => {
    setBookTitle(book.title);
    setBookAuthor(book.author);
    setSelectedBookId(book.id);
    setShowSuggestions(false);
  };

  const handleBookTitleChange = (val: string) => {
    setBookTitle(val);
    setSelectedBookId(null);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length < 5
          ? [...prev, tag]
          : prev
    );
  };

  const resetForm = () => {
    setBookTitle("");
    setBookAuthor("");
    setSelectedBookId(null);
    setHighlightText("");
    setSelectedTags([]);
    setVisibility("public");
    setPersonalNote("");
    setError(null);
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!bookTitle.trim() || !bookAuthor.trim() || !highlightText.trim()) {
      setError("Book title, author, and highlight text are required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let bookId = selectedBookId;

      if (!bookId) {
        const { data: newBook, error: bookErr } = await supabase
          .from("books")
          .insert({ title: bookTitle.trim(), author: bookAuthor.trim() })
          .select("id")
          .single();
        if (bookErr || !newBook) throw new Error("Failed to create book record.");
        bookId = newBook.id;
      }

      const { error: hlErr } = await supabase.from("highlights").insert({
        book_id: bookId,
        quote: highlightText.trim(),
        tags: selectedTags.length > 0 ? selectedTags : [],
        visibility,
        my_notes: personalNote.trim() || null,
        user_id: user.id,
        source: "user",
      });

      if (hlErr) throw new Error(hlErr.message);

      toast({ title: "Highlight added successfully" });
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const charCount = highlightText.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Add a Highlight</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Book Title */}
          <div className="relative">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Book Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={bookTitle}
              onChange={(e) => handleBookTitleChange(e.target.value)}
              onFocus={() => bookSuggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Start typing a book title..."
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            />
            {showSuggestions && bookSuggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md overflow-hidden"
              >
                {bookSuggestions.map((b) => (
                  <button
                    key={b.id}
                    onMouseDown={() => selectBook(b)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                  >
                    <span className="font-medium text-foreground">{b.title}</span>
                    <span className="text-muted-foreground"> — {b.author}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Author */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Author <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={bookAuthor}
              onChange={(e) => setBookAuthor(e.target.value)}
              placeholder="Author name"
              disabled={!!selectedBookId}
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all disabled:opacity-60"
            />
          </div>

          {/* Highlight Text */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Highlight Text <span className="text-destructive">*</span>
            </label>
            <textarea
              value={highlightText}
              onChange={(e) => setHighlightText(e.target.value)}
              placeholder="Paste or type the highlight..."
              rows={4}
              className="w-full rounded-lg border bg-card px-3 py-2 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-y"
            />
            <p className={`text-xs mt-1 ${charCount > 500 ? "text-destructive" : "text-muted-foreground"}`}>
              {charCount}/500 characters{charCount > 500 && " — consider shortening"}
            </p>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Tags <span className="text-muted-foreground font-normal">(up to 5)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
              {ALL_TAGS.map((tag) => {
                const selected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Visibility</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  visibility === "public"
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                Public
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  visibility === "private"
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                Private
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {visibility === "public"
                ? "Visible to all Glean users. Attributed to you."
                : "Only visible to you."}
            </p>
          </div>

          {/* Personal Note */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Personal Note <span className="text-muted-foreground font-normal">(always private)</span>
            </label>
            <input
              type="text"
              value={personalNote}
              onChange={(e) => setPersonalNote(e.target.value)}
              placeholder="Why does this highlight matter to you?"
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="h-11 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {submitting ? "Adding..." : "Add Highlight"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddHighlightModal;
