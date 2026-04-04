import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, AlertCircle, ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

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
  const [feedback, setFeedback] = useState<Record<string, "success" | "error">>({});
  const [editingHighlight, setEditingHighlight] = useState<HighlightRow | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.email !== ADMIN_EMAIL)) {
      navigate("/", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const { data: books } = useQuery({
    queryKey: ["studio-books"],
    queryFn: async () => {
      const { data } = await supabase.from("books").select("id, title").order("title");
      return data ?? [];
    },
    enabled: user?.email === ADMIN_EMAIL,
  });

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

  const { data: highlightsData, isLoading } = useQuery({
    queryKey: ["studio-highlights", page, filterBook, filterTag, filterNoNotes, sortBy],
    queryFn: async () => {
      let query = supabase
        .from("highlights")
        .select("id, quote, tags, my_notes, visibility, created_at, book_id, books(title)", { count: "exact" });

      if (filterBook !== "all") query = query.eq("book_id", filterBook);
      if (filterTag !== "all") query = query.contains("tags", [filterTag]);
      if (filterNoNotes) query = query.or("my_notes.is.null,my_notes.eq.");

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

  useEffect(() => {
    setPage(0);
  }, [filterBook, filterTag, filterNoNotes, sortBy]);

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + "…" : text;

  if (authLoading || !user || user.email !== ADMIN_EMAIL) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <h1 className="font-display text-3xl font-semibold text-foreground mb-2">Glean Studio</h1>
      <p className="text-muted-foreground mb-6">Curate highlights — edit tags, notes, and visibility.</p>

      {/* Filter & Sort Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-lg border bg-card">
        <Select value={filterBook} onValueChange={setFilterBook}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter by book" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All books</SelectItem>
            {books?.map((b) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterTag} onValueChange={setFilterTag}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by tag" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {allTags?.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={filterNoNotes} onCheckedChange={(v) => setFilterNoNotes(v === true)} />
          No notes only
        </label>

        <Separator orientation="vertical" className="h-8 hidden sm:block" />

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Sort by" /></SelectTrigger>
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
                <tr key={h.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3 text-foreground leading-relaxed">{truncate(h.quote, 100)}</td>
                  <td className="p-3 text-muted-foreground">{h.books?.title ?? "—"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {(h.tags ?? []).length > 0
                        ? h.tags!.map((tag) => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)
                        : <span className="text-xs text-muted-foreground/60 italic">no tags</span>}
                    </div>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {h.my_notes ? truncate(h.my_notes, 50) : <span className="text-muted-foreground/60 italic">no notes</span>}
                  </td>
                  <td className="p-3">
                    <Badge variant={h.visibility === "public" ? "outline" : "secondary"} className="text-xs">
                      {h.visibility === "public" ? "Public" : "Private"}
                    </Badge>
                  </td>
                  <td className="p-3 text-center">
                    {feedback[h.id] === "success" ? (
                      <Check className="h-4 w-4 text-primary mx-auto" />
                    ) : feedback[h.id] === "error" ? (
                      <AlertCircle className="h-4 w-4 text-destructive mx-auto" />
                    ) : (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingHighlight(h)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
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
          <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Edit Panel */}
      <EditPanel
        highlight={editingHighlight}
        allTags={allTags ?? []}
        onClose={() => setEditingHighlight(null)}
        onSave={(id, updates) => {
          updateMutation.mutate({ id, updates }, {
            onSuccess: () => setEditingHighlight(null),
          });
        }}
        saving={updateMutation.isPending}
      />
    </div>
  );
};

// --- Slide-out edit panel ---

interface EditPanelProps {
  highlight: HighlightRow | null;
  allTags: string[];
  onClose: () => void;
  onSave: (id: string, updates: Record<string, unknown>) => void;
  saving: boolean;
}

const EditPanel = ({ highlight, allTags, onClose, onSave, saving }: EditPanelProps) => {
  const [quote, setQuote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (highlight) {
      setQuote(highlight.quote);
      setTags(highlight.tags ?? []);
      setNotes(highlight.my_notes ?? "");
      setVisibility(highlight.visibility ?? "public");
      setTagInput("");
    }
  }, [highlight]);

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const filteredSuggestions = allTags
    .filter((t) => !tags.includes(t) && t.toLowerCase().includes(tagInput.toLowerCase()))
    .slice(0, 8);

  const handleSave = () => {
    if (!highlight) return;
    onSave(highlight.id, {
      quote,
      tags,
      my_notes: notes || null,
      visibility,
    });
  };

  return (
    <Sheet open={!!highlight} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Highlight</SheetTitle>
          <SheetDescription className="text-xs">
            {highlight?.books?.title ?? "Unknown book"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Quote */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Quote</label>
            <Textarea
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              rows={6}
              className="text-sm leading-relaxed"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeTag(tag)}>
                  {tag}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
            <div className="relative">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder="Add tag…"
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              {tagInput && filteredSuggestions.length > 0 && (
                <div className="absolute z-10 top-full left-0 mt-1 w-full bg-card border rounded-md shadow-md max-h-40 overflow-y-auto">
                  {filteredSuggestions.map((s) => (
                    <button
                      key={s}
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                      onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Personal Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Add your notes…"
              className="text-sm"
            />
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Visibility</label>
            <div className="flex gap-2">
              <Button
                variant={visibility === "public" ? "default" : "outline"}
                size="sm"
                onClick={() => setVisibility("public")}
              >
                Public
              </Button>
              <Button
                variant={visibility === "private" ? "default" : "outline"}
                size="sm"
                onClick={() => setVisibility("private")}
              >
                Private
              </Button>
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AdminStudioHighlights;
