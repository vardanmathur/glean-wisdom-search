import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pencil, Trash2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { ALL_TAGS } from "@/lib/tags";
import { toTitleCase } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TagCount {
  tag: string;
  count: number;
}

interface OverlapHighlight {
  id: string;
  quote: string;
  bookTitle: string;
  author: string;
}

interface TagSuggestion {
  tag1: string;
  tag2: string;
  reason: string;
  keep: string;
  confidence: "high" | "medium" | "low";
}

const CONFIDENCE_STYLES: Record<TagSuggestion["confidence"], string> = {
  high: "bg-primary/10 text-primary",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-muted text-muted-foreground",
};

const AdminTagManagement = () => {
  const { authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const queryClient = useQueryClient();

  // --- Tag inventory ---
  const { data: tagCounts = [], isLoading } = useQuery({
    queryKey: ["tag-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("highlights")
        .select("tags");
      if (error) throw error;

      const countMap = new Map<string, number>();
      (data ?? []).forEach((row) => {
        (row.tags ?? []).forEach((t: string) => {
          if (t) countMap.set(t, (countMap.get(t) ?? 0) + 1);
        });
      });

      // Merge in canonical taxonomy tags not currently used on any
      // highlight, with count 0 — otherwise they'd never appear here
      // and the "delete unused tag" flow below would have nothing to
      // act on (every tag in a pure DB aggregation has count >= 1).
      ALL_TAGS.forEach((t) => {
        if (!countMap.has(t)) countMap.set(t, 0);
      });

      return Array.from(countMap.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);
    },
    enabled: isAdmin,
    staleTime: 2 * 60 * 1000,
  });

  const [sortBy, setSortBy] = useState<"count" | "name">("count");
  const [tagFilter, setTagFilter] = useState("");

  const [renamingTag, setRenamingTag] = useState<TagCount | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [addingTag, setAddingTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");

  const [confirmDeleteTag, setConfirmDeleteTag] = useState<TagCount | null>(null);

  const [overlapTagA, setOverlapTagA] = useState("");
  const [overlapTagB, setOverlapTagB] = useState("");
  const [overlapResults, setOverlapResults] = useState<OverlapHighlight[] | null>(null);
  const [overlapLoading, setOverlapLoading] = useState(false);

  const [analysing, setAnalysing] = useState(false);
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [analysed, setAnalysed] = useState(false);

  const filteredTags = useMemo(() => {
    const q = tagFilter.trim().toLowerCase();
    const list = q ? tagCounts.filter((t) => t.tag.toLowerCase().includes(q)) : tagCounts;
    return [...list].sort((a, b) =>
      sortBy === "count" ? b.count - a.count : a.tag.localeCompare(b.tag)
    );
  }, [tagCounts, tagFilter, sortBy]);

  // --- Rename ---
  const renameTrimmed = renameValue.trim();
  const renameIsSame = !!renamingTag && renameTrimmed.toLowerCase() === renamingTag.tag.toLowerCase();
  const renameIsDuplicate =
    !renameIsSame &&
    renameTrimmed.length > 0 &&
    tagCounts.some((t) => t.tag.toLowerCase() === renameTrimmed.toLowerCase());
  const renameValid = renameTrimmed.length > 0 && !renameIsSame && !renameIsDuplicate;

  const handleRename = async () => {
    if (!renamingTag || !renameValid) return;
    const oldTag = renamingTag.tag;
    const newTag = renameTrimmed;
    setRenaming(true);
    try {
      const { data: rows, error: fetchErr } = await supabase
        .from("highlights")
        .select("id, tags")
        .contains("tags", [oldTag]);
      if (fetchErr) throw fetchErr;

      const affected = rows ?? [];
      if (affected.length > 0) {
        const results = await Promise.all(
          affected.map((r) =>
            supabase
              .from("highlights")
              .update({ tags: (r.tags ?? []).map((t: string) => (t === oldTag ? newTag : t)) })
              .eq("id", r.id)
          )
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;

        const affectedIds = affected.map((r) => r.id);
        supabase.functions
          .invoke("generate-embeddings", { body: { ids: affectedIds, force: true } })
          .catch(() => { /* silent — refreshed lazily elsewhere if needed */ });
      }

      queryClient.setQueryData<TagCount[]>(["tag-counts"], (prev) =>
        (prev ?? []).map((t) => (t.tag === oldTag ? { tag: newTag, count: t.count } : t))
      );

      toast.success(`Renamed "${oldTag}" → "${newTag}". Update src/lib/tags.ts to reflect this change.`);
      setRenamingTag(null);
      setRenameValue("");
    } catch (err) {
      console.error(err);
      toast.error("Rename failed — please try again");
    } finally {
      setRenaming(false);
    }
  };

  // --- Add tag (taxonomy only, no DB write) ---
  const newTagTrimmed = newTagValue.trim();
  const newTagIsDuplicate =
    newTagTrimmed.length > 0 &&
    tagCounts.some((t) => t.tag.toLowerCase() === newTagTrimmed.toLowerCase());
  const newTagValid = newTagTrimmed.length > 0 && !newTagIsDuplicate;

  const handleAddTag = () => {
    if (!newTagValid) return;
    const display = toTitleCase(newTagTrimmed);
    queryClient.setQueryData<TagCount[]>(["tag-counts"], (prev) => [...(prev ?? []), { tag: display, count: 0 }]);
    toast.success(`Add "${display}" to src/lib/tags.ts to make it available in the taxonomy.`);
    setAddingTag(false);
    setNewTagValue("");
  };

  // --- Delete unused tag (count === 0, no DB write) ---
  const handleConfirmDelete = () => {
    if (!confirmDeleteTag) return;
    const tag = confirmDeleteTag.tag;
    queryClient.setQueryData<TagCount[]>(["tag-counts"], (prev) => (prev ?? []).filter((t) => t.tag !== tag));
    toast.success(`Tag deleted. Remove "${tag}" from src/lib/tags.ts (no DB change needed — tag isn't on any highlight).`);
    setConfirmDeleteTag(null);
  };

  // --- Find overlapping tags ---
  const handleFindOverlaps = async () => {
    if (!overlapTagA || !overlapTagB || overlapTagA === overlapTagB) return;
    setOverlapLoading(true);
    setOverlapResults(null);
    try {
      const { data, error } = await supabase
        .from("highlights")
        .select("id, quote, books!highlights_book_id_fkey(title, author)")
        .contains("tags", [overlapTagA, overlapTagB])
        .limit(50);
      if (error) throw error;
      const mapped = ((data as any[]) ?? []).map((row) => ({
        id: row.id,
        quote: row.quote,
        bookTitle: row.books?.title || "Unknown",
        author: row.books?.author || "Unknown",
      }));
      setOverlapResults(mapped);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't fetch overlapping highlights");
      setOverlapResults([]);
    } finally {
      setOverlapLoading(false);
    }
  };

  // --- AI redundancy analysis ---
  const handleAnalyse = async () => {
    setAnalysing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyse-tags", {
        body: { tags: tagCounts.map((t) => ({ name: t.tag, count: t.count })) },
      });
      if (error) throw error;
      const result = Array.isArray(data?.suggestions) ? (data.suggestions as TagSuggestion[]) : [];
      setSuggestions(result);
      setAnalysed(true);
    } catch (err) {
      console.error(err);
      toast.error("Analysis failed — please try again");
    } finally {
      setAnalysing(false);
    }
  };

  if (authLoading || adminLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>
        <h1 className="font-display text-3xl font-semibold text-foreground">Tag Management</h1>
        <p className="mt-2 text-muted-foreground">Analyse tag taxonomy, find overlaps and rename tags</p>
      </div>

      {/* Section 1 — Tag Inventory */}
      <section className="mb-10">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-lg font-medium text-foreground mr-auto">Tag Inventory</h2>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={sortBy === "count" ? "default" : "outline"}
              onClick={() => setSortBy("count")}
            >
              By count
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sortBy === "name" ? "default" : "outline"}
              onClick={() => setSortBy("name")}
            >
              By name
            </Button>
          </div>
          <input
            type="search"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            placeholder="Filter tags..."
            className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
          <Button type="button" size="sm" variant="outline" onClick={() => setAddingTag(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add tag
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTags.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            No tags match "{tagFilter}".
          </div>
        ) : (
          <div className="rounded-xl border bg-card card-shadow overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">Tag</th>
                    <th className="text-left font-medium px-4 py-3">Highlights</th>
                    <th className="text-left font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTags.map((t) => (
                    <tr key={t.tag} className="border-t">
                      <td className="px-4 py-3 text-foreground">{toTitleCase(t.tag)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {t.count}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => { setRenamingTag(t); setRenameValue(t.tag); }}
                            aria-label={`Rename ${t.tag}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    disabled={t.count > 0}
                                    onClick={() => setConfirmDeleteTag(t)}
                                    aria-label={`Delete ${t.tag}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {t.count > 0 && <TooltipContent>Has highlights</TooltipContent>}
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y">
              {filteredTags.map((t) => (
                <div key={t.tag} className="p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-foreground truncate">{toTitleCase(t.tag)}</span>
                    <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {t.count}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => { setRenamingTag(t); setRenameValue(t.tag); }}
                      aria-label={`Rename ${t.tag}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={t.count > 0}
                      onClick={() => setConfirmDeleteTag(t)}
                      aria-label={`Delete ${t.tag}`}
                      title={t.count > 0 ? "Has highlights" : undefined}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Section 2 — Find Overlapping Tags */}
      <section className="mb-10">
        <h2 className="text-lg font-medium text-foreground mb-1">Find Overlapping Tags</h2>
        <p className="text-sm text-muted-foreground mb-4">
          See which highlights share both tags before deciding to merge or rename.
        </p>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={overlapTagA}
            onChange={(e) => setOverlapTagA(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">Tag A…</option>
            {[...tagCounts].sort((a, b) => a.tag.localeCompare(b.tag)).map((t) => (
              <option key={t.tag} value={t.tag}>{toTitleCase(t.tag)}</option>
            ))}
          </select>
          <select
            value={overlapTagB}
            onChange={(e) => setOverlapTagB(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">Tag B…</option>
            {[...tagCounts].sort((a, b) => a.tag.localeCompare(b.tag)).map((t) => (
              <option key={t.tag} value={t.tag}>{toTitleCase(t.tag)}</option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            onClick={handleFindOverlaps}
            disabled={!overlapTagA || !overlapTagB || overlapTagA === overlapTagB || overlapLoading}
          >
            {overlapLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Find overlaps
          </Button>
        </div>

        {overlapResults !== null && (
          <div className="rounded-lg border bg-card p-4">
            {overlapResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No highlights share both tags.</p>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground mb-3">
                  {overlapResults.length} highlight{overlapResults.length !== 1 ? "s" : ""} have both "{toTitleCase(overlapTagA)}" and "{toTitleCase(overlapTagB)}"
                </p>
                <div className="space-y-2">
                  {overlapResults.map((h) => (
                    <div key={h.id} className="rounded-md border bg-background p-3 text-sm">
                      <p className="text-foreground">
                        "{h.quote.length > 100 ? `${h.quote.slice(0, 100)}…` : h.quote}"
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">— {h.bookTitle}, {h.author}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Section 3 — AI Redundancy Analysis */}
      <section>
        <h2 className="text-lg font-medium text-foreground mb-1">AI Redundancy Analysis</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Identify tags that may be duplicates or could be merged
        </p>
        <Button
          type="button"
          onClick={handleAnalyse}
          disabled={analysing}
          className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white mb-4"
        >
          {analysing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {analysing ? "Analysing…" : "Analyse tags"}
        </Button>

        {analysing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Analysing your tag taxonomy...
          </div>
        )}

        {!analysing && analysed && suggestions.length === 0 && (
          <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground text-sm">
            No significant overlaps found — your taxonomy looks clean!
          </div>
        )}

        {!analysing && suggestions.length > 0 && (
          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <div key={`${s.tag1}-${s.tag2}-${i}`} className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                    {s.tag1}
                  </span>
                  <span className="text-muted-foreground">↔</span>
                  <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                    {s.tag2}
                  </span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_STYLES[s.confidence]}`}>
                    {s.confidence}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">Reason: {s.reason}</p>
                <p className="text-xs text-muted-foreground mt-1">Recommended: keep {s.keep}</p>
                <p className="text-xs text-muted-foreground/70 mt-2 pt-2 border-t">
                  Use Find Overlapping Tags above to investigate, then merge in Phase 3 (coming soon)
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Rename dialog */}
      <Dialog open={!!renamingTag} onOpenChange={(o) => !o && !renaming && setRenamingTag(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Renaming: {renamingTag ? toTitleCase(renamingTag.tag) : ""}</DialogTitle>
          </DialogHeader>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="New tag name"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            autoFocus
          />
          {renameIsDuplicate && (
            <p className="text-xs text-destructive">A tag with this name already exists.</p>
          )}
          {renamingTag && renamingTag.count > 0 && (
            <p className="text-xs text-muted-foreground">
              This will update {renamingTag.count} highlight{renamingTag.count !== 1 ? "s" : ""}.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingTag(null)} disabled={renaming}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!renameValid || renaming}>
              {renaming ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add tag dialog */}
      <Dialog open={addingTag} onOpenChange={(o) => { if (!o) { setAddingTag(false); setNewTagValue(""); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a tag</DialogTitle>
          </DialogHeader>
          <input
            type="text"
            value={newTagValue}
            onChange={(e) => setNewTagValue(e.target.value)}
            placeholder="Tag name"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            autoFocus
          />
          {newTagIsDuplicate && (
            <p className="text-xs text-destructive">This tag already exists.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddingTag(false); setNewTagValue(""); }}>
              Cancel
            </Button>
            <Button onClick={handleAddTag} disabled={!newTagValid}>
              Add tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDeleteTag} onOpenChange={(o) => !o && setConfirmDeleteTag(null)}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDeleteTag ? toTitleCase(confirmDeleteTag.tag) : ""}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This tag isn't on any highlight, so there's nothing to update in the database.
              You'll still need to remove it from src/lib/tags.ts yourself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminTagManagement;
