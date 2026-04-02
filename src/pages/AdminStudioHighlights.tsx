import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, AlertCircle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const ADMIN_EMAIL = "vardan@gmail.com";
const PAGE_SIZE = 20;

type SortOption = "recent" | "no_notes" | "no_tags";

interface HighlightRow {
  id: string;
  quote: string;
  tags: string[] | null;
  my_notes: string | null;
  visibility: string | null;
  created_at: string;
  book_id: string | null;
  books: { title: string } | null;
}

const AdminStudioHighlights = () => {
  const { user, authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(0);
  const [filterBook, setFilterBook] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [filterNoNotes, setFilterNoNotes] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("recent");

  // Save feedback state: { [highlightId]: "success" | "error" }
  const [feedback, setFeedback] = useState<Record<string, "success" | "error">>({});

  useEffect(() => {
    if (!authLoading && (!user || user.email !== ADMIN_EMAIL)) {
      navigate("/", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Fetch all books for filter dropdown
  const { data: books } = useQuery({
    queryKey: ["studio-books"],
    queryFn: async () => {
      const { data } = await supabase.from("books").select("id, title").order("title");
      return data ?? [];
    },
    enabled: user?.email === ADMIN_EMAIL,
  });

  // Fetch all unique tags for filter dropdown
  const { data: allTags } = useQuery({
    queryKey: ["studio-tags"],
    queryFn: async () => {
      const { data } = await supabase.from("highlights").select("tags");
      const tagSet = new Set<string>();
      data?.forEach((h) => h.tags?.forEach((t: string) => tagSet.add(t)));
      return Array.from(tagSet).sort();
    },
    enabled: user?.email === ADMIN_EMAIL,
  });

  // Fetch highlights with pagination, filters, sorting
  const { data: highlightsData, isLoading } = useQuery({
    queryKey: ["studio-highlights", page, filterBook, filterTag, filterNoNotes, sortBy],
    queryFn: async () => {
      let query = supabase
        .from("highlights")
        .select("id, quote, tags, my_notes, visibility, created_at, book_id, books(title)", { count: "exact" });

      if (filterBook !== "all") {
        query = query.eq("book_id", filterBook);
      }
      if (filterTag !== "all") {
        query = query.contains("tags", [filterTag]);
      }
      if (filterNoNotes) {
        query = query.or("my_notes.is.null,my_notes.eq.");
      }

      switch (sortBy) {
        case "recent":
          query = query.order("created_at", { ascending: false });
          break;
        case "no_notes":
          query = query.order("my_notes", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false });
          break;
        case "no_tags":
          query = query.order("created_at", { ascending: false });
          break;
      }

      query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      let rows = (data as unknown as HighlightRow[]) ?? [];

      // Client-side sort for no_tags (empty arrays sort is tricky in SQL)
      if (sortBy === "no_tags") {
        rows = [...rows].sort((a, b) => (a.tags?.length ?? 0) - (b.tags?.length ?? 0));
      }

      return { rows, total: count ?? 0 };
    },
    enabled: user?.email === ADMIN_EMAIL,
  });

  const highlights = highlightsData?.rows ?? [];
  const totalCount = highlightsData?.total ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Mutation for updating a highlight
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase.from("highlights").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      showFeedback(id, "success");
      queryClient.invalidateQueries({ queryKey: ["studio-highlights"] });
    },
    onError: (_, { id }) => {
      showFeedback(id, "error");
    },
  });

  const showFeedback = (id: string, type: "success" | "error") => {
    setFeedback((prev) => ({ ...prev, [id]: type }));
    setTimeout(() => setFeedback((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    }), 2000);
  };

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filterBook, filterTag, filterNoNotes, sortBy]);

  if (authLoading || !user || user.email !== ADMIN_EMAIL) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <h1 className="font-display text-3xl font-semibold text-foreground mb-2">Glean Studio</h1>
      <p className="text-muted-foreground mb-6">Curate highlights — edit tags, notes, and visibility.</p>

      {/* Filter & Sort Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-lg border bg-card">
        <Select value={filterBook} onValueChange={setFilterBook}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by book" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All books</SelectItem>
            {books?.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTag} onValueChange={setFilterTag}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {allTags?.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={filterNoNotes} onCheckedChange={(v) => setFilterNoNotes(v === true)} />
          No notes only
        </label>

        <Separator orientation="vertical" className="h-8 hidden sm:block" />

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most recent</SelectItem>
            <SelectItem value="no_notes">No notes first</SelectItem>
            <SelectItem value="no_tags">No tags first</SelectItem>
          </SelectContent>
        </Select>

        <span className="ml-auto text-xs text-muted-foreground">{totalCount} highlights</span>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium text-muted-foreground w-[35%]">Quote</th>
              <th className="text-left p-3 font-medium text-muted-foreground w-[15%]">Book</th>
              <th className="text-left p-3 font-medium text-muted-foreground w-[20%]">Tags</th>
              <th className="text-left p-3 font-medium text-muted-foreground w-[15%]">Notes</th>
              <th className="text-left p-3 font-medium text-muted-foreground w-[10%]">Visibility</th>
              <th className="text-center p-3 font-medium text-muted-foreground w-[5%]"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td colSpan={6} className="p-3"><div className="h-5 bg-muted/50 rounded animate-pulse" /></td>
                </tr>
              ))
            ) : highlights.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">No highlights found.</td>
              </tr>
            ) : (
              highlights.map((h) => (
                <HighlightRowEditor
                  key={h.id}
                  highlight={h}
                  allTags={allTags ?? []}
                  onSave={(id, updates) => updateMutation.mutate({ id, updates })}
                  feedback={feedback[h.id]}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
};

// --- Inline row editor ---

interface HighlightRowEditorProps {
  highlight: HighlightRow;
  allTags: string[];
  onSave: (id: string, updates: Record<string, unknown>) => void;
  feedback?: "success" | "error";
}

const HighlightRowEditor = ({ highlight, allTags, onSave, feedback }: HighlightRowEditorProps) => {
  const [editingTags, setEditingTags] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [tags, setTags] = useState<string[]>(highlight.tags ?? []);
  const [notes, setNotes] = useState(highlight.my_notes ?? "");
  const [tagInput, setTagInput] = useState("");
  const tagsRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);

  // Sync when highlight data changes
  useEffect(() => {
    setTags(highlight.tags ?? []);
    setNotes(highlight.my_notes ?? "");
  }, [highlight.tags, highlight.my_notes]);

  // Click outside handlers
  useEffect(() => {
    if (!editingTags) return;
    const handler = (e: MouseEvent) => {
      if (tagsRef.current && !tagsRef.current.contains(e.target as Node)) {
        handleTagsSave();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editingTags, tags]);

  useEffect(() => {
    if (!editingNotes) return;
    const handler = (e: MouseEvent) => {
      if (notesRef.current && !notesRef.current.contains(e.target as Node)) {
        handleNotesSave();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editingNotes, notes]);

  const handleTagsSave = () => {
    setEditingTags(false);
    const sorted = [...tags].sort();
    const original = [...(highlight.tags ?? [])].sort();
    if (JSON.stringify(sorted) !== JSON.stringify(original)) {
      onSave(highlight.id, { tags });
    }
  };

  const handleNotesSave = () => {
    setEditingNotes(false);
    if (notes !== (highlight.my_notes ?? "")) {
      onSave(highlight.id, { my_notes: notes || null });
    }
  };

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const toggleVisibility = () => {
    const newVis = highlight.visibility === "public" ? "private" : "public";
    onSave(highlight.id, { visibility: newVis });
  };

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + "…" : text;

  const filteredSuggestions = allTags.filter(
    (t) => !tags.includes(t) && t.toLowerCase().includes(tagInput.toLowerCase())
  ).slice(0, 8);

  return (
    <tr className="border-b hover:bg-muted/30 transition-colors">
      {/* Quote */}
      <td className="p-3 text-foreground leading-relaxed">
        {truncate(highlight.quote, 100)}
      </td>

      {/* Book */}
      <td className="p-3 text-muted-foreground">
        {highlight.books?.title ?? "—"}
      </td>

      {/* Tags */}
      <td className="p-3" ref={tagsRef}>
        {editingTags ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeTag(tag)}>
                  {tag}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
            <div className="relative">
              <input
                autoFocus
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder="Add tag..."
                className="h-7 w-full rounded border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              {tagInput && filteredSuggestions.length > 0 && (
                <div className="absolute z-10 top-full left-0 mt-1 w-full bg-card border rounded shadow-md max-h-32 overflow-y-auto">
                  {filteredSuggestions.map((s) => (
                    <button
                      key={s}
                      className="block w-full text-left px-2 py-1 text-xs hover:bg-muted transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addTag(s);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className="flex flex-wrap gap-1 cursor-pointer min-h-[28px] rounded p-1 hover:bg-muted/50 transition-colors"
            onClick={() => setEditingTags(true)}
          >
            {tags.length > 0 ? (
              tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground/60 italic">click to add tags</span>
            )}
          </div>
        )}
      </td>

      {/* Notes */}
      <td className="p-3" ref={notesRef}>
        {editingNotes ? (
          <textarea
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
          />
        ) : (
          <div
            className="cursor-pointer min-h-[28px] rounded p-1 hover:bg-muted/50 transition-colors text-xs"
            onClick={() => setEditingNotes(true)}
          >
            {highlight.my_notes ? (
              <span className="text-muted-foreground">{truncate(highlight.my_notes, 50)}</span>
            ) : (
              <span className="text-muted-foreground/60 italic">click to add notes</span>
            )}
          </div>
        )}
      </td>

      {/* Visibility */}
      <td className="p-3">
        <Button
          variant={highlight.visibility === "public" ? "outline" : "secondary"}
          size="sm"
          className="text-xs h-7"
          onClick={toggleVisibility}
        >
          {highlight.visibility === "public" ? "Public" : "Private"}
        </Button>
      </td>

      {/* Feedback */}
      <td className="p-3 text-center">
        {feedback === "success" && <Check className="h-4 w-4 text-green-500 mx-auto" />}
        {feedback === "error" && <AlertCircle className="h-4 w-4 text-destructive mx-auto" />}
      </td>
    </tr>
  );
};

export default AdminStudioHighlights;
