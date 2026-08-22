// Canonical Glean tag taxonomy. Single source of truth for tag autocomplete
// across the app (AddHighlightModal, HighlightEditPanel, etc.).
// Keep alphabetised. Mirrors exactly the 66 distinct tags in the DB as of the
// 2026-08 Title Case migration — src/lib/normaliseTags.ts derives its canonical
// map from this array, so this is the only place the taxonomy is defined.
export const ALL_TAGS = [
  "Adaptability", "Ambition", "Anger Management", "Anxiety",
  "Art", "Career", "Change Management", "Children",
  "Communication", "Death", "Decision Making", "Desires",
  "Discipline", "Envy", "Equanimity", "Expectations",
  "Family", "Forgiveness", "Friends", "Frugality",
  "Funny", "Habits", "Happiness", "Health",
  "Hiring", "Honesty", "Humility", "Influence",
  "Investing", "Leadership", "Learning", "Life",
  "Living With Others", "Love", "Luck", "Marriage",
  "Mental Health", "Mistakes", "Money", "Moral Compass",
  "Motivation", "Negotiation", "Networking", "Outcomes",
  "Overwhelmed", "People", "Perseverance", "Personal Safety",
  "Positivity", "Priorities", "Procrastination", "Productivity",
  "Purpose", "Quality", "Rational Thinking", "Reading",
  "Relationships", "Religion & Spirituality", "Resilience", "Success",
  "Teaching", "Thinking", "Time Management", "Trust",
  "Willpower", "Work",
];
