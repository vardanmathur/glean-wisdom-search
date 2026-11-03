import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// While an overlay (dialog) is open it owns one extra history entry for the same URL, so the
// phone's Back button closes the overlay instead of leaving the page.
//
//   idle    no entry pushed
//   pushing entry pushed, router has not reported the marker yet
//   active  marker is in location.state while the overlay is open
//   backed  Back closed the overlay; waiting for the parent to flip `open` to false

export type OverlayPhase = "idle" | "pushing" | "active" | "backed";
export type OverlayAction = "push" | "pop" | "close" | null;

export interface OverlayStep {
  phase: OverlayPhase;
  action: OverlayAction;
}

// Pure state machine. push = add the entry, pop = remove it with navigate(-1),
// close = the user pressed Back, so tell the parent to close.
export function overlayStep(phase: OverlayPhase, input: { open: boolean; markerPresent: boolean }): OverlayStep {
  const { open, markerPresent } = input;
  switch (phase) {
    case "idle":
      return open ? { phase: "pushing", action: "push" } : { phase: "idle", action: null };
    case "pushing":
      if (!markerPresent) return { phase: "pushing", action: null };
      return open ? { phase: "active", action: null } : { phase: "idle", action: "pop" };
    case "active":
      if (!open) return markerPresent ? { phase: "idle", action: "pop" } : { phase: "idle", action: null };
      return markerPresent ? { phase: "active", action: null } : { phase: "backed", action: "close" };
    case "backed":
      return open ? { phase: "backed", action: null } : { phase: "idle", action: null };
  }
}

const newOverlayId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function useCloseOnBack(open: boolean, onClose: () => void): void {
  const navigate = useNavigate();
  const location = useLocation();
  const phase = useRef<OverlayPhase>("idle");
  const overlayId = useRef<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const state = (location.state ?? {}) as Record<string, unknown>;
    const markerPresent = overlayId.current !== null && state.overlay === overlayId.current;
    const step = overlayStep(phase.current, { open, markerPresent });
    phase.current = step.phase;

    if (step.action === "push") {
      overlayId.current = newOverlayId();
      navigate(location, { state: { ...state, overlay: overlayId.current } });
    } else if (step.action === "pop") {
      navigate(-1);
    } else if (step.action === "close") {
      onCloseRef.current();
    }
  }, [open, location, navigate]);
}
