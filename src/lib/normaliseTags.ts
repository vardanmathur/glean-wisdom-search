import { supabase } from "@/integrations/supabase/client";

const TAG_CANONICAL_MAP: Record<string, string> = {
  "ambition": "Ambition",
  "anxiety": "Anxiety",
  "art": "Art",
  "career": "Career",
  "children": "Children",
  "communication": "Communication",
  "death": "Death",
  "decision making": "Decision Making",
  "decisionmaking": "Decision Making",
  "decision-making": "Decision Making",
  "desires": "Desires",
  "expectations": "Expectations",
  "family": "Family",
  "forgiveness": "Forgiveness",
  "friends": "Friends",
  "funny": "Funny",
  "habits": "Habits",
  "happiness": "Happiness",
  "health": "Health",
  "hiring": "Hiring",
  "honesty": "Honesty",
  "humility": "Humility",
  "influence": "Influence",
  "investing": "Investing",
  "leadership": "Leadership",
  "learning": "Learning",
  "life": "Life",
  "living with others": "Living with Others",
  "livingwithothers": "Living with Others",
  "living-with-others": "Living with Others",
  "love": "Love",
  "luck": "Luck",
  "marriage": "Marriage",
  "mental health": "Mental Health",
  "mentalhealth": "Mental Health",
  "mental-health": "Mental Health",
  "mistakes": "Mistakes",
  "money": "Money",
  "motivation": "Motivation",
  "needs&wants": "Needs & Wants",
  "needs&want": "Needs & Wants",
  "needs and wants": "Needs & Wants",
  "needsandwants": "Needs & Wants",
  "needs & wants": "Needs & Wants",
  "negotiation": "Negotiation",
  "outcomes": "Outcomes",
  "overwhelmed": "Overwhelmed",
  "people": "People",
  "perseverance": "Perseverance",
  "pithy": "Pithy",
  "positivity": "Positivity",
  "priorities": "Priorities",
  "prioritization": "Prioritization",
  "prioritisation": "Prioritization",
  "procrastinating": "Procrastinating",
  "procrastination": "Procrastinating",
  "productivity": "Productivity",
  "purpose": "Purpose",
  "quality": "Quality",
  "reading": "Reading",
  "relationships": "Relationships",
  "resilience": "Resilience",
  "resiliency": "Resilience",
  "stars": "Stars",
  "success": "Success",
  "teaching": "Teaching",
  "thinking": "Thinking",
  "time management": "Time Management",
  "timemanagement": "Time Management",
  "time-management": "Time Management",
  "trust": "Trust",
  "willpower": "Willpower",
  "will power": "Willpower",
  "work": "Work",
  "working": "Working",
};

function normaliseTag(tag: string): string {
  if (!tag) return tag;
  const lower = tag.toLowerCase().trim();
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
