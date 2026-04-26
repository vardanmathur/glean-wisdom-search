import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Camera, X } from "lucide-react";
import { toast } from "sonner";
import BookLookup, { type SelectedBook } from "./BookLookup";
import { useIsMobile } from "@/hooks/use-mobile";

interface AddHighlightModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  allTags: string[];
}

const StudioAddHighlightModal = ({ open, onOpenChange, onCreated, allTags }: AddHighlightModalProps) => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"type" | "scan">("type");

  const [quote, setQuote] = useState("");
  const [book, setBook] = useState<SelectedBook | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [saving, setSaving] = useState(false);

  // Scan tab state — Tesseract loaded lazily on first open
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrInitialised, setOcrInitialised] = useState(false);

  const reset = () => {
    setQuote("");
    setBook(null);
    setTags([]);
    setTagInput("");
    setNotes("");
    setVisibility("private");
    setTab("type");
    stopCamera();
  };

  useEffect(() => {
    if (!open) reset();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch (err) {
      console.error("Camera error:", err);
      toast.error("Couldn't access camera");
    }
  };

  // Attach stream once the <video> element is mounted (cameraOn flips it into the DOM)
  useEffect(() => {
    if (!cameraOn) return;
    const v = videoRef.current;
    const s = streamRef.current;
    if (!v || !s) return;
    v.srcObject = s;
    v.play().catch((err) => console.warn("video.play() failed:", err));
  }, [cameraOn]);

  const captureAndOcr = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setOcrLoading(true);
    try {
      const Tesseract = (await import("tesseract.js")).default;
      setOcrInitialised(true);
      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("blob fail"))), "image/jpeg", 0.9),
      );
      const { data } = await Tesseract.recognize(blob, "eng");
      const cleaned = data.text.replace(/\s+\n/g, "\n").replace(/\n{2,}/g, "\n\n").trim();
      setQuote(cleaned);
      stopCamera();
      toast.success("Text extracted — review and edit if needed");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't read text from image");
    } finally {
      setOcrLoading(false);
    }
  };

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };
  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const tagSuggestions = (() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    return allTags
      .filter((t) => !tags.includes(t) && t.toLowerCase().includes(q))
      .sort((a, b) => {
        const aS = a.toLowerCase().startsWith(q);
        const bS = b.toLowerCase().startsWith(q);
        if (aS && !bS) return -1;
        if (!aS && bS) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 8);
  })();

  const canSave = !!user && quote.trim().length > 0 && !!book && !saving;

  const handleSave = async () => {
    if (!user) return;
    if (!quote.trim()) { toast.error("Quote is required"); return; }
    if (!book) { toast.error("Pick a book first"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("highlights").insert({
        quote: quote.trim(),
        book_id: book.id,
        my_notes: notes.trim() || null,
        tags,
        visibility,
        source: "user",
        user_id: user.id,
        stars: false,
        reported: false,
      });
      if (error) throw error;
      toast.success("Highlight added");
      onCreated();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save — please try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Add a highlight</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "type" | "scan")} className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="type">Type it</TabsTrigger>
            <TabsTrigger value="scan">Scan text</TabsTrigger>
          </TabsList>

          <TabsContent value="type" className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quote</label>
              <Textarea
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                rows={5}
                placeholder="Type or paste the passage…"
              />
            </div>
          </TabsContent>

          <TabsContent value="scan" className="space-y-3 mt-4">
            <div className="rounded-md border bg-card p-3 space-y-2">
              {!cameraOn ? (
                <Button type="button" onClick={openCamera} className="gap-1.5">
                  <Camera className="h-4 w-4" /> Open camera
                </Button>
              ) : isMobile ? (
                <>
                  <p className="text-xs text-muted-foreground">Camera is open in fullscreen — use the bottom toolbar to capture or stop.</p>
                  <div className="fixed inset-0 z-50 bg-black flex flex-col">
                    <video
                      ref={videoRef}
                      className="flex-1 w-full h-full object-contain bg-black"
                      muted
                      playsInline
                      autoPlay
                    />
                    <div className="fixed bottom-0 left-0 right-0 z-[51] flex gap-2 justify-center p-4 bg-black/80 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                      <Button type="button" size="lg" onClick={captureAndOcr} disabled={ocrLoading}>
                        {ocrLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        {ocrLoading ? "Reading text…" : "Capture & read text"}
                      </Button>
                      <Button type="button" size="lg" variant="outline" onClick={stopCamera}>Stop</Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <video ref={videoRef} className="w-full rounded-md bg-black aspect-video" muted playsInline autoPlay />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={captureAndOcr} disabled={ocrLoading}>
                      {ocrLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      {ocrLoading ? "Reading text…" : "Capture & read text"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={stopCamera}>Stop</Button>
                  </div>
                  {!ocrInitialised && (
                    <p className="text-xs text-muted-foreground">First scan downloads the OCR model — ~2-3 MB.</p>
                  )}
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Extracted text — edit before saving</label>
              <Textarea
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                rows={5}
                placeholder="OCR results will appear here…"
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Shared fields below tabs */}
        <div className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Book <span className="text-destructive">*</span>
            </label>
            <BookLookup selectedBook={book} onSelect={setBook} onClear={() => setBook(null)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeTag(t)}>
                  {t}
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
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {tagInput && tagSuggestions.length > 0 && (
                <div className="absolute z-10 top-full left-0 mt-1 w-full bg-card border rounded-md shadow-md max-h-40 overflow-y-auto">
                  {tagSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                      onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Why does this matter to you? (optional)"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Visibility</label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={visibility === "private" ? "default" : "outline"}
                onClick={() => setVisibility("private")}
              >
                Private (only you)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={visibility === "public" ? "default" : "outline"}
                onClick={() => setVisibility("public")}
              >
                Public (visible to all)
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!canSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save highlight
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StudioAddHighlightModal;
