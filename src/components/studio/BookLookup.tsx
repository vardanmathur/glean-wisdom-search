import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ScanBarcode, Pencil, X } from "lucide-react";
import { toast } from "sonner";

export interface SelectedBook {
  id: string;
  title: string;
  author: string;
}

interface BookLookupProps {
  selectedBook: SelectedBook | null;
  onSelect: (book: SelectedBook) => void;
  onClear: () => void;
}

interface BookSuggestion {
  id: string;
  title: string;
  author: string;
}

type Mode = "search" | "scan" | "manual";

const BookLookup = ({ selectedBook, onSelect, onClear }: BookLookupProps) => {
  const [mode, setMode] = useState<Mode>("search");
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<BookSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // ISBN scan state
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<{ stop: () => void } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [resolvingIsbn, setResolvingIsbn] = useState(false);

  // Manual entry state
  const [manualTitle, setManualTitle] = useState("");
  const [manualAuthor, setManualAuthor] = useState("");
  const [creatingManual, setCreatingManual] = useState(false);

  // Live search debounce
  useEffect(() => {
    if (selectedBook || mode !== "search") return;
    const term = search.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    // Strip punctuation so "mans" matches "Man's Search for Meaning"
    const stripped = term.replace(/['\-\.]/g, "");
    setLoading(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("books")
        .select("id, title, author")
        .ilike("title", `%${stripped}%`)
        .order("title")
        .limit(8);
      if (!error) setSuggestions(data ?? []);
      setLoading(false);
      setSearched(true);
    }, 250);
    return () => clearTimeout(t);
  }, [search, mode, selectedBook]);

  // Cleanup scanner on unmount / mode change
  useEffect(() => {
    return () => {
      try { scannerRef.current?.stop(); } catch { /* noop */ }
    };
  }, []);

  useEffect(() => {
    if (mode !== "scan") {
      try { scannerRef.current?.stop(); } catch { /* noop */ }
      scannerRef.current = null;
    }
  }, [mode]);

  const startScan = async () => {
    setScanError(null);
    try {
      // Prefer native BarcodeDetector when available
      const Native = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => {
        detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
      } }).BarcodeDetector;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      if (!videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      let stopped = false;
      const stopAll = () => {
        stopped = true;
        stream.getTracks().forEach((t) => t.stop());
      };
      scannerRef.current = { stop: stopAll };

      if (Native) {
        const detector = new Native({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              const isbn = codes[0].rawValue.replace(/[^0-9Xx]/g, "");
              stopAll();
              await resolveIsbn(isbn);
              return;
            }
          } catch { /* ignore frame errors */ }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } else {
        // Fallback: @zxing/browser
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(videoRef.current, async (result) => {
          if (stopped || !result) return;
          const isbn = result.getText().replace(/[^0-9Xx]/g, "");
          controls.stop();
          stopAll();
          await resolveIsbn(isbn);
        });
        scannerRef.current = {
          stop: () => {
            try { controls.stop(); } catch { /* noop */ }
            stopAll();
          },
        };
      }
    } catch (err) {
      console.error("Scan start failed:", err);
      setScanError("Couldn't access camera. Check permissions and try again.");
    }
  };

  const resolveIsbn = async (isbn: string) => {
    if (!isbn || (isbn.length !== 10 && isbn.length !== 13)) {
      setScanError(`Unrecognised ISBN: ${isbn}`);
      return;
    }
    setResolvingIsbn(true);
    try {
      const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
      if (!res.ok) throw new Error(`Open Library lookup failed (${res.status})`);
      const ol = await res.json();
      const title: string = ol.title ?? "Untitled";
      let author = "Unknown";
      if (Array.isArray(ol.authors) && ol.authors.length > 0) {
        const authorKey = ol.authors[0].key;
        try {
          const ar = await fetch(`https://openlibrary.org${authorKey}.json`);
          if (ar.ok) {
            const aj = await ar.json();
            author = aj.name ?? author;
          }
        } catch { /* keep Unknown */ }
      }
      const coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

      const { data: created, error: insErr } = await supabase
        .from("books")
        .insert({ title, author, isbn, cover_image_url: coverUrl })
        .select("id, title, author")
        .single();
      if (insErr || !created) throw insErr ?? new Error("Insert failed");
      onSelect(created);
      toast.success(`Linked to ${created.title}`);
    } catch (err) {
      console.error(err);
      setScanError("Couldn't look up that ISBN. Try entering manually.");
    } finally {
      setResolvingIsbn(false);
    }
  };

  const createManual = async () => {
    const title = manualTitle.trim();
    const author = manualAuthor.trim();
    if (!title || !author) {
      toast.error("Title and author are required");
      return;
    }
    setCreatingManual(true);
    try {
      const { data, error } = await supabase
        .from("books")
        .insert({ title, author })
        .select("id, title, author")
        .single();
      if (error || !data) throw error;
      onSelect(data);
      toast.success(`Added "${data.title}"`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add book");
    } finally {
      setCreatingManual(false);
    }
  };

  if (selectedBook) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{selectedBook.title}</p>
          <p className="text-xs text-muted-foreground truncate">{selectedBook.author}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear} className="shrink-0">
          <X className="h-3.5 w-3.5 mr-1" /> Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {mode === "search" && (
        <>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search book title…"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {loading && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching…
            </p>
          )}
          {suggestions.length > 0 && (
            <div className="rounded-md border bg-card divide-y max-h-48 overflow-y-auto">
              {suggestions.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onSelect(b)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <span className="font-medium text-foreground">{b.title}</span>
                  <span className="text-muted-foreground"> — {b.author}</span>
                </button>
              ))}
            </div>
          )}
          {searched && !loading && suggestions.length === 0 && (
            <div className="rounded-md border bg-card p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                No matches for "{search.trim()}". Add the book:
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setMode("scan")} className="gap-1.5">
                  <ScanBarcode className="h-3.5 w-3.5" /> Scan ISBN
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setMode("manual")} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Enter manually
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {mode === "scan" && (
        <div className="space-y-2 rounded-md border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Point camera at the book's barcode</p>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("search")}>Back</Button>
          </div>
          <video ref={videoRef} className="w-full rounded-md bg-black aspect-video" muted playsInline />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={startScan} disabled={resolvingIsbn}>
              {resolvingIsbn ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {resolvingIsbn ? "Looking up…" : "Start camera"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setMode("manual")}>
              Enter manually instead
            </Button>
          </div>
          {scanError && <p className="text-xs text-destructive">{scanError}</p>}
        </div>
      )}

      {mode === "manual" && (
        <div className="space-y-2 rounded-md border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Add book manually</p>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("search")}>Back</Button>
          </div>
          <input
            type="text"
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            placeholder="Title"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <input
            type="text"
            value={manualAuthor}
            onChange={(e) => setManualAuthor(e.target.value)}
            placeholder="Author"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="button" size="sm" onClick={createManual} disabled={creatingManual}>
            {creatingManual ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Add book
          </Button>
        </div>
      )}
    </div>
  );
};

export default BookLookup;
