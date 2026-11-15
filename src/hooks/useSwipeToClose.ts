import { useEffect, useRef } from "react";
import { isLeftSwipe, isTypingTarget } from "@/lib/swipe";
import { MENU_SWIPE_MIN_DISTANCE, MENU_SWIPE_RATIO } from "@/hooks/useSwipeToOpenMenu";

// Swipe left anywhere on an open side sheet to close it. Same thresholds as the swipe that opens the menu
// (70px, sideways more than twice the vertical movement). Decided when the finger lifts, with passive listeners.
// Pass the sheet's element (null while it is closed).
export function useSwipeToClose(element: HTMLElement | null, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!element) return;
    let start: { x: number; y: number } | null = null;

    const onStart = (e: TouchEvent) => {
      start = null;
      if (e.touches.length !== 1) return;
      const target = e.target instanceof Element ? e.target : null;
      // Sliders and text fields use sideways drags themselves
      if (isTypingTarget(target) || target?.closest("input, textarea, select, [role=slider]")) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onEnd = (e: TouchEvent) => {
      const from = start;
      start = null;
      const t = e.changedTouches[0];
      if (!from || !t || e.touches.length > 0) return;
      if (!isLeftSwipe({ dx: t.clientX - from.x, dy: t.clientY - from.y }, MENU_SWIPE_MIN_DISTANCE, MENU_SWIPE_RATIO)) return;
      if (window.getSelection?.()?.toString().trim()) return;
      onCloseRef.current();
    };

    const onCancel = () => {
      start = null;
    };

    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchend", onEnd, { passive: true });
    element.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("touchcancel", onCancel);
    };
  }, [element]);
}
