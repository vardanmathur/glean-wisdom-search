import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Compass, X } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAllTags } from "@/hooks/useAllTags";
import StudioAddHighlightModal from "@/components/studio/AddHighlightModal";
import QuickMenuArrange from "@/components/QuickMenuArrange";
import {
  BUTTON_SIZE,
  DEFAULT_FRACTION,
  FAN_RADIUS,
  HOLD_MS,
  ITEM_SIZE,
  ORDER_STORAGE_KEY,
  SIDE_STORAGE_KEY,
  STAGGER_MS,
  STORAGE_KEY,
  TAP_THRESHOLD,
  arcOffsets,
  clampCenterX,
  clampCenterY,
  chooseSide,
  defaultOrder,
  fractionToY,
  itemsInOrder,
  mergeOrder,
  moveId,
  parseStoredFraction,
  parseStoredOrder,
  parseStoredSide,
  pinnedCenterX,
  yToFraction,
  type QuickMenuItem,
  type Side,
} from "@/lib/quickMenu";

const FALLBACK_TOP_BAR = 64;

function readStoredFraction(): number {
  try {
    return parseStoredFraction(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_FRACTION;
  }
}

function saveFraction(fraction: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(fraction));
  } catch {
    /* storage unavailable: the position just won't persist */
  }
}

function readStoredSide(): Side {
  try {
    return parseStoredSide(localStorage.getItem(SIDE_STORAGE_KEY));
  } catch {
    return parseStoredSide(null);
  }
}

function saveSide(side: Side) {
  try {
    localStorage.setItem(SIDE_STORAGE_KEY, side);
  } catch {
    /* storage unavailable: the side just won't persist */
  }
}

function readStoredOrder(): string[] {
  try {
    return mergeOrder(parseStoredOrder(localStorage.getItem(ORDER_STORAGE_KEY)));
  } catch {
    return defaultOrder();
  }
}

function saveOrder(ids: string[]) {
  try {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable: the order just won't persist */
  }
}

// env(safe-area-inset-bottom) is only readable through CSS, so measure it with a probe element.
function measureSafeBottom(): number {
  try {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom);visibility:hidden";
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return Number.isFinite(h) ? h : 0;
  } catch {
    return 0;
  }
}

const readTopBar = (): number => {
  const nav = document.querySelector("nav");
  return nav ? Math.max(nav.getBoundingClientRect().bottom, 0) : FALLBACK_TOP_BAR;
};

interface DragState {
  pointerId: number;
  startY: number;
  startX: number;
  startCenter: number;
  startCenterX: number;
  dragging: boolean;
  held: boolean;
}

