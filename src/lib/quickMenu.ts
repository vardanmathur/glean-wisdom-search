import {
  BookOpen,
  Inbox,
  Layers,
  LayoutDashboard,
  Plus,
  Search,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// Admin quick menu. The array order is the position on the arc, top to bottom.
export type QuickMenuAction = "add-highlight";

export interface QuickMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  action?: QuickMenuAction;
}

export const QUICK_MENU_ITEMS: QuickMenuItem[] = [
  { id: "admin-hub", label: "Admin Hub", icon: LayoutDashboard, to: "/admin" },
  { id: "inbox", label: "Inbox", icon: Inbox, to: "/admin/backlog" },
  { id: "studio", label: "Admin Studio", icon: Wrench, to: "/admin/studio/highlights" },
  { id: "add-highlight", label: "Add highlight", icon: Plus, action: "add-highlight" },
  { id: "search", label: "Search", icon: Search, to: "/" },
  { id: "books", label: "Books", icon: BookOpen, to: "/admin/books" },
  { id: "overlap-review", label: "Overlap review", icon: Layers, to: "/admin/tag-management?tab=overlaps" },
];

// Sizes in px.
export const BUTTON_SIZE = 56;
export const ITEM_SIZE = 48;
export const FAN_RADIUS = 110;
export const EDGE_INSET = 16;
export const TAP_THRESHOLD = 8;
export const STAGGER_MS = 25;
export const DEFAULT_FRACTION = 0.8;
export const STORAGE_KEY = "glean_quick_menu_y";

export interface Offset {
  x: number;
  y: number;
}

const tidy = (n: number): number => Math.round(n * 100) / 100 + 0;

// Offsets from the button's centre, on a half-circle opening to the right:
// first item straight up (-90deg), last straight down (+90deg), evenly spaced.
// y grows downward, so straight up is a negative y.
export function arcOffsets(count: number, radius: number = FAN_RADIUS): Offset[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: tidy(radius), y: 0 }];
  return Array.from({ length: count }, (_, i) => {
    const angle = ((-90 + (180 * i) / (count - 1)) * Math.PI) / 180;
    return { x: tidy(radius * Math.cos(angle)), y: tidy(radius * Math.sin(angle)) };
  });
}

// Keeps the button's centre far enough from the top bar and the bottom of the
// screen that the whole fan stays visible. If the screen is too short for that,
// the centre goes to the middle of the available band.
export function clampCenterY(
  y: number,
  viewportHeight: number,
  topInset: number,
  bottomInset: number,
  radius: number = FAN_RADIUS,
  itemSize: number = ITEM_SIZE,
): number {
  const min = topInset + radius + itemSize / 2;
  const max = viewportHeight - bottomInset - radius - itemSize / 2;
  if (max < min) return (topInset + viewportHeight - bottomInset) / 2;
  return Math.min(Math.max(y, min), max);
}

export const fractionToY = (fraction: number, viewportHeight: number): number => fraction * viewportHeight;

export const yToFraction = (y: number, viewportHeight: number): number =>
  viewportHeight > 0 ? y / viewportHeight : DEFAULT_FRACTION;

// Saved value -> usable fraction (0..1), else the default.
export function parseStoredFraction(raw: string | null): number {
  if (raw === null) return DEFAULT_FRACTION;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_FRACTION;
}
