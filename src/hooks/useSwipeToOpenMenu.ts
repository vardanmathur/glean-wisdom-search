import { useEffect, useRef } from "react";
import { isRightSwipe, isSwipeStartZone, isTypingTarget } from "@/lib/swipe";

// Swipe right to open the mobile menu. Phones only (the same breakpoint as the hamburger's `sm:hidden`).
export const MENU_SWIPE_MAX_WIDTH = 640;
export const MENU_SWIPE_MIN_DISTANCE = 70;
export const MENU_SWIPE_RATIO = 2;
export const MENU_SWIPE_EDGE = 32;

// Taps and drags that belong to something else must never open the menu.
const INTERACTIVE = "button, a, input, textarea, select, label, [role=button], [role=slider], [role=link], [aria-label='Quick menu']";
// The quick menu's own fan is always in the page (its icons are just hidden), so it is counted only while expanded.
const OVERLAYS =
  "[role=dialog], [role=alertdialog], [role=menu]:not([aria-label='Quick menu shortcuts']), [role=listbox], [data-radix-popper-content-wrapper]";
const QUICK_MENU_OPEN = "[aria-label='Quick menu'][aria-expanded='true']";

const visible = (el: Element): boolean =>
  getComputedStyle(el).visibility !== "hidden" && el.getClientRects().length > 0;

// True when the touch began inside something that scrolls sideways, where a right swipe means "scroll".
export function insideHorizontalScroller(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    const overflowX = getComputedStyle(el).overflowX;
    if ((overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth) return true;
    el = el.parentElement;
  }
  return false;
}

// True when a dialog, sheet, popover or menu is showing, or the page's scrolling is locked.
export function overlayIsOpen(): boolean {
  if (document.body.hasAttribute("data-scroll-locked")) return true;
  if (document.querySelector(QUICK_MENU_OPEN)) return true;
  return Array.from(document.querySelectorAll(OVERLAYS)).some(visible);
}

export function shouldIgnoreTouchStart(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  if (!el) return true;
  return !!el.closest(INTERACTIVE) || isTypingTarget(el) || insideHorizontalScroller(el) || overlayIsOpen();
}

const pinchZoomed = () => !!window.visualViewport && window.visualViewport.scale > 1.01;

interface Options {
  /** Route and menu state: false on other pages, or while the menu is already open. */
  enabled: boolean;
  onOpen: () => void;
}

// A right swipe that starts away from the screen edges, in clear sideways movement, calls `onOpen`.
// The decision is made when the finger lifts, with passive listeners, so scrolling is never held up.
export function useSwipeToOpenMenu({ enabled, onOpen }: Options): void {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;

    const onStart = (e: TouchEvent) => {
      start = null;
      if (window.innerWidth >= MENU_SWIPE_MAX_WIDTH || e.touches.length !== 1 || pinchZoomed()) return;
      const t = e.touches[0];
      if (!isSwipeStartZone(t.clientX, window.innerWidth, MENU_SWIPE_EDGE)) return;
      if (shouldIgnoreTouchStart(e.target)) return;
      start = { x: t.clientX, y: t.clientY };
    };

    const onEnd = (e: TouchEvent) => {
      const from = start;
      start = null;
      const t = e.changedTouches[0];
      if (!from || !t || e.touches.length > 0) return;
      if (!isRightSwipe({ dx: t.clientX - from.x, dy: t.clientY - from.y }, MENU_SWIPE_MIN_DISTANCE, MENU_SWIPE_RATIO)) return;
      // Things that can change while the finger is down
      if (window.getSelection?.()?.toString().trim()) return;
      if (pinchZoomed() || overlayIsOpen()) return;
      onOpenRef.current();
    };

    const onCancel = () => {
      start = null;
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled]);
}
