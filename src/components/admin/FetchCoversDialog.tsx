import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";

interface BookRow {
  id: string;
  title: string;
  author: string;
}

type CoverState = "loading" | "found" | "none";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAGE = 1000;

const fetchCoverFor = async (title: string, author: string): Promise<string | null> => {
  // Open Library title+author search first
  try {
    const ol = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=1`,
    );
    if (ol.ok) {
      const oj = await ol.json();
      const coverId = oj.docs?.[0]?.cover_i;
      if (coverId) return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
    }
  } catch { /* ignore */ }
  // Google Books fallback
  try {
    const gb = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(title + " " + author)}&maxResults=1`,
    );
    if (gb.ok) {
      const gj = await gb.json();
      return gj.items?.[0]?.volumeInfo?.imageLinks?.thumbnail ?? null;
    }
  } catch { /* ignore */ }
  return null;
};

const FetchCoversDialog = ({ open, onOpenChange }: Props) => {
  const [loadingList, setLoadingList] = useState(false);
  const [books, setBooks] = useState<BookRow[]>([]);
  const [index, setIndex] = useState(0);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverState, setCoverState] = useState<CoverState>("loading");
  const [saving, setSaving] = useState(false);

  // Load books needing covers when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoadingList(true);
      setBooks([]);
      setIndex(0);
      try {
        const all: BookRow[] = [];
        let from = 0;
        for (;;) {
          const { data, error } = await supabase
            .from("books")
            .select("id, title, author")
            .or("cover_image_url.is.null,cover_image_url.eq.")
            .order("title")
            .range(from, from + PAGE - 1);
          if (error) throw error;
          const rows = (data ?? []) as BookRow[];
          all.push(...rows);
          if (rows.length < PAGE) break;
          from += PAGE;
        }
        if (!cancelled) setBooks(all);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load books");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open]);

  // Fetch cover for current book
  useEffect(() => {
    if (!open || loadingList || books.length === 0 || index >= books.length) return;
    let cancelled = false;
    const book = books[index];
    setCoverState("loading");
    setCoverUrl(null);
    fetchCoverFor(book.title, book.author).then((url) => {
      if (cancelled) return;
      if (url) {
        setCoverUrl(url);
        setCoverState("found");
      } else {
        setCoverState("none");
      }
    });
    return () => { cancelled = true; };
  }, [open, loadingList, books, index]);

  const advance = () => setIndex((i) => i + 1);

  const handleSave = async () => {
    if (!coverUrl) return;
    const book = books[index];
    setSaving(true);
    try {
      const { error } = await supabase
        .from("books")
        .update({ cover_image_url: coverUrl })
        .eq("id", book.id);
      if (error) throw error;
      toast.success(`Saved cover for ${book.title}`);
      advance();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save cover");
    } finally {
      setSaving(false);
    }
  };

  const done = !loadingList && books.length > 0 && index >= books.length;
  const empty = !loadingList && books.length === 0;
  const current = books[index];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fetch Missing Covers</DialogTitle>
          <DialogDescription>
            Review and approve cover suggestions for books missing artwork.
          </DialogDescription>
        </DialogHeader>

        {loadingList && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading books…
          </div>
        )}

        {empty && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            All books already have covers. Nothing to review.
          </p>
        )}

        {done && (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-foreground">Done — reviewed all books.</p>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        )}

        {!loadingList && current && !done && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Book {index + 1} of {books.length}
            </p>
            <div className="flex gap-4">
              <div className="w-32 h-44 shrink-0 rounded-md border bg-muted flex items-center justify-center overflow-hidden">
                {coverState === "loading" && (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                )}
                {coverState === "found" && coverUrl && (
                  <img src={coverUrl} alt={current.title} className="w-full h-full object-cover" />
                )}
                {coverState === "none" && (
                  <span className="text-xs text-muted-foreground text-center px-2">No cover found</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{current.title}</p>
                <p className="text-sm text-muted-foreground">{current.author}</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={advance}
                disabled={saving || coverState === "loading"}
                className="gap-1.5"
              >
                <X className="h-4 w-4" /> Skip
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || coverState !== "found"}
                className="gap-1.5"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FetchCoversDialog;
