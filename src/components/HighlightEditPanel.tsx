import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";
import { Highlight } from "@/lib/data";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import { X, Sparkles, Loader2 } from "lucide-react";
import { toast as sonnerToast } from "sonner";

const DRAFT_PREFIX = "glean_card_edit_draft";

interface HighlightEditPanelProps {
  highlight: Highlight | null;
  allTags: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Slide-out editor for highlights, used inline from HighlightCard by admins.
 * - side="bottom" on mobile, side="right" on desktop.
 * - Drafts persisted to sessionStorage so window switches / PWA backgrounding
 *   don't lose work.
 * - On save, fires a non-awaited generate-embeddings call to refresh the
 *   vector for the edited row.
 */
const HighlightEditPanel = ({ highlight, allTags, open, onOpenChange }: HighlightEditPanelProps) => {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const draftKey = `${DRAFT_PREFIX}_${highlight?.id ?? "none"}`;

  const [quote, setQuote, clearQuote] = useSessionStorageState<string>(`${draftKey}_quote`, "");
  const [tags, setTags, clearTags] = useSessionStorageState<string[]>(`${draftKey}_tags`, []);
  const [notes, setNotes, clearNotes] = useSessionStorageState<string>(`${draftKey}_notes`, "");
  const [visibility, setVisibility, clearVisibility] = useSessionStorageState<string>(`${draftKey}_visibility`, "public");
  const [tagInput, setTagInput, clearTagInput] = useSessionStorageState<string>(`${draftKey}_tagInput`, "");

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [hasFetchedSuggestions, setHasFetchedSuggestions] = useState(false);
  const [lastSuggestedQuote, setLastSuggestedQuote] = useState<string>("");

  // Always hydrate from server data on open / id change. sessionStorage is for
  // surviving mid-edit window switches, not persisting across reopens.
  useEffect(() => {
    if (!highlight) return;
    setQuote(highlight.text);
    setTags(highlight.tags ?? []);
    setNotes(highlight.myNotes ?? "");
    setVisibility(highlight.visibility ?? "public");
    setTagInput("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight?.id, open]);

  const isDirty =
    !!highlight &&
    (quote !== highlight.text ||
      JSON.stringify(tags) !== JSON.stringify(highlight.tags ?? []) ||
      notes !== (highlight.myNotes ?? "") ||
      visibility !== (highlight.visibility ?? "public"));

  const clearDraft = () => {
    clearQuote();
    clearTags();
    clearNotes();
    clearVisibility();
    clearTagInput();
    setSuggestedTags([]);
    setHasFetchedSuggestions(false);
    setLastSuggestedQuote("");
  };

  const handleSuggestTags = async () => {
    const q = quote.trim();
    if (q.length < 20 || suggesting) return;
    setSuggesting(true);
    try {
      const { data, error } = await supabase.rpc(
        "suggest_tags_for_quote" as any,
        { quote_text: q } as any
      );
      if (error) throw error;
      const rpcTags = Array.isArray(data) ? (data as string[]) : [];
      let finalTags: string[] = rpcTags;
      if (rpcTags.length === 0) {
        try {
          const { data: sem } = await supabase.functions.invoke(
            "search-semantic",
            { body: { query: q, wordCount: q.split(/\s+/).filter(Boolean).length } }
          );
          const rows: Array<{ tags?: string[] }> = Array.isArray(sem?.results)
            ? sem.results.slice(0, 10) : [];
          const seen = new Set<string>();
          for (const r of rows) {
            for (const t of r.tags ?? []) {
              const norm = String(t).trim().toLowerCase();
              if (norm) seen.add(norm);
            }
          }
          finalTags = Array.from(seen).slice(0, 8);
        } catch { finalTags = []; }
      }
      setSuggestedTags(finalTags);
      setLastSuggestedQuote(q);
      setHasFetchedSuggestions(true);
    } catch (err) {
      console.error(err);
      sonnerToast.error("Couldn't fetch suggestions");
    } finally {
      setSuggesting(false);
    }
  };

  useEffect(() => {
    if (!hasFetchedSuggestions) return;
    if (Math.abs(quote.length - lastSuggestedQuote.length) > 10) {
      setSuggestedTags([]);
      setHasFetchedSuggestions(false);
      setLastSuggestedQuote("");
    }
  }, [quote, hasFetchedSuggestions, lastSuggestedQuote]);

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (t && !tags.some((existing) => existing.toLowerCase() === t.toLowerCase())) {
      setTags([...tags, t]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const input = tagInput.toLowerCase();
  const filteredSuggestions = allTags
    .filter((t) => !tags.some((existing) => existing.toLowerCase() === t.toLowerCase()) && t.toLowerCase().includes(input))
    .sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(input);
      const bStarts = b.toLowerCase().startsWith(input);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.localeCompare(b);
    })
    .slice(0, 20);

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase.from("highlights").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      toast({ title: "Highlight updated" });
      // Fire-and-forget embedding refresh — don't block the UI.
      supabase.functions
        .invoke("generate-embeddings", { body: { ids: [id], force: true } })
        .catch(() => { /* silent — surfaced in admin studio if needed */ });
      // Invalidate any cached highlight lists so the card reflects new content.
      queryClient.invalidateQueries();
      clearDraft();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!highlight) return;
    updateMutation.mutate({
      id: highlight.id,
      updates: {
        quote: quote.trim(),
        tags,
        my_notes: notes.trim() || null,
        visibility,
      },
    });
  };

  const handleClose = () => {
    if (isDirty) {
      setConfirmDiscard(true);
      return;
    }
    clearDraft();
    onOpenChange(false);
  };

  const confirmDiscardClose = () => {
    clearDraft();
    setConfirmDiscard(false);
    onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={
            isMobile
              ? "w-screen max-w-full h-[90vh] overflow-y-auto"
              : "w-full sm:w-[480px] sm:max-w-[480px] overflow-y-auto"
          }
        >
          <SheetHeader>
            <SheetTitle>Edit Highlight</SheetTitle>
            <SheetDescription className="text-xs">
              {highlight?.bookTitle ?? "Unknown book"}
              {highlight?.author ? ` — ${highlight.author}` : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Quote</label>
              <Textarea
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                rows={6}
                className="text-sm leading-relaxed"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Tags</label>
                <button
                  type="button"
                  onClick={handleSuggestTags}
                  disabled={quote.trim().length < 20 || suggesting}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
                >
                  {suggesting
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Sparkles className="h-3.5 w-3.5" />}
                  {suggesting ? "Suggesting…" : "Suggest tags"}
                </button>
              </div>
              {!suggesting && suggestedTags.filter(s => !tags.includes(s)).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestedTags.filter(s => !tags.includes(s)).map(s => (
                    <button key={s} type="button"
                      onClick={() => { addTag(s); setSuggestedTags(p => p.filter(x => x !== s)); }}
                      className="rounded-full bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1 text-xs font-medium transition-colors">
                      + {s}
                    </button>
                  ))}
                </div>
              )}
              {!suggesting && hasFetchedSuggestions && suggestedTags.filter(s => !tags.includes(s)).length === 0 && (
                <span className="block text-xs text-muted-foreground italic">
                  No suggestions available
                </span>
              )}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="gap-1 cursor-pointer"
                    onClick={() => removeTag(tag)}
                  >
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
                        type="button"
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
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Add your notes…"
                className="text-sm"
              />
            </div>

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

            <div className="flex gap-3">
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending || !quote.trim()}
                className="flex-1"
              >
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={updateMutation.isPending}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits to this highlight will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDiscardClose}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default HighlightEditPanel;
