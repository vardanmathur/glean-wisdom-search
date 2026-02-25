export interface Highlight {
  id: string;
  text: string;
  bookTitle: string;
  author: string;
  tags: string[];
}

export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  highlightIds: string[];
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  highlightCount: number;
}

export const highlights: Highlight[] = [
  {
    id: "h1",
    text: "If your goal does not have a schedule, it is a dream.",
    bookTitle: "Excellent Advice for Living",
    author: "Kevin Kelly",
    tags: ["Habits", "Productivity", "Motivation", "Goals"],
  },
  {
    id: "h2",
    text: "Easy choices, hard life. Hard choices, easy life.",
    bookTitle: "The Almanack of Naval Ravikant",
    author: "Eric Jorgenson",
    tags: ["Decision Making", "Discipline", "Habits", "Motivation", "Willpower"],
  },
  {
    id: "h3",
    text: "We cannot prevent birds from flying over our heads, but we can keep them from making nests on top of our heads. Similarly, bad thoughts sometimes appear in our mind, but we can choose whether we allow them to live there.",
    bookTitle: "A Calendar of Wisdom",
    author: "Leo Tolstoy",
    tags: ["Anxiety", "Mental Health", "Positivity", "Thinking", "Equanimity"],
  },
  {
    id: "h4",
    text: "Jim Carrey once said that everybody should get rich and famous and do everything they ever dreamed of — so they can see that it's not the answer.",
    bookTitle: "Same As Ever",
    author: "Morgan Housel",
    tags: ["Happiness", "Success", "Expectations", "Envy"],
  },
  {
    id: "h5",
    text: "You are the average of the five people you spend most time with.",
    bookTitle: "Dear Adaa",
    author: "Vardan Mathur",
    tags: ["Relationships", "Growth", "Habits", "Success"],
  },
  {
    id: "h6",
    text: "The minimum requirement of a system is that a reasonable person expects it to work more often than not.",
    bookTitle: "How to Fail at Almost Everything",
    author: "Scott Adams",
    tags: ["Success", "Habits", "Productivity", "Systems"],
  },
  {
    id: "h7",
    text: "Clarity of purpose matters. What you're trying to pursue and put effort behind should actually be what you really want.",
    bookTitle: "Dear Adaa",
    author: "Vardan Mathur",
    tags: ["Purpose", "Ambition", "Career", "Clarity"],
  },
  {
    id: "h8",
    text: "There's no use running if you're on the wrong road.",
    bookTitle: "Seeking Wisdom",
    author: "Peter Bevelin",
    tags: ["Purpose", "Decision Making", "Life", "Strategy"],
  },
];

export const books: Book[] = [
  { id: "b1", title: "Excellent Advice for Living", author: "Kevin Kelly", description: "A collection of practical life advice distilled from decades of experience, offering concise wisdom on work, relationships, and personal growth.", highlightIds: ["h1"] },
  { id: "b2", title: "The Almanack of Naval Ravikant", author: "Eric Jorgenson", description: "A guide to wealth and happiness based on the wisdom of entrepreneur and philosopher Naval Ravikant.", highlightIds: ["h2"] },
  { id: "b3", title: "A Calendar of Wisdom", author: "Leo Tolstoy", description: "Daily thoughts from the world's greatest thinkers, compiled by one of history's greatest novelists.", highlightIds: ["h3"] },
  { id: "b4", title: "Same As Ever", author: "Morgan Housel", description: "A guide to the things that never change, exploring the timeless behaviors that shape our world.", highlightIds: ["h4"] },
  { id: "b5", title: "Dear Adaa", author: "Vardan Mathur", description: "A personal collection of life lessons and reflections, written as letters of wisdom for the next generation.", highlightIds: ["h5", "h7"] },
  { id: "b6", title: "How to Fail at Almost Everything", author: "Scott Adams", description: "Scott Adams shares his philosophy on systems over goals, and how strategic failure leads to success.", highlightIds: ["h6"] },
  { id: "b7", title: "Seeking Wisdom", author: "Peter Bevelin", description: "A deep exploration of decision-making, mental models, and the wisdom of Charlie Munger and Warren Buffett.", highlightIds: ["h8"] },
];

const allTags = Array.from(new Set(highlights.flatMap((h) => h.tags)));

export const topics: Topic[] = allTags.map((tag) => ({
  id: tag.toLowerCase().replace(/\s+/g, "-"),
  name: tag,
  description: getTopicDescription(tag),
  highlightCount: highlights.filter((h) => h.tags.includes(tag)).length,
}));

function getTopicDescription(tag: string): string {
  const map: Record<string, string> = {
    Habits: "Building routines that compound over time",
    Productivity: "Doing more of what matters, less of what doesn't",
    Motivation: "Finding the drive to keep going",
    Goals: "Setting direction with intention",
    "Decision Making": "Choosing wisely when it counts",
    Discipline: "Doing what needs to be done, especially when it's hard",
    Willpower: "Strengthening your inner resolve",
    Anxiety: "Finding calm amidst uncertainty",
    "Mental Health": "Caring for your mind as you would your body",
    Positivity: "Choosing to see the light",
    Thinking: "Sharpening how you process the world",
    Equanimity: "Maintaining composure in all circumstances",
    Happiness: "Understanding what truly fulfills us",
    Success: "Redefining what it means to win",
    Expectations: "Managing the gap between hope and reality",
    Envy: "Freeing yourself from comparison",
    Relationships: "Nurturing the connections that matter",
    Growth: "Becoming better, one day at a time",
    Systems: "Building frameworks that work for you",
    Purpose: "Knowing your why",
    Ambition: "Channeling desire into meaningful pursuit",
    Career: "Navigating your professional journey",
    Clarity: "Cutting through noise to find truth",
    Life: "Making sense of the human experience",
    Strategy: "Thinking long-term with wisdom",
  };
  return map[tag] || "Explore wisdom on this topic";
}

// Simple keyword search
export function searchHighlights(query: string): Highlight[] {
  if (!query.trim()) return [];
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  
  const scored = highlights.map((h) => {
    let score = 0;
    const searchText = `${h.text} ${h.tags.join(" ")} ${h.bookTitle} ${h.author}`.toLowerCase();
    for (const word of words) {
      if (searchText.includes(word)) score++;
    }
    // Boost for tag matches
    for (const tag of h.tags) {
      for (const word of words) {
        if (tag.toLowerCase().includes(word)) score += 2;
      }
    }
    return { highlight: h, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.highlight);
}

export function getBookByTitle(title: string): Book | undefined {
  return books.find((b) => b.title === title);
}

export function getBookById(id: string): Book | undefined {
  return books.find((b) => b.id === id);
}

export function getHighlightsByBook(bookId: string): Highlight[] {
  const book = getBookById(bookId);
  if (!book) return [];
  return highlights.filter((h) => book.highlightIds.includes(h.id));
}

export function getHighlightsByTag(tag: string): Highlight[] {
  return highlights.filter((h) => h.tags.includes(tag));
}

export function getRecommendedBooks(query: string): Book[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const scored = books.map((b) => {
    let score = 0;
    const bookHighlights = highlights.filter((h) => b.highlightIds.includes(h.id));
    const searchText = `${b.title} ${b.author} ${b.description} ${bookHighlights.map((h) => h.tags.join(" ")).join(" ")}`.toLowerCase();
    for (const word of words) {
      if (searchText.includes(word)) score++;
    }
    return { book: b, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((s) => s.book);
}
