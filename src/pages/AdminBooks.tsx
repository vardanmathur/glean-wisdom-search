import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Loader2, Pencil, Trash2, Search, Copy, Image as ImageIcon, Check, X, Sparkles, ArrowLeft, Table as TableIcon, LayoutGrid, LayoutList, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import FetchCoversDialog from "@/components/admin/FetchCoversDialog";
import { fetchBookCover } from "@/lib/fetchBookCover";

interface BookRow {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  cover_image_url: string | null;
  highlight_count: number;
}

interface DuplicateGroup {
  key: string;
  rows: BookRow[];
}

const PAGE = 1000;
const DELETE_CHUNK = 100;

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const AdminBooks = () => {
  const { user, authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const [books, setBooks] = useState<BookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<BookRow | null>(null);
  const [editForm, setEditForm] = useState({ title: "", author: "", isbn: "", cover_image_url: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [fetchingCover, setFetchingCover] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BookRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmOrphans, setConfirmOrphans] = useState(false);
  const [deletingOrphans, setDeletingOrphans] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [keepIds, setKeepIds] = useState<Record<string, string>>({});
  const [showCoversDialog, setShowCoversDialog] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "thumbnail" | "detail">("list");

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const allBooks: Omit<BookRow, "highlight_count">[] = [];
        let from = 0;
        for (;;) {
          const { data, error } = await supabase
            .from("books")
            .select("id, title, author, isbn, cover_image_url")
            .order("title")
            .range(from, from + PAGE - 1);
          if (error) throw error;
          const rows = data ?? [];
          allBooks.push(...rows);
          if (rows.length < PAGE) break;
          from += PAGE;
        }

        const counts = new Map<string, number>();
        from = 0;
        for (;;) {
          const { data, error } = await supabase
            .from("highlights")
            .select("book_id")
            .range(from, from + PAGE - 1);
          if (error) throw error;
          const rows = data ?? [];
          for (const r of rows) {
            if (r.book_id) counts.set(r.book_id, (counts.get(r.book_id) ?? 0) + 1);
          }
          if (rows.length < PAGE) break;
          from += PAGE;
        }

        if (cancelled) return;
        setBooks(
          allBooks.map((b) => ({ ...b, highlight_count: counts.get(b.id) ?? 0 })),
        );
      } catch (err) {
        console.error(err);
        toast.error("Failed to load books");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const filteredBooks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q),
    );
  }, [books, search]);

  const orphanCount = useMemo(() => books.filter((b) => b.highlight_count === 0).length, [books]);

  const openEdit = (b: BookRow) => {
    setEditing(b);
    setEditForm({
      title: b.title,
      author: b.author,
      isbn: b.isbn ?? "",
      cover_image_url: b.cover_image_url ?? "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const updates = {
        title: editForm.title.trim(),
        author: editForm.author.trim(),
        isbn: editForm.isbn.trim() || null,
        cover_image_url: editForm.cover_image_url.trim() || null,
      };
      const { error } = await supabase.from("books").update(updates).eq("id", editing.id);
      if (error) throw error;
      setBooks((prev) => prev.map((b) => (b.id === editing.id ? { ...b, ...updates } : b)));
      toast.success("Book updated");
      setEditing(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update book");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAutoFetchCover = async () => {
    if (!editForm.title.trim()) return;
    setFetchingCover(true);
    try {
      const url = await fetchBookCover(editForm.title, editForm.author);
      if (url) {
        setEditForm((f) => ({ ...f, cover_image_url: url }));
        toast.success("Cover found");
      } else {
        toast.error("No cover found");
      }
    } finally {
      setFetchingCover(false);
    }
  };

  const handleDeleteBook = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("books").delete().eq("id", confirmDelete.id);
      if (error) throw error;
      setBooks((prev) => prev.filter((b) => b.id !== confirmDelete.id));
      toast.success("Book deleted");
      setConfirmDelete(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete book");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteOrphans = async () => {
    const orphanIds = books.filter((b) => b.highlight_count === 0).map((b) => b.id);
    if (orphanIds.length === 0) return;
    setDeletingOrphans(true);
    let deleted = 0;
    try {
      for (const batch of chunk(orphanIds, DELETE_CHUNK)) {
        const { error } = await supabase.from("books").delete().in("id", batch);
        if (error) throw error;
        deleted += batch.length;
      }
      setBooks((prev) => prev.filter((b) => b.highlight_count > 0));
      toast.success(`Deleted ${deleted} book${deleted === 1 ? "" : "s"}`);
      setConfirmOrphans(false);
    } catch (err) {
      console.error(err);
      toast.error(`Deleted ${deleted}, then failed — refresh to see current state`);
    } finally {
      setDeletingOrphans(false);
    }
  };

  const findDuplicates = () => {
    const groupMap = new Map<string, BookRow[]>();
    for (const b of books) {
      const key = b.title.trim().toLowerCase();
      if (!key) continue;
      const arr = groupMap.get(key) ?? [];
      arr.push(b);
      groupMap.set(key, arr);
    }
    const groups: DuplicateGroup[] = [];
    const initialKeep: Record<string, string> = {};
    for (const [key, rows] of groupMap) {
      if (rows.length < 2) continue;
      groups.push({ key, rows });
      const keeper = [...rows].sort((a, b) => {
        if (b.highlight_count !== a.highlight_count) return b.highlight_count - a.highlight_count;
        return (b.cover_image_url ? 1 : 0) - (a.cover_image_url ? 1 : 0);
      })[0];
      initialKeep[key] = keeper.id;
    }
    groups.sort((a, b) => a.rows[0].title.localeCompare(b.rows[0].title));
    setDuplicateGroups(groups);
    setKeepIds(initialKeep);
    setShowDuplicates(true);
    if (groups.length === 0) toast.info("No duplicate titles found");
  };

  const handleDeleteDuplicate = async (book: BookRow) => {
    if (book.highlight_count > 0) return;
    try {
      const { error } = await supabase.from("books").delete().eq("id", book.id);
      if (error) throw error;
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
      setDuplicateGroups((prev) =>
        prev
          .map((g) => ({ ...g, rows: g.rows.filter((r) => r.id !== book.id) }))
          .filter((g) => g.rows.length >= 2),
      );
      toast.success("Deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete");
    }
  };

  if (authLoading || adminLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user || !isAdmin) return <Navigate to="/" replace />;

  return (
    <TooltipProvider>
      <div className="container mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Admin
          </Link>
          <h1 className="font-display text-3xl font-semibold text-foreground">Books</h1>
          <p className="mt-2 text-muted-foreground">Manage your book catalogue</p>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or author…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="hidden sm:flex rounded-md border overflow-hidden">
              {([
                { mode: "list" as const, Icon: TableIcon, label: "List" },
                { mode: "thumbnail" as const, Icon: LayoutGrid, label: "Thumbnail" },
                { mode: "detail" as const, Icon: LayoutList, label: "Detail" },
              ]).map(({ mode, Icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  aria-label={label}
                  className={`px-2.5 py-1.5 transition-colors ${
                    viewMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={findDuplicates} className="gap-1.5">
              <Copy className="h-4 w-4" /> Find Duplicates
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOrphans(true)}
              disabled={orphanCount === 0}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              Delete {orphanCount} book{orphanCount === 1 ? "" : "s"} with no highlights
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowCoversDialog(true)} className="gap-1.5">
              <ImageIcon className="h-4 w-4" /> Fetch Missing Covers
            </Button>
          </div>
        </div>

        {showDuplicates && (
          <div className="mb-6 rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium text-foreground">
                Duplicate titles ({duplicateGroups.length} group{duplicateGroups.length === 1 ? "" : "s"})
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowDuplicates(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {duplicateGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No duplicates found.</p>
            ) : (
              <div className="space-y-4">
                {duplicateGroups.map((g) => (
                  <div key={g.key} className="rounded-lg border bg-background p-3">
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                      {g.rows[0].title}
                    </p>
                    <div className="space-y-2">
                      {g.rows.map((b) => {
                        const isKeep = keepIds[g.key] === b.id;
                        const canDelete = b.highlight_count === 0 && !isKeep;
                        return (
                          <div key={b.id} className="flex items-center gap-3 text-sm">
                            <input
                              type="radio"
                              name={`keep-${g.key}`}
                              checked={isKeep}
                              onChange={() => setKeepIds((prev) => ({ ...prev, [g.key]: b.id }))}
                              className="h-4 w-4 accent-primary"
                            />
                            <span className="flex-1 truncate">
                              <span className="font-medium">{b.author}</span>
                              <span className="ml-2 text-muted-foreground">
                                · {b.highlight_count} highlight{b.highlight_count === 1 ? "" : "s"}
                                {b.isbn ? ` · ISBN ${b.isbn}` : ""}
                              </span>
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!canDelete}
                                    onClick={() => handleDeleteDuplicate(b)}
                                    className="gap-1.5"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Delete
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {!canDelete && (
                                <TooltipContent>
                                  {isKeep ? "Selected to keep" : "Has highlights"}
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Note: merge (reassigning highlights) is not supported here — delete only orphan duplicates.
                </p>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            <div className="px-1 text-xs text-muted-foreground">
              {filteredBooks.length} of {books.length} book{books.length === 1 ? "" : "s"}
            </div>
            {filteredBooks.length === 0 ? (
              <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
                No books match your search.
              </p>
            ) : (
              filteredBooks.map((b) => {
                const canDelete = b.highlight_count === 0;
                return (
                  <div key={b.id} className="rounded-lg border bg-card p-3 flex gap-3">
                    <div className="h-14 w-10 flex-shrink-0 overflow-hidden rounded border bg-muted">
                      {b.cover_image_url ? (
                        <img src={b.cover_image_url} alt={b.title} className="h-full w-full object-cover" loading="lazy" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="font-medium text-foreground truncate">{b.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{b.author}</div>
                      {b.isbn && (
                        <div className="text-xs text-muted-foreground">ISBN {b.isbn}</div>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <Badge variant={b.highlight_count > 0 ? "secondary" : "outline"}>
                          {b.highlight_count} highlight{b.highlight_count === 1 ? "" : "s"}
                        </Badge>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(b)} aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={!canDelete}
                            onClick={() => setConfirmDelete(b)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {viewMode === "list" && (
          <div className="hidden md:block rounded-xl border bg-card card-shadow overflow-hidden">
            <div className="border-b bg-secondary/40 px-4 py-2 text-xs text-muted-foreground">
              {filteredBooks.length} of {books.length} book{books.length === 1 ? "" : "s"}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/30 text-muted-foreground">
                  <tr>
                    <th className="w-[60px] px-3 py-2 text-left font-medium">Cover</th>
                    <th className="px-3 py-2 text-left font-medium">Title / Author</th>
                    <th className="px-3 py-2 text-left font-medium">ISBN</th>
                    <th className="px-3 py-2 text-left font-medium">Highlights</th>
                    <th className="px-3 py-2 text-left font-medium">Cover</th>
                    <th className="w-[110px] px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBooks.map((b) => {
                    const canDelete = b.highlight_count === 0;
                    return (
                      <tr key={b.id} className="border-t hover:bg-muted/40">
                        <td className="px-3 py-2">
                          <div className="h-14 w-10 overflow-hidden rounded border bg-muted">
                            {b.cover_image_url ? (
                              <img
                                src={b.cover_image_url}
                                alt={b.title}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{b.title}</div>
                          <div className="text-xs text-muted-foreground">{b.author}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{b.isbn ?? "—"}</td>
                        <td className="px-3 py-2">
                          <Badge variant={b.highlight_count > 0 ? "secondary" : "outline"}>
                            {b.highlight_count}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {b.cover_image_url ? (
                            <Check className="h-4 w-4 text-primary" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground" />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(b)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={!canDelete}
                                    onClick={() => setConfirmDelete(b)}
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {!canDelete && <TooltipContent>Has highlights</TooltipContent>}
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredBooks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-12 text-center text-sm text-muted-foreground">
                        No books match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {viewMode === "thumbnail" && (
            <div className="hidden md:block">
              <div className="mb-3 text-xs text-muted-foreground">
                {filteredBooks.length} of {books.length} book{books.length === 1 ? "" : "s"}
              </div>
              {filteredBooks.length === 0 ? (
                <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
                  No books match your search.
                </p>
              ) : (
                <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filteredBooks.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => openEdit(b)}
                      className="text-left group"
                    >
                      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-primary/10 border">
                        {b.cover_image_url ? (
                          <img
                            src={b.cover_image_url}
                            alt={b.title}
                            className="h-full w-full object-cover group-hover:opacity-90 transition-opacity"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <BookOpen className="h-8 w-8 text-primary/40" />
                          </div>
                        )}
                        <Badge
                          variant={b.highlight_count > 0 ? "secondary" : "outline"}
                          className="absolute bottom-2 right-2"
                        >
                          {b.highlight_count}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs font-medium text-foreground truncate">{b.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{b.author}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {viewMode === "detail" && (
            <div className="hidden md:block space-y-3">
              <div className="text-xs text-muted-foreground">
                {filteredBooks.length} of {books.length} book{books.length === 1 ? "" : "s"}
              </div>
              {filteredBooks.length === 0 ? (
                <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
                  No books match your search.
                </p>
              ) : (
                filteredBooks.map((b) => {
                  const canDelete = b.highlight_count === 0;
                  return (
                    <div key={b.id} className="rounded-lg border bg-card p-4 flex gap-4">
                      <div className="h-20 w-14 flex-shrink-0 overflow-hidden rounded border bg-muted">
                        {b.cover_image_url ? (
                          <img src={b.cover_image_url} alt={b.title} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <BookOpen className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="font-medium text-foreground truncate">{b.title}</div>
                        <div className="text-sm text-muted-foreground truncate">{b.author}</div>
                        {b.isbn && (
                          <div className="text-xs text-muted-foreground">ISBN {b.isbn}</div>
                        )}
                        <div className="flex items-center justify-between pt-1">
                          <Badge variant={b.highlight_count > 0 ? "secondary" : "outline"}>
                            {b.highlight_count} highlight{b.highlight_count === 1 ? "" : "s"}
                          </Badge>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(b)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={!canDelete}
                                    onClick={() => setConfirmDelete(b)}
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {!canDelete && <TooltipContent>Has highlights</TooltipContent>}
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          </>
        )}

        <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Edit book</SheetTitle>
              <SheetDescription>Update book metadata and cover.</SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-author">Author</Label>
                <Input
                  id="edit-author"
                  value={editForm.author}
                  onChange={(e) => setEditForm((f) => ({ ...f, author: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-isbn">ISBN</Label>
                <Input
                  id="edit-isbn"
                  value={editForm.isbn}
                  onChange={(e) => setEditForm((f) => ({ ...f, isbn: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-cover">Cover URL</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAutoFetchCover}
                    disabled={fetchingCover || !editForm.title.trim()}
                    className="gap-1.5"
                  >
                    {fetchingCover ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Fetch cover automatically
                  </Button>
                </div>
                <Input
                  id="edit-cover"
                  value={editForm.cover_image_url}
                  onChange={(e) => setEditForm((f) => ({ ...f, cover_image_url: e.target.value }))}
                  placeholder="https://…"
                />
                <div className="mt-2 h-44 w-32 overflow-hidden rounded border bg-muted">
                  {editForm.cover_image_url ? (
                    <img
                      src={editForm.cover_image_url}
                      alt="Cover preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No cover
                    </div>
                  )}
                </div>
              </div>
            </div>
            <SheetFooter className="mt-6 gap-2">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={savingEdit}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit || !editForm.title.trim() || !editForm.author.trim()}>
                {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this book?</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDelete && (
                  <>
                    <span className="font-medium text-foreground">{confirmDelete.title}</span> by{" "}
                    {confirmDelete.author} will be permanently deleted. This cannot be undone.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteBook} disabled={deleting}>
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmOrphans} onOpenChange={(o) => !deletingOrphans && setConfirmOrphans(o)}>
          <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {orphanCount} books with no highlights?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete {orphanCount} book{orphanCount === 1 ? "" : "s"} with no highlights. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingOrphans}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteOrphans} disabled={deletingOrphans}>
                {deletingOrphans && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete {orphanCount}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <FetchCoversDialog open={showCoversDialog} onOpenChange={setShowCoversDialog} />
      </div>
    </TooltipProvider>
  );
};

export default AdminBooks;