const QuickMenuInner = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const allTags = useAllTags();

  const [open, setOpen] = useState(false);
  const [fraction, setFraction] = useState(readStoredFraction);
  const [side, setSide] = useState<Side>(readStoredSide);
  const [viewport, setViewport] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
    safeBottom: measureSafeBottom(),
  }));
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [pressed, setPressed] = useState(false);
  const [labelIndex, setLabelIndex] = useState<number | null>(null);
  const [addMounted, setAddMounted] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [order, setOrder] = useState<string[]>(readStoredOrder);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const items = useMemo(() => itemsInOrder(order), [order]);
  const offsets = useMemo(() => arcOffsets(items.length, FAN_RADIUS, side), [items.length, side]);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const drag = useRef<DragState | null>(null);
  const wasOpen = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clamp = useCallback(
    (y: number) => clampCenterY(y, viewport.h, readTopBar(), viewport.safeBottom),
    [viewport.h, viewport.safeBottom],
  );
  const center = clamp(dragPos?.y ?? fractionToY(fraction, viewport.h));
  const centerX = dragPos?.x ?? pinnedCenterX(side, viewport.w);

  // Re-clamp on resize and orientation change.
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight, safeBottom: measureSafeBottom() });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // A route change closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  // Escape closes it from anywhere.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the first item on open; give focus back to the button on close.
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => itemRefs.current[0]?.focus());
      wasOpen.current = true;
      return () => cancelAnimationFrame(id);
    }
    setLabelIndex(null);
    if (wasOpen.current) {
      wasOpen.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  const updateOrder = (ids: string[]) => {
    setOrder(ids);
    saveOrder(ids);
  };

  const clearHold = () => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  useEffect(() => clearHold, []);

  const run = (item: QuickMenuItem) => {
    setOpen(false);
    if (item.to) navigate(item.to);
    else if (item.action === "add-highlight") {
      setAddMounted(true);
      setAddOpen(true);
    }
  };

  // ---- dragging the button; on release it snaps to the nearer side edge ----
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressed(true);
    const state: DragState = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startX: e.clientX,
      startCenter: center,
      startCenterX: centerX,
      dragging: false,
      held: false,
    };
    drag.current = state;
    clearHold();
    // Press and hold without moving opens "Arrange quick menu".
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      if (drag.current === state && !state.dragging) {
        state.held = true;
        setOpen(false);
        setArrangeOpen(true);
      }
    }, HOLD_MS);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.dragging && !d.held && Math.hypot(e.clientX - d.startX, dy) > TAP_THRESHOLD) {
      d.dragging = true;
      clearHold();
      setOpen(false);
    }
    if (d.dragging && !d.held) {
      setDragPos({
        x: clampCenterX(d.startCenterX + (e.clientX - d.startX), viewport.w),
        y: clamp(d.startCenter + dy),
      });
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    clearHold();
    setPressed(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.held) return; // a hold opened the arrange window; it must not also toggle the fan
    if (!d.dragging) {
      setOpen((o) => !o);
      return;
    }
    const finalY = clamp(d.startCenter + (e.clientY - d.startY));
    const finalX = clampCenterX(d.startCenterX + (e.clientX - d.startX), viewport.w);
    const nextSide = chooseSide(finalX, viewport.w);
    const next = yToFraction(finalY, viewport.h);
    setSide(nextSide);
    setFraction(next);
    setDragPos(null);
    saveSide(nextSide);
    saveFraction(next);
  };

  const onPointerCancel = () => {
    drag.current = null;
    clearHold();
    setPressed(false);
    setDragPos(null);
  };

  // Keyboard activation arrives as a click with detail 0; pointer clicks are handled on pointerup.
  const onButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0) setOpen((o) => !o);
  };

  // ---- keyboard navigation inside the fan ----
  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current;
    const current = items.findIndex((el) => el === document.activeElement);
    const move = (to: number) => {
      e.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown" || e.key === "ArrowRight") move(current + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") move(current <= 0 ? items.length - 1 : current - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(items.length - 1);
  };

  const containerStyle = { left: centerX - BUTTON_SIZE / 2, top: center - BUTTON_SIZE / 2, width: BUTTON_SIZE, height: BUTTON_SIZE };
  const buttonActive = open || pressed || dragPos !== null;
  const inset = (BUTTON_SIZE - ITEM_SIZE) / 2;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[39] bg-background/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed z-40 ${dragPos ? "" : "transition-[left,top] duration-200 ease-out motion-reduce:transition-none"}`}
        style={containerStyle}
      >
        <div
          role="menu"
          aria-label="Quick menu shortcuts"
          onKeyDown={onMenuKeyDown}
          className="absolute inset-0"
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            const { x, y } = offsets[i];
            return (
              <button
                key={item.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                aria-label={item.label}
                tabIndex={open ? 0 : -1}
                onClick={() => run(item)}
                onPointerEnter={() => setLabelIndex(i)}
                onPointerDown={() => setLabelIndex(i)}
                onPointerLeave={() => setLabelIndex((cur) => (cur === i ? null : cur))}
                onFocus={(e) => {
                  if (e.currentTarget.matches(":focus-visible")) setLabelIndex(i);
                }}
                onBlur={() => setLabelIndex((cur) => (cur === i ? null : cur))}
                className={`absolute flex items-center justify-center rounded-full border bg-card text-foreground shadow-md transition-[transform,opacity,visibility] duration-200 ease-out hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                  open ? "visible opacity-100" : "invisible pointer-events-none opacity-0"
                }`}
                style={{
                  width: ITEM_SIZE,
                  height: ITEM_SIZE,
                  left: inset + x,
                  top: inset + y,
                  transform: open ? "translate(0px, 0px) scale(1)" : `translate(${-x}px, ${-y}px) scale(0.3)`,
                  transitionDelay: open ? `${i * STAGGER_MS}ms` : "0ms",
                  zIndex: labelIndex === i ? 20 : 1,
                }}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {open && labelIndex === i && (
                  <span className={`pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap ${side === "left" ? "left-full ml-2" : "right-full mr-2"} rounded-md bg-foreground px-2 py-1 text-xs text-background shadow`}>
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          ref={buttonRef}
          type="button"
          aria-label="Quick menu"
          aria-haspopup="menu"
          aria-expanded={open}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={onButtonClick}
          onContextMenu={(e) => e.preventDefault()}
          className={`absolute inset-0 flex touch-none select-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-opacity duration-200 motion-reduce:transition-none [@media(hover:hover)]:hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${buttonActive ? "opacity-100" : "opacity-50"}`}
          style={{ touchAction: "none" }}
        >
          {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Compass className="h-6 w-6" aria-hidden="true" />}
        </button>
      </div>

      <QuickMenuArrange
        open={arrangeOpen}
        onOpenChange={setArrangeOpen}
        items={items}
        onMove={(index, delta) => updateOrder(moveId(order, index, delta))}
        onReset={() => updateOrder(defaultOrder())}
      />

      {addMounted && (
        <StudioAddHighlightModal
          open={addOpen}
          onOpenChange={setAddOpen}
          allTags={allTags}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["user-studio-highlights"] });
            queryClient.invalidateQueries({ queryKey: ["studio-highlights"] });
          }}
        />
      )}
    </>
  );
};

// Admin-only: renders nothing while the role check loads, for non-admins, or on /auth.
const QuickMenu = () => {
  const { isAdmin, loading } = useIsAdmin();
  const { pathname } = useLocation();
  if (loading || !isAdmin || pathname === "/auth") return null;
  return <QuickMenuInner />;
};

export default QuickMenu;
