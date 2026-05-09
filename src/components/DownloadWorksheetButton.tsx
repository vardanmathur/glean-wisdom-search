import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import type { Highlight } from "@/lib/data";
import {
  generateWorksheetPdf,
  sanitizeQueryForFilename,
  triggerBrowserDownload,
  uploadWorksheet,
  recordWorksheetDownload,
} from "@/lib/worksheet";

interface Props {
  query: string;
  synthesis: string;
  highlights: Highlight[];
  disabled?: boolean;
}

interface Snapshot {
  query: string;
  synthesis: string;
  highlights: Highlight[];
  ts: number;
}

const SS_KEY = "glean:pending-worksheet";
const TEN_MIN = 10 * 60 * 1000;

const DownloadWorksheetButton = ({ query, synthesis, highlights, disabled }: Props) => {
  const { user, authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const autoRanRef = useRef(false);

  const generate = async (snapshot?: Snapshot) => {
    const q = snapshot?.query ?? query;
    const syn = snapshot?.synthesis ?? synthesis;
    const hl = snapshot?.highlights ?? highlights;

    if (!q || !syn || hl.length === 0) {
      toast.error("Worksheet data not ready yet — try again in a moment.");
      return;
    }

    setBusy(true);
    try {
      // 1. Reflection questions
      let questions: string[] = [];
      try {
        const { data, error } = await supabase.functions.invoke("generate-reflection-questions", {
          body: { query: q, synthesis: syn },
        });
        if (error) throw error;
        questions = Array.isArray(data?.questions) ? data.questions : [];
      } catch (e) {
        console.warn("Reflection questions failed, using fallback", e);
      }
      if (questions.length < 4) {
        questions = [
          "What is the real fear underneath this challenge that you have not named yet?",
          "Which piece of this wisdom stings the most, and what does that tell you?",
          "What is the smallest five-minute action you could take tomorrow morning?",
          "Who in your life will you ask to hold you accountable, and when?",
        ];
      }

      // 2. PDF
      const blob = generateWorksheetPdf({ query: q, synthesis: syn, highlights: hl, questions });
      const filename = `glean-worksheet-${sanitizeQueryForFilename(q)}.pdf`;

      // 3. Download (always, even if upload later fails)
      triggerBrowserDownload(blob, filename);
      toast.success("Worksheet downloaded");

      // 4. Upload + DB log (non-blocking)
      if (user) {
        uploadWorksheet(user.id, q, blob).then((path) => {
          recordWorksheetDownload(user.id, q, syn, path);
        });
      }
    } catch (e) {
      console.error("Worksheet generation failed:", e);
      toast.error("Couldn't generate worksheet. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Resume after OAuth redirect
  useEffect(() => {
    if (autoRanRef.current) return;
    if (authLoading) return;
    if (searchParams.get("worksheet") !== "1") return;
    if (!user) return;

    autoRanRef.current = true;

    let snapshot: Snapshot | null = null;
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Snapshot;
        if (
          parsed.query === query &&
          Date.now() - parsed.ts < TEN_MIN &&
          Array.isArray(parsed.highlights) &&
          parsed.highlights.length > 0
        ) {
          snapshot = parsed;
        }
      }
    } catch { /* noop */ }

    sessionStorage.removeItem(SS_KEY);

    // Strip ?worksheet=1 from URL without reload
    const next = new URLSearchParams(searchParams);
    next.delete("worksheet");
    navigate({ pathname: "/search", search: `?${next.toString()}` }, { replace: true });

    // If we have snapshot, use it; else wait for live data and use whatever is available
    if (snapshot) {
      void generate(snapshot);
    } else {
      // Defer one tick to let live props hydrate
      setTimeout(() => void generate(), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, searchParams]);

  const handleClick = async () => {
    if (busy) return;

    if (!user) {
      // Snapshot current results so we render the SAME content after OAuth
      try {
        const snapshot: Snapshot = { query, synthesis, highlights, ts: Date.now() };
        sessionStorage.setItem(SS_KEY, JSON.stringify(snapshot));
      } catch { /* quota — ignore */ }

      const url = new URL(window.location.href);
      url.searchParams.set("worksheet", "1");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: url.toString(),
      });
      if (result.error) {
        toast.error("Sign-in failed. Try again.");
        sessionStorage.removeItem(SS_KEY);
      }
      // If redirected, browser navigates away — nothing else to do.
      return;
    }

    void generate();
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={handleClick}
      disabled={disabled || busy}
      className="gap-2"
    >
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing…
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          Download Worksheet
        </>
      )}
    </Button>
  );
};

export default DownloadWorksheetButton;
