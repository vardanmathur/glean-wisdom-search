import { supabase } from "@/integrations/supabase/client";
import { ALL_TAGS } from "@/lib/tags";

// Derived from the canonical taxonomy so this file can never drift from
// src/lib/tags.ts. Keys are lookup forms (lowercased, punctuation-stripped).
const TAG_CANONICAL_MAP: Record<string, string> = Object.fromEntries(
  ALL_TAGS.flatMap((tag) => {
    const lower = tag.toLowerCase();
    return [
      [lower, tag],
      [lower.replace(/\s+/g, ""), tag],
      [lower.replace(/\s+/g, "-"), tag],
    ];
  })
);

// Legacy spellings from the pre-migration taxonomy that must resolve FORWARD
// to their current tag — never re-derive these from ALL_TAGS, they no longer
// exist there by design.
const LEGACY_ALIASES: Record<string, string> = {
  "needs&wants": "Desires",
  "needs&want": "Desires",
  "needs and wants": "Desires",
  "needsandwants": "Desires",
  "needs & wants": "Desires",
  "procrastinating": "Procrastination",
  "faith n spirituality": "Religion & Spirituality",
  "faith-n-spirituality": "Religion & Spirituality",
  "prioritization": "Priorities",
  "prioritisation": "Priorities",
  "working": "Work",
  "resiliency": "Resilience",
  "will power": "Willpower",
};

function normaliseTag(tag: string): string {
  if (!tag) return tag;
  const lower = tag.toLowerCase().trim();
  if (LEGACY_ALIASES[lower]) {
    return LEGACY_ALIASES[lower];
  }
  if (TAG_CANONICAL_MAP[lower]) {
    return TAG_CANONICAL_MAP[lower];
  }
  return tag
    .trim()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export async function normaliseAllTags(): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  let processed = 0;
  let updated = 0;
  let errors = 0;

  const { data: highlights, error: fetchError } = await supabase
    .from("highlights")
    .select("id, tags")
    .limit(5000);

  if (fetchError || !highlights) {
    console.error("Failed to fetch highlights:", fetchError);
    return { processed: 0, updated: 0, errors: 1 };
  }

  console.log(`Fetched ${highlights.length} highlights to process`);

  for (const highlight of highlights) {
    processed++;
    if (!highlight.tags || highlight.tags.length === 0) continue;

    const normalisedTags = highlight.tags.map(normaliseTag);
    const uniqueTags = [...new Set(normalisedTags)];
    const hasChanged = JSON.stringify(highlight.tags.sort()) !== JSON.stringify(uniqueTags.sort());

    if (hasChanged) {
      const { error: updateError } = await supabase
        .from("highlights")
        .update({ tags: uniqueTags })
        .eq("id", highlight.id);

      if (updateError) {
        console.error(`Failed to update highlight ${highlight.id}:`, updateError);
        errors++;
      } else {
        updated++;
        console.log(`Updated highlight ${highlight.id}:`, highlight.tags, "→", uniqueTags);
      }
    }
  }

  console.log(`Tag normalisation complete. Processed: ${processed}, Updated: ${updated}, Errors: ${errors}`);
  return { processed, updated, errors };
}
