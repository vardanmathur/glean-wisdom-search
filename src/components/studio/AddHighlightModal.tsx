import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Camera, X, Mic, Sparkles } from "lucide-react";
import { toast } from "sonner";
import BookLookup, { type SelectedBook } from "./BookLookup";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";
import { synonymMap } from "@/lib/data";

const DRAFT_KEY = "glean_add_highlight_draft"; // suggest-tags v1

interface AddHighlightModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  allTags: string[];
}

const StudioAddHighlightModal = ({ open, onOpenChange, onCreated, allTags }: AddHighlightModalProps) => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab, clearTab] = useSessionStorageState<"type" | "dictate" | "scan">(`${DRAFT_KEY}_tab`, "type");

  const [quote, setQuote, clearQuote] = useSessionStorageState<string>(`${DRAFT_KEY}_quote`, "");
  const [book, setBook, clearBook] = useSessionStorageState<SelectedBook | null>(`${DRAFT_KEY}_book`, null);
  const [tags, setTags, clearTags] = useSessionStorageState<string[]>(`${DRAFT_KEY}_tags`, []);
  const [tagInput, setTagInput, clearTagInput] = useSessionStorageState<string>(`${DRAFT_KEY}_tagInput`, "");
  const [notes, setNotes, clearNotes] = useSessionStorageState<string>(`${DRAFT_KEY}_notes`, "");
  const [visibility, setVisibility, clearVisibility] = useSessionStorageState<"private" | "public">(`${DRAFT_KEY}_visibility`, "private");
  const [saving, setSaving] = useState(false);

  // Scan tab state — Tesseract loaded lazily on first open
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrInitialised, setOcrInitialised] = useState(false);

  // Dictate tab state
  const [dictatedText, setDictatedText, clearDictatedText] = useSessionStorageState<string>(
    "glean_add_highlight_draft_dictated",
    "",
  );
  const [interimText, setInterimText] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const shouldKeepListeningRef = useRef<boolean>(false);
  const speechSupported =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Tag suggestion state (ephemeral — not persisted)
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [hasFetchedSuggestions, setHasFetchedSuggestions] = useState(false);
  const [lastSuggestedQuote, setLastSuggestedQuote] = useState<string>("");

  const reset = () => {
    clearQuote();
    clearBook();
    clearTags();
    clearTagInput();
    clearNotes();
    clearVisibility();
    clearTab();
    clearDictatedText();
    stopCamera();
    stopDictation();
  };

  // Track previous open state so reset only fires on an explicit open→close
  // transition. Without this, any incidental re-render where `open` is already
  // false (e.g. parent re-renders triggered by window blur / tab switch) could
  // wipe the form.
  const prevOpenRef = useRef(open);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (wasOpen && !open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Always release the camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      stopDictation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDictation = () => {
    if (!speechSupported) return;
    const Ctor: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    try {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = navigator.language || "en-US";
      rec.onresult = (event: any) => {
        let interim = "";
        let finalChunk = "";
        for (let i = lastResultIndexRef.current; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0]?.transcript ?? "";
          if (res.isFinal) {
            finalChunk += transcript;
            lastResultIndexRef.current = i + 1;
          } else {
            interim += transcript;
          }
        }
        if (finalChunk) {
          setDictatedText((prev) => {
            const sep = prev && !/\s$/.test(prev) ? " " : "";
            const next = (prev + sep + finalChunk).replace(/\s+/g, " ").trimStart();
            // Auto-mirror finals into the shared quote so save flow works.
            setQuote(next);
            return next;
          });
        }
        setInterimText(interim);
      };
      rec.onerror = (e: any) => {
        console.warn("SpeechRecognition error:", e?.error);
        setInterimText("");
        setListening(false);
      };
      rec.onend = () => {
        setInterimText("");
        setListening(false);
      };
      recognitionRef.current = rec;
      lastResultIndexRef.current = 0;
      rec.start();
      setListening(true);
    } catch (err) {
      console.error("Failed to start dictation:", err);
      toast.error("Couldn't start dictation");
      setListening(false);
    }
  };

  const stopDictation = () => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    }
    setInterimText("");
    setListening(false);
  };

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

  const suggestTagsFromSynonyms = (text: string): string[] => {
    const words = Array.from(
      new Set(
        text
          .split(/\s+/)
          .map((w) => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
          .filter((w) => w.length >= 4),
      ),
    );
    const freq = new Map<string, number>();
    for (const word of words) {
      for (const [key, mappedTags] of Object.entries(synonymMap)) {
        if (word === key || word.startsWith(key) || key.startsWith(word)) {
          for (const tag of mappedTags) {
            freq.set(tag, (freq.get(tag) ?? 0) + 1);
          }
        }
      }
    }
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([tag]) => tag);
  };

  const handleSuggestTags = async () => {
    const q = quote.trim();
    if (q.length < 20 || suggesting) return;
    setSuggesting(true);
    try {
      const { data, error } = await supabase.rpc("suggest_tags_for_quote", { quote_text: q });
      if (error) throw error;
      const rpcTags = Array.isArray(data) ? (data as string[]) : [];
      const finalTags = rpcTags.length > 0 ? rpcTags : suggestTagsFromSynonyms(q);
      setSuggestedTags(finalTags);
      setLastSuggestedQuote(q);
      setHasFetchedSuggestions(true);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't fetch suggestions");
    } finally {
      setSuggesting(false);
    }
  };

  // Clear suggestions when quote drifts >10 chars from when fetched
  useEffect(() => {
    if (!hasFetchedSuggestions) return;
    if (Math.abs(quote.length - lastSuggestedQuote.length) > 10) {
      setSuggestedTags([]);
      setHasFetchedSuggestions(false);
      setLastSuggestedQuote("");
    }
  }, [quote, hasFetchedSuggestions, lastSuggestedQuote]);

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

        <Tabs
          value={tab}
          onValueChange={(v) => {
            const next = v as "type" | "dictate" | "scan";
            if (next !== "dictate" && listening) stopDictation();
            setTab(next);
          }}
          className="mt-2"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="type">Type it</TabsTrigger>
            <TabsTrigger value="dictate">Dictate</TabsTrigger>
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

          <TabsContent value="dictate" className="space-y-3 mt-4">
            {!speechSupported ? (
              <div className="rounded-md border bg-card p-3">
                <p className="text-sm text-muted-foreground">
                  Voice input is not supported on this browser — try Chrome on Android.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-md border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {!listening ? (
                      <Button type="button" onClick={startDictation} className="gap-1.5">
                        <Mic className="h-4 w-4" /> Start dictating
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={stopDictation}
                        className="gap-1.5"
                      >
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 animate-ping" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
                        </span>
                        Stop
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Works best on Chrome.</p>
                  {listening && interimText && (
                    <p className="text-sm italic text-muted-foreground">{interimText}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Dictated text — edit before saving</label>
                  <Textarea
                    value={dictatedText}
                    onChange={(e) => {
                      setDictatedText(e.target.value);
                      setQuote(e.target.value);
                    }}
                    rows={5}
                    placeholder="Your dictation will appear here…"
                  />
                </div>
              </>
            )}
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Tags</label>
              <button
                type="button"
                onClick={handleSuggestTags}
                disabled={quote.trim().length < 20 || suggesting}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
              >
                {suggesting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {suggesting ? "Suggesting…" : "Suggest tags"}
              </button>
            </div>
            {!suggesting && suggestedTags.filter((s) => !tags.includes(s)).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestedTags
                  .filter((s) => !tags.includes(s))
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        addTag(s);
                        setSuggestedTags((prev) => prev.filter((x) => x !== s));
                      }}
                      className="rounded-full bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1 text-xs font-medium transition-colors"
                    >
                      + {s}
                    </button>
                  ))}
              </div>
            )}
            {!suggesting &&
              hasFetchedSuggestions &&
              suggestedTags.filter((s) => !tags.includes(s)).length === 0 && (
                <span className="block text-xs text-muted-foreground italic">No suggestions available</span>
              )}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeTag(t)}>
                    {t}
                    <X className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
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
