import { useCallback, useEffect, useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Loader2, Shuffle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import HighlightCard from "@/components/HighlightCard";
import { useCloseOnBack } from "@/hooks/useCloseOnBack";
import { isLeftSwipe, isTypingTarget } from "@/lib/swipe";
import type { Highlight } from "@/lib/data";

interface InspireDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  error: boolean;
  highlight: Highlight | null;
  /** The one handler that picks the next highlight (least shown, not the same book twice). */
  onShuffle: () => void;
}

const LEAVE_MS = 120;

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// "Your daily spark": header, a scrolling body with the card, and a bottom bar with Shuffle that never scrolls
// away. Anchored near the bottom on phones, centred from the sm breakpoint up. Swipe left or press the
// right arrow to shuffle; the phone's Back button closes it.
const InspireDialog = ({ open, onOpenChange, loading, error, highlight, onShuffle }: InspireDialogProps) => {
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  useCloseOnBack(open, () => onOpenChange(false));

  // Button, swipe and arrow key all come through here, so they all behave the same.
  const requestShuffle = useCallback(() => {
    if (loadingRef.current || leavingRef.current) return;
    if (prefersReducedMotion() || !highlight) {
      onShuffle();
      return;
    }
    leavingRef.current = true;
    setLeaving(true);
    window.setTimeout(() => {
      leavingRef.current = false;
      setLeaving(false);
      onShuffle();
    }, LEAVE_MS);
  }, [highlight, onShuffle]);

  // Right arrow shuffles while the popup is open, unless the user is typing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" || e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      requestShuffle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestShuffle]);

  const onTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    touchStart.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  };

  const onTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || loadingRef.current) return;
    const end = e.changedTouches[0];
    if (!end) return;
    // Leave text selection alone: the user may be dragging the handles.
    if (window.getSelection?.()?.toString().trim()) return;
    if (isLeftSwipe({ dx: end.clientX - start.x, dy: end.clientY - start.y })) requestShuffle();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={[
            "fixed z-50 flex flex-col overflow-hidden border bg-background shadow-lg duration-200",
            // phones: near the bottom, full width minus gutters
            "inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] max-h-[85vh] rounded-xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            "data-[state=open]:slide-in-from-bottom-8 data-[state=closed]:slide-out-to-bottom-8",
            // sm and up: today's centred layout
            "sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:w-full sm:max-w-xl sm:max-h-[90vh]",
            "sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg",
            "sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
            "sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]",
            "sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]",
          ].join(" ")}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-6 pb-2 pt-5">
            <DialogTitle className="font-display">Your daily spark</DialogTitle>
            <DialogPrimitive.Close className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          <div
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto px-6 pb-4"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onTouchCancel={() => {
              touchStart.current = null;
            }}
          >
            {loading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            {!loading && error && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">Couldn't load a highlight. Try again.</p>
                <button
                  onClick={onShuffle}
                  className="rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition-all hover:bg-primary/10"
                >
                  Retry
                </button>
              </div>
            )}
            {!loading && !error && highlight && (
              <div
                key={highlight.id}
                className={
                  leaving
                    ? "-translate-x-6 opacity-0 transition-all duration-100 motion-reduce:transition-none"
                    : "animate-in fade-in-0 slide-in-from-right-8 duration-200 motion-reduce:animate-none"
                }
              >
                <HighlightCard highlight={highlight} index={0} />
              </div>
            )}
          </div>

          <div className="flex shrink-0 justify-center border-t bg-background px-4 py-3">
            <Button
              type="button"
              onClick={requestShuffle}
              disabled={loading}
              className="h-12 w-3/5 min-w-[160px] max-w-[280px] gap-2 text-base"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Shuffle className="h-5 w-5" />}
              Shuffle
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
};

export default InspireDialog;
