import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check, AlertCircle, ChevronLeft, ChevronRight, Pencil, X,
  Search, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Loader2, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import StudioAddHighlightModal from "@/components/studio/AddHighlightModal";

const ADMIN_EMAIL = "vardan@gmail.com";
const PAGE_SIZE = 20;

type SortOption = "recent" | "oldest" | "no_notes" | "no_tags";
type ColumnSortState = { col: string; dir: "asc" | "desc" } | null;

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

interface SortableHeaderProps {
  label: string;
  colKey: string;
  columnSort: ColumnSortState;
  onSort: (col: string) => void;
  className?: string;
}

const SortableHeader = ({ label, colKey, columnSort, onSort, className }: SortableHeaderProps) => {
  const active = columnSort?.col === colKey;
  const Icon = active ? (columnSort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className={`text-left p-3 font-medium cursor-pointer select-none hover:bg-muted/70 transition-colors ${active ? "text-primary" : "text-muted-foreground"} ${className ?? ""}`}
      onClick={() => onSort(colKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className="h-3.5 w-3.5" />
      </span>
    </th>
  );
};

const UserStudio = () => {
  const { user, authLoading } = useAuth();
  const { hasPermission, loading: permsLoading } = usePermissions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isAdmin = user?.email === ADMIN_EMAIL;
  const allowed = isAdmin || hasPermission("import");

  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [columnSort, setColumnSort] = useState<ColumnSortState>(null);
  const [feedback, setFeedback] = useState<Record<string, "success" | "error">>({});
  const [editingHighlight, setEditingHighlight] = useState<HighlightRow | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!authLoading && !permsLoading && !allowed) {
      navigate("/", { replace: true });
    }
  }, [authLoading, permsLoading, allowed, navigate]);

  const enabled = !!user && allowed;

  const { data: allTags } = useQuery({
    queryKey: ["user-studio-tags"],
    queryFn: async () => {
      const { data } = await supabase.from("highlights").select("tags");
      const set = new Set<string>();
      data?.forEach((h) => h.tags?.forEach((t: string) => set.add(t)));
      return Array.from(set).sort();
    },
    enabled,
  });

  const { data: highlightsData, isLoading } = useQuery({
    queryKey: ["user-studio-highlights", user?.id, page, sortBy, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("highlights")
        .select("id, quote, tags, my_notes, visibility, created_at, book_id, books(title)", { count: "exact" })
        .eq("highlights.user_id", user!.id)
        .eq("highlights.visibility", "private");

      const trimmed = searchQuery.trim();
      if (trimmed) {
        const escaped = trimmed.replace(/[,()]/g, " ");
        const pattern = `%${escaped}%`;
        const { data: matchingBooks } = await supabase
          .from("books")
          .select("id")
          .ilike("books.title", pattern);
        const bookIds = (matchingBooks ?? []).map((b) => b.id);
        const orParts = [`quote.ilike.${pattern}`, `my_notes.ilike.${pattern}`];
        if (bookIds.length > 0) orParts.push(`book_id.in.(${bookIds.join(",")})`);
        query = query.or(orParts.join(","));
      }

      switch (sortBy) {
        case "recent": query = query.order("created_at", { ascending: false }); break;
        case "oldest": query = query.order("created_at", { ascending: true }); break;
        case "no_notes": query = query.order("my_notes", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false }); break;
        case "no_tags": query = query.order("created_at", { ascending: false }); break;
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
    enabled,
  });

  const applyColumnSort = (rows: HighlightRow[]): HighlightRow[] => {
    if (!columnSort) return rows;
    const { col, dir } = columnSort;
    const mult = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (col) {
        case "quote": return mult * a.quote.localeCompare(b.quote);
        case "book": return mult * (a.books?.title ?? "").localeCompare(b.books?.title ?? "");
        case "tags": return mult * ((a.tags?.length ?? 0) - (b.tags?.length ?? 0));
        case "notes": {
          if (!a.my_notes && !b.my_notes) return 0;
          if (!a.my_notes) return 1;
          if (!b.my_notes) return -1;
          return mult * a.my_notes.localeCompare(b.my_notes);
        }
        case "visibility": return mult * (a.visibility ?? "").localeCompare(b.visibility ?? "");
        default: return 0;
      }
    });
  };

  const highlights = useMemo(() => applyColumnSort(highlightsData?.rows ?? []), [highlightsData, columnSort]);
  const totalCount = highlightsData?.total ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleColumnSort = (col: string) => {
    setColumnSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "asc" };
      if (prev.dir === "asc") return { col, dir: "desc" };
      return null;
    });
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("highlights")
        .update(updates)
        .eq("highlights.id", id)
        .eq("highlights.user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      showFeedback(id, "success");
      queryClient.invalidateQueries({ queryKey: ["user-studio-highlights"] });
    },
    onError: (_, { id }) => showFeedback(id, "error"),
  });

  const showFeedback = (id: string, type: "success" | "error") => {
    setFeedback((prev) => ({ ...prev, [id]: type }));
    setTimeout(() => setFeedback((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    }), 2000);
  };

  const deleteHighlight = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from("highlights")
        .delete()
        .eq("highlights.id", id)
        .eq("highlights.user_id", user!.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["user-studio-highlights"] });
      toast.success("Highlight deleted");
    } catch (err) {
      console.error(err);
      toast.error("Delete failed — please try again");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => { setPage(0); }, [sortBy, searchQuery]);

  const truncate = (text: string, max: number) => text.length > max ? text.slice(0, max) + "…" : text;

  if (authLoading || permsLoading || !user || !allowed) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground mb-2">My Studio</h1>
          <p className="text-muted-foreground">Your private highlights — add, edit, and curate.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" /> Add highlight
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-lg border bg-card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search quotes, books, notes..."
            className="h-10 w-72 rounded-md border border-input bg-background pl-9 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Separator orientation="vertical" className="h-8 hidden sm:block" />

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Sort by" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most recent</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="no_notes">No notes first</SelectItem>
            <SelectItem value="no_tags">No tags first</SelectItem>
          </SelectContent>
        </Select>

        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
          {totalCount} highlights
        </span>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <SortableHeader label="Quote" colKey="quote" columnSort={columnSort} onSort={handleColumnSort} className="w-[35%]" />
              <SortableHeader label="Book" colKey="book" columnSort={columnSort} onSort={handleColumnSort} className="w-[15%]" />
              <SortableHeader label="Tags" colKey="tags" columnSort={columnSort} onSort={handleColumnSort} className="w-[20%]" />
              <SortableHeader label="Notes" colKey="notes" columnSort={columnSort} onSort={handleColumnSort} className="w-[15%]" />
              <SortableHeader label="Visibility" colKey="visibility" columnSort={columnSort} onSort={handleColumnSort} className="w-[10%]" />
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
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  You haven't added any highlights yet. Add your first one above.
                </td>
              </tr>
            ) : (
              highlights.map((h) => (
                <tr key={h.id} className="border-b hover:bg-muted/30 cursor-pointer" onDoubleClick={() => setEditingHighlight(h)}>
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
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingHighlight(h)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(h.id); }}
                          disabled={deletingId === h.id}
                          aria-label="Delete highlight"
                        >
                          {deletingId === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this highlight?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirmDeleteId) {
                  const id = confirmDeleteId;
                  setConfirmDeleteId(null);
                  await deleteHighlight(id);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <StudioAddHighlightModal
        open={showAdd}
        onOpenChange={setShowAdd}
        allTags={allTags ?? []}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["user-studio-highlights"] })}
      />
    </div>
  );
};

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
  const [visibility, setVisibility] = useState("private");
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (highlight) {
      setQuote(highlight.quote);
      setTags(highlight.tags ?? []);
      setNotes(highlight.my_notes ?? "");
      setVisibility(highlight.visibility ?? "private");
      setTagInput("");
    }
  }, [highlight]);

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };
  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const input = tagInput.toLowerCase();
  const filteredSuggestions = allTags
    .filter((t) => !tags.includes(t) && t.toLowerCase().includes(input))
    .sort((a, b) => {
      const aS = a.toLowerCase().startsWith(input);
      const bS = b.toLowerCase().startsWith(input);
      if (aS && !bS) return -1;
      if (!aS && bS) return 1;
      return a.localeCompare(b);
    })
    .slice(0, 20);

  const handleSave = () => {
    if (!highlight) return;
    onSave(highlight.id, { quote, tags, my_notes: notes || null, visibility });
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
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Quote</label>
            <Textarea value={quote} onChange={(e) => setQuote(e.target.value)} rows={6} className="text-sm leading-relaxed" />
          </div>

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

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Personal Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Add your notes…" className="text-sm" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Visibility</label>
            <div className="flex gap-2">
              <Button variant={visibility === "private" ? "default" : "outline"} size="sm" onClick={() => setVisibility("private")}>Private</Button>
              <Button variant={visibility === "public" ? "default" : "outline"} size="sm" onClick={() => setVisibility("public")}>Public</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Switching to public makes this highlight visible to everyone on Glean.
            </p>
          </div>

          <Separator />

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? "Saving…" : "Save"}</Button>
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default UserStudio;
