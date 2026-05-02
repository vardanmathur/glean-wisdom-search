// Canonical Glean tag taxonomy. Single source of truth for tag autocomplete
// across the app (AddHighlightModal, HighlightEditPanel, etc.).
// Keep alphabetised — and prefer normalising to one of these in
// src/lib/normaliseTags.ts before persisting user-supplied tags.
export const ALL_TAGS = [
  "Ambition", "Anxiety", "Art", "Career", "Children", "Communication",
  "Death", "Decision Making", "Desires", "Expectations", "Family",
  "Forgiveness", "Friends", "Funny", "Habits", "Happiness", "Health",
  "Hiring", "Honesty", "Humility", "Influence", "Investing",
  "Leadership", "Learning", "Life", "Living with Others", "Love",
  "Luck", "Marriage", "Mental Health", "Mistakes", "Money",
  "Motivation", "Needs & Wants", "Negotiation", "Outcomes",
  "Overwhelmed", "People", "Perseverance", "Pithy", "Positivity",
  "Priorities", "Prioritization", "Procrastinating", "Productivity",
  "Purpose", "Quality", "Reading", "Relationships", "Resilience",
  "Stars", "Success", "Teaching", "Thinking", "Time Management",
  "Trust", "Willpower", "Work",
];
