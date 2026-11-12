// Swipe detection for the Inspire Me card. Pure, so the rules can be tested.

export const SWIPE_MIN_DISTANCE = 60;
export const SWIPE_RATIO = 1.5;

export interface Movement {
  /** Finger movement: end minus start, in px. Negative dx = moved left. */
  dx: number;
  dy: number;
}

// A left swipe: clearly sideways (at least 60px, and more than 1.5 times the vertical movement),
// so scrolling a long quote never counts. Right swipes and anything short or vertical do not.
export function isLeftSwipe({ dx, dy }: Movement, minDistance = SWIPE_MIN_DISTANCE, ratio = SWIPE_RATIO): boolean {
  return dx <= -minDistance && Math.abs(dx) > ratio * Math.abs(dy);
}

// Keys that should not shuffle because the user is typing.
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}
