import type { Highlight } from "@/lib/data";

// Client side of "refine this answer". The server-side limits live in
// supabase/functions/synthesise-wisdom/refine.ts; a test keeps the two in step.
export const MAX_REFINE_TURNS = 3;
export const MAX_REFINE_CONTEXT_CHARS = 1000;

export interface RefineAdded {
  id: string;
  tier: NonNullable<Highlight["tier"]>;
}

// One finished refinement. Only successful turns are stored, so a failed one never uses up a turn.
export interface RefineTurn {
  context: string;
  answer: string;
  searchedFor: string;
  added: RefineAdded[];
}

export const turnsLeft = (turns: RefineTurn[]): number => Math.max(0, MAX_REFINE_TURNS - turns.length);
export const canRefine = (turns: RefineTurn[]): boolean => turnsLeft(turns) > 0;

// The text to send: trimmed, empty when there is nothing to send, cut at the limit.
export const cleanContext = (text: string): string => text.trim().slice(0, MAX_REFINE_CONTEXT_CHARS);

export const historyForRequest = (turns: RefineTurn[]) => turns.map((t) => ({ context: t.context, answer: t.answer }));

// Highlights added across all turns, first appearance wins, none that were already in the original results.
export function addedAcrossTurns(turns: RefineTurn[], originalIds: Iterable<string> = []): RefineAdded[] {
  const seen = new Set(originalIds);
  const out: RefineAdded[] = [];
  for (const t of turns) {
    for (const a of t.added) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
  }
  return out;
}

export const refineErrorMessage = (code: string | undefined): string => {
  switch (code) {
    case "truncated":
      return "The answer got cut off. Try again, or shorten what you added.";
    case "sign_in":
      return "Sign in to refine your answer.";
    case "rate_limit":
      return "Too many requests right now. Wait a moment and try again.";
    case "credits":
      return "AI credits are used up for now.";
    case "search_failed":
      return "Couldn't search again just now. Try again.";
    default:
      return "Couldn't refine the answer. Try again.";
  }
};

// Drops repeated ids, keeping the first. The main list and its count both come from this, so they always agree.
export function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

// The line above the supporting list. It always describes the list that is on screen. "Top N of M" is only said
// when the list was cut at the page's limit of 10, never because a count and a list disagreed.
export function foundLabel(listed: number, totalFound: number): string {
  if (listed >= 10 && totalFound > listed) return `Showing the top ${listed} of ${totalFound} highlights`;
  return `${listed} highlight${listed !== 1 ? "s" : ""} found`;
}
