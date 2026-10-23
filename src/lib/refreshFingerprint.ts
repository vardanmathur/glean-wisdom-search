import { supabase } from "@/integrations/supabase/client";

export interface FingerprintFields {
  quote: string;
  tags: string[] | null;
  my_notes: string | null;
}

// generate-embeddings processes at most 50 ids per call.
const CHUNK = 50;

// Refresh only if the highlight has a tag AND (it is new OR its quote, tags or notes changed).
// A pure reorder of the same tags counts as unchanged.
export function shouldRefreshFingerprint(after: FingerprintFields, before?: FingerprintFields | null): boolean {
  if ((after.tags ?? []).length === 0) return false;
  if (!before) return true;
  const notes = (f: FingerprintFields) => (f.my_notes ?? "").trim();
  const tagSet = (f: FingerprintFields) => JSON.stringify([...new Set(f.tags ?? [])].sort());
  return (
    before.quote.trim() !== after.quote.trim() ||
    notes(before) !== notes(after) ||
    tagSet(before) !== tagSet(after)
  );
}

// Fire-and-forget: never throws and never blocks a save. Ids go out in sequential chunks.
export function refreshFingerprint(ids: string[]): void {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  void (async () => {
    for (let i = 0; i < unique.length; i += CHUNK) {
      try {
        const { error } = await supabase.functions.invoke("generate-embeddings", {
          body: { ids: unique.slice(i, i + CHUNK), force: true },
        });
        if (error) console.error("[fingerprint] refresh failed", error);
      } catch (e) {
        console.error("[fingerprint] refresh failed", e);
      }
    }
  })();
}

// Result of applying a partial highlights update to the fields before it.
export function applyFingerprintUpdates(before: FingerprintFields, updates: Record<string, unknown>): FingerprintFields {
  return {
    quote: typeof updates.quote === "string" ? updates.quote : before.quote,
    tags: Array.isArray(updates.tags) ? (updates.tags as string[]) : before.tags,
    my_notes: "my_notes" in updates ? ((updates.my_notes as string | null) ?? null) : before.my_notes,
  };
}

// Call after a successful edit of an existing highlight.
export function refreshFingerprintAfterEdit(id: string, before: FingerprintFields, updates: Record<string, unknown>): void {
  if (shouldRefreshFingerprint(applyFingerprintUpdates(before, updates), before)) refreshFingerprint([id]);
}
