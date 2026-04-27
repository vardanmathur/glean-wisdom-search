import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, AlertCircle, ChevronLeft, ChevronRight, Pencil, X, ChevronDown, Search, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";

const ADMIN_EDIT_DRAFT_PREFIX = "glean_admin_studio_edit_draft";

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

interface DuplicateRow {
  id: string;
  quote: string;
  book_id: string | null;
  tags: string[] | null;
  created_at: string;
  book_title: string | null;
  book_author: string | null;
}

interface DuplicateGroup {
  key: string;
  book_title: string | null;
  book_author: string | null;
  quote: string;
  rows: DuplicateRow[];
}
interface MultiTagFilterProps {
  allTags: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
}

const MultiTagFilter = ({ allTags, selected, onChange }: MultiTagFilterProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const input = search.toLowerCase();
  const filtered = allTags
    .filter((t) => t.toLowerCase().includes(input))
    .sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(input);
      const bStarts = b.toLowerCase().startsWith(input);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.localeCompare(b);
    });

  const toggle = (tag: string) => {
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-10 w-[180px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <span className="truncate text-muted-foreground">
          {selected.length === 0 ? "All tags" : `Tags (${selected.length})`}
        </span>
        <div className="flex items-center gap-1">
          {selected.length > 0 && (
            <X
              className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
            />
          )}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </div>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-[240px] rounded-md border bg-popover shadow-md">
          <div className="p-2 border-b">
            <div className="flex items-center gap-2 rounded-md border px-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tags…"
                className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No tags found</p>
            ) : (
              filtered.map((tag) => (
                <button
                  key={tag}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                  onClick={() => toggle(tag)}
                >
                  <Checkbox checked={selected.includes(tag)} className="pointer-events-none" />
                  <span>{tag}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Column sort header ---
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

// --- Main page ---
const AdminStudioHighlights = () => {
  const { user, authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(0);
  const [filterBook, setFilterBook] = useState<string>("all");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterNoNotes, setFilterNoNotes] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [columnSort, setColumnSort] = useState<ColumnSortState>(null);
  const [feedback, setFeedback] = useState<Record<string, "success" | "error">>({});
  const [editingHighlight, setEditingHighlight] = useState<HighlightRow | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [keepIds, setKeepIds] = useState<Record<string, string>>({}); // groupKey -> highlight id to keep
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generatingEmbeddings, setGeneratingEmbeddings] = useState(false);

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
    queryKey: ["studio-highlights", page, filterBook, filterTags, filterNoNotes, sortBy, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("highlights")
        .select("id, quote, tags, my_notes, visibility, created_at, book_id, books(title)", { count: "exact" });

      if (filterBook !== "all") query = query.eq("book_id", filterBook);
      if (filterTags.length > 0) query = query.contains("tags", filterTags);
      if (filterNoNotes) query = query.or("my_notes.is.null,my_notes.eq.");

      const trimmedSearch = searchQuery.trim();
      if (trimmedSearch) {
        // Escape PostgREST special chars in ilike pattern
        const escaped = trimmedSearch.replace(/[,()]/g, " ");
        const pattern = `%${escaped}%`;
        // Look up matching book_ids by title so we can include them in the OR
        const { data: matchingBooks } = await supabase
          .from("books")
          .select("id")
          .ilike("title", pattern);
        const bookIds = (matchingBooks ?? []).map((b) => b.id);
        const orParts = [`quote.ilike.${pattern}`, `my_notes.ilike.${pattern}`];
        if (bookIds.length > 0) {
          orParts.push(`book_id.in.(${bookIds.join(",")})`);
        }
        query = query.or(orParts.join(","));
      }

      switch (sortBy) {
        case "recent":
          query = query.order("created_at", { ascending: false });
          break;
        case "oldest":
          query = query.order("created_at", { ascending: true });
          break;
        case "no_notes":
          // NULL my_notes first, then oldest-empty/newest non-empty by created_at
          query = query
            .order("my_notes", { ascending: true, nullsFirst: true })
            .order("created_at", { ascending: false });
          break;
        case "no_tags":
          // Postgres compares arrays element-wise, so empty arrays sort first
          // when ordering ascending — gives "no tags first" across the full DB.
          query = query
            .order("tags", { ascending: true, nullsFirst: true })
            .order("created_at", { ascending: false });
          break;
      }

      query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      const { data, count, error } = await query;
      if (error) throw error;

      const rows = (data as unknown as HighlightRow[]) ?? [];
      return { rows, total: count ?? 0 };
    },
    enabled: user?.email === ADMIN_EMAIL,
  });

  // Lightweight query for which currently-visible IDs lack embeddings.
  // We never SELECT the embedding vector itself — just IDs filtered by IS NULL.
  const visibleIds = (highlightsData?.rows ?? []).map((r) => r.id);
  const { data: missingEmbeddingIds } = useQuery({
    queryKey: ["studio-missing-embeddings", visibleIds],
    queryFn: async () => {
      if (visibleIds.length === 0) return new Set<string>();
      const { data, error } = await supabase
        .from("highlights")
        .select("id")
        .in("id", visibleIds)
        .is("embedding", null);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.id));
    },
    enabled: user?.email === ADMIN_EMAIL && visibleIds.length > 0,
  });

  const selectedMissingCount = Array.from(selectedIds).filter((id) => missingEmbeddingIds?.has(id)).length;

  const generateEmbeddingsForSelected = async () => {
    const ids = Array.from(selectedIds).filter((id) => missingEmbeddingIds?.has(id));
    if (ids.length === 0) return;
    setGeneratingEmbeddings(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-embeddings", {
        body: { ids },
      });
      if (error) throw error;
      const processed = (data as { processed?: number })?.processed ?? ids.length;
      toast.success(`Embeddings generated for ${processed} highlight${processed === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["studio-missing-embeddings"] });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate embeddings — please try again");
    } finally {
      setGeneratingEmbeddings(false);
    }
  };

  const toggleRowSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) visibleIds.forEach((id) => next.add(id));
      else visibleIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  // Apply client-side column sort
  const applyColumnSort = (rows: HighlightRow[]): HighlightRow[] => {
    if (!columnSort) return rows;
    const { col, dir } = columnSort;
    const mult = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (col) {
        case "quote":
          return mult * a.quote.localeCompare(b.quote);
        case "book":
          return mult * (a.books?.title ?? "").localeCompare(b.books?.title ?? "");
        case "tags":
          return mult * ((a.tags?.length ?? 0) - (b.tags?.length ?? 0));
        case "notes": {
          if (!a.my_notes && !b.my_notes) return 0;
          if (!a.my_notes) return 1;
          if (!b.my_notes) return -1;
          return mult * a.my_notes.localeCompare(b.my_notes);
        }
        case "visibility":
          return mult * (a.visibility ?? "").localeCompare(b.visibility ?? "");
        default:
          return 0;
      }
    });
  };

  const highlights = applyColumnSort(highlightsData?.rows ?? []);
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

  const loadDuplicates = async () => {
    setLoadingDuplicates(true);
    try {
      const PAGE = 1000;
      let from = 0;
      const all: Array<{
        id: string;
        quote: string;
        book_id: string | null;
        tags: string[] | null;
        created_at: string;
        books: { title: string | null; author: string | null } | null;
      }> = [];
      // Paginated fetch — explicit columns only, never SELECT *, never embedding
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("highlights")
          .select("id, quote, book_id, tags, created_at, books(title, author)")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as typeof all;
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }

      const groups = new Map<string, DuplicateGroup>();
      for (const r of all) {
        const key = `${r.quote}||${r.book_id ?? ""}`;
        const row: DuplicateRow = {
          id: r.id,
          quote: r.quote,
          book_id: r.book_id,
          tags: r.tags,
          created_at: r.created_at,
          book_title: r.books?.title ?? null,
          book_author: r.books?.author ?? null,
        };
        const existing = groups.get(key);
        if (existing) {
          existing.rows.push(row);
        } else {
          groups.set(key, { key, book_title: row.book_title, book_author: row.book_author, quote: row.quote, rows: [row] });
        }
      }

      const dupGroups = Array.from(groups.values())
        .filter((g) => g.rows.length > 1)
        .map((g) => ({
          ...g,
          rows: [...g.rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        }))
        .sort((a, b) => b.rows.length - a.rows.length);

      const keep: Record<string, string> = {};
      dupGroups.forEach((g) => { keep[g.key] = g.rows[0].id; });

      setDuplicateGroups(dupGroups);
      setKeepIds(keep);
      setShowDuplicates(true);
    } catch (err) {
      console.error("Failed to load duplicates:", err);
      toast.error("Failed to load duplicates");
    } finally {
      setLoadingDuplicates(false);
    }
  };

  const deleteHighlight = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("highlights").delete().eq("id", id);
      if (error) throw error;
      setDuplicateGroups((prev) =>
        prev.map((g) => ({ ...g, rows: g.rows.filter((r) => r.id !== id) })).filter((g) => g.rows.length > 1)
      );
      setKeepIds((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => { if (next[k] === id) delete next[k]; });
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["studio-highlights"] });
      toast.success("Highlight deleted");
      return true;
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error("Delete failed — please try again");
      return false;
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    setPage(0);
  }, [filterBook, filterTags, filterNoNotes, sortBy, searchQuery]);

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + "…" : text;

  if (authLoading || !user || user.email !== ADMIN_EMAIL) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <h1 className="font-display text-3xl font-semibold text-foreground mb-2">Glean Studio</h1>
      <p className="text-muted-foreground mb-6">Curate highlights — edit tags, notes, and visibility.</p>

      {/* Filter & Sort Bar */}
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
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select value={filterBook} onValueChange={setFilterBook}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter by book" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All books</SelectItem>
            {books?.map((b) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}
          </SelectContent>
        </Select>

        <MultiTagFilter allTags={allTags ?? []} selected={filterTags} onChange={setFilterTags} />

        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={filterNoNotes} onCheckedChange={(v) => setFilterNoNotes(v === true)} />
          No notes only
        </label>

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

        <Button
          variant="outline"
          size="sm"
          onClick={loadDuplicates}
          disabled={loadingDuplicates}
          className="gap-2"
        >
          {loadingDuplicates ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
          Find Duplicates
        </Button>

        {selectedIds.size > 0 && (
          <Button
            variant="default"
            size="sm"
            onClick={generateEmbeddingsForSelected}
            disabled={generatingEmbeddings || selectedMissingCount === 0}
            className="gap-2"
          >
            {generatingEmbeddings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generatingEmbeddings ? "Generating…" : `Generate embeddings (${selectedMissingCount})`}
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
          {totalCount} highlights
        </span>
      </div>

      {showDuplicates ? (
        /* Duplicates Panel */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border bg-card">
            <div>
              <h2 className="font-display text-xl font-semibold text-foreground">Duplicates</h2>
              <p className="text-sm text-muted-foreground">
                {duplicateGroups.length === 0
                  ? "No exact duplicates found."
                  : `${duplicateGroups.length} duplicate ${duplicateGroups.length === 1 ? "group" : "groups"} found, ${duplicateGroups.reduce((sum, g) => sum + g.rows.length - 1, 0)} highlights to remove`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadDuplicates} disabled={loadingDuplicates} className="gap-2">
                {loadingDuplicates ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowDuplicates(false)}>
                Close duplicates view
              </Button>
            </div>
          </div>

          {duplicateGroups.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
              {loadingDuplicates ? "Scanning…" : "All clean — no duplicates found."}
            </div>
          ) : (
            duplicateGroups.map((group) => {
              const keepId = keepIds[group.key];
              return (
                <div key={group.key} className="rounded-lg border bg-card p-4">
                  <div className="mb-3">
                    <p className="text-sm font-medium text-foreground">
                      {group.book_title ?? "Unknown book"}
                      {group.book_author ? <span className="text-muted-foreground font-normal"> — {group.book_author}</span> : null}
                    </p>
                    <p className="text-sm text-muted-foreground italic mt-1">"{truncate(group.quote, 200)}"</p>
                    <p className="text-xs text-muted-foreground mt-1">{group.rows.length} copies</p>
                  </div>
                  <div className="space-y-2">
                    {group.rows.map((row) => {
                      const isKeep = row.id === keepId;
                      return (
                        <div
                          key={row.id}
                          className={`flex items-center justify-between gap-3 rounded-md border p-3 ${isKeep ? "border-primary/40 bg-primary/5" : "border-border"}`}
                        >
                          <label className="flex items-center gap-2 text-sm cursor-pointer flex-1 min-w-0">
                            <input
                              type="radio"
                              name={`keep-${group.key}`}
                              checked={isKeep}
                              onChange={() => setKeepIds((prev) => ({ ...prev, [group.key]: row.id }))}
                              className="accent-primary"
                            />
                            <span className={isKeep ? "font-medium text-primary" : "text-muted-foreground"}>
                              {isKeep ? "Keep" : "Duplicate"}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {new Date(row.created_at).toLocaleString()}
                            </span>
                            {(row.tags?.length ?? 0) > 0 && (
                              <span className="text-xs text-muted-foreground ml-2 truncate">
                                · {row.tags!.join(", ")}
                              </span>
                            )}
                          </label>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={isKeep || deletingId === row.id}
                            onClick={() => deleteHighlight(row.id)}
                            className="gap-1.5"
                          >
                            {deletingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Delete
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
      <>
      {/* Table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 w-[40px]">
                <Checkbox
                  checked={visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))}
                  onCheckedChange={(v) => toggleAllVisible(v === true)}
                  aria-label="Select all visible"
                />
              </th>
              <SortableHeader label="Quote" colKey="quote" columnSort={columnSort} onSort={handleColumnSort} className="w-[33%]" />
              <SortableHeader label="Book" colKey="book" columnSort={columnSort} onSort={handleColumnSort} className="w-[15%]" />
              <SortableHeader label="Tags" colKey="tags" columnSort={columnSort} onSort={handleColumnSort} className="w-[18%]" />
              <SortableHeader label="Notes" colKey="notes" columnSort={columnSort} onSort={handleColumnSort} className="w-[14%]" />
              <SortableHeader label="Visibility" colKey="visibility" columnSort={columnSort} onSort={handleColumnSort} className="w-[10%]" />
              <th className="text-center p-3 font-medium text-muted-foreground w-[10%]"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td colSpan={7} className="p-3"><div className="h-5 bg-muted/50 rounded animate-pulse" /></td>
                </tr>
              ))
            ) : highlights.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">No highlights found.</td>
              </tr>
            ) : (
              highlights.map((h) => {
                const isMissingEmbedding = missingEmbeddingIds?.has(h.id);
                return (
                <tr key={h.id} className="border-b hover:bg-muted/30 cursor-pointer" onDoubleClick={() => setEditingHighlight(h)}>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(h.id)}
                      onCheckedChange={() => toggleRowSelection(h.id)}
                      aria-label="Select row"
                    />
                  </td>
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
                        {isMissingEmbedding && (
                          <Sparkles className="h-3.5 w-3.5 text-destructive" aria-label="Missing embedding" />
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingHighlight(h)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
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
                );
              })
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
      </>
      )}

      {/* Row delete confirmation */}
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
  const draftKey = `${ADMIN_EDIT_DRAFT_PREFIX}_${highlight?.id ?? "none"}`;

  const [quote, setQuote, clearQuote] = useSessionStorageState<string>(`${draftKey}_quote`, "");
  const [tags, setTags, clearTags] = useSessionStorageState<string[]>(`${draftKey}_tags`, []);
  const [notes, setNotes, clearNotes] = useSessionStorageState<string>(`${draftKey}_notes`, "");
  const [visibility, setVisibility, clearVisibility] = useSessionStorageState<string>(`${draftKey}_visibility`, "public");
  const [tagInput, setTagInput] = useState("");

  // Always hydrate from the highlight prop on open / id change. sessionStorage
  // is for surviving window switches mid-edit, not for restoring a previous
  // session's draft over fresh server data.
  useEffect(() => {
    if (!highlight) return;
    setQuote(highlight.quote);
    setTags(highlight.tags ?? []);
    setNotes(highlight.my_notes ?? "");
    setVisibility(highlight.visibility ?? "public");
    setTagInput("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight?.id]);

  const clearDraft = () => {
    clearQuote();
    clearTags();
    clearNotes();
    clearVisibility();
  };

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
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const aStarts = aLower.startsWith(input);
      const bStarts = bLower.startsWith(input);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aLower.localeCompare(bLower);
    })
    .slice(0, 20);

  const handleSave = () => {
    if (!highlight) return;
    onSave(highlight.id, {
      quote,
      tags,
      my_notes: notes || null,
      visibility,
    });
    clearDraft();
  };

  const handleClose = () => {
    clearDraft();
    onClose();
  };

  return (
    <Sheet open={!!highlight} onOpenChange={(open) => { if (!open) handleClose(); }}>
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
              <Button variant={visibility === "public" ? "default" : "outline"} size="sm" onClick={() => setVisibility("public")}>Public</Button>
              <Button variant={visibility === "private" ? "default" : "outline"} size="sm" onClick={() => setVisibility("private")}>Private</Button>
            </div>
          </div>

          <Separator />

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? "Saving…" : "Save"}</Button>
            <Button variant="outline" onClick={handleClose} className="flex-1">Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AdminStudioHighlights;
