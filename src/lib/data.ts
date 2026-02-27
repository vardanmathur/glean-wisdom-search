import { supabase } from "@/integrations/supabase/client";

export interface Highlight {
  id: string;
  text: string;
  bookTitle: string;
  author: string;
  tags: string[];
  bookId?: string;
  coverImageUrl?: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  isbn?: string;
  coverImageUrl?: string;
  highlightCount?: number;
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  highlightCount: number;
}

// Transform DB row to app Highlight
function toHighlight(row: any): Highlight {
  return {
    id: row.id,
    text: row.quote,
    bookTitle: row.books?.title || "Unknown",
    author: row.books?.author || "Unknown",
    tags: row.tags || [],
    bookId: row.book_id,
    coverImageUrl: row.books?.cover_image_url,
  };
}

function toBook(row: any): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    description: row.description || "",
    isbn: row.isbn,
    coverImageUrl: row.cover_image_url,
    highlightCount: row.highlights?.[0]?.count ?? 0,
  };
}

// Search highlights using keyword matching
export async function searchHighlights(query: string): Promise<Highlight[]> {
  if (!query.trim()) return [];
  
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return [];

  // Fetch all highlights with book info for client-side scoring
  const { data, error } = await supabase
    .from("highlights")
    .select("*, books(title, author, cover_image_url)")
    .limit(500);

  if (error || !data) return [];

  const scored = data.map((h) => {
    let score = 0;
    const searchText = `${h.quote} ${(h.tags || []).join(" ")} ${h.books?.title || ""} ${h.books?.author || ""}`.toLowerCase();
    for (const word of words) {
      if (searchText.includes(word)) score++;
    }
    for (const tag of h.tags || []) {
      for (const word of words) {
        if (tag.toLowerCase().includes(word)) score += 2;
      }
    }
    return { row: h, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((s) => toHighlight(s.row));
}

export async function getAllTopics(): Promise<Topic[]> {
  const { data, error } = await supabase
    .from("highlights")
    .select("tags");

  if (error || !data) return [];

  const tagCounts: Record<string, number> = {};
  for (const row of data) {
    for (const tag of row.tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  return Object.entries(tagCounts)
    .map(([name, count]) => ({
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      description: getTopicDescription(name),
      highlightCount: count,
    }))
    .sort((a, b) => b.highlightCount - a.highlightCount);
}

export async function getHighlightsByTag(tag: string): Promise<Highlight[]> {
  const { data, error } = await supabase
    .from("highlights")
    .select("*, books(title, author, cover_image_url)")
    .contains("tags", [tag]);

  if (error || !data) return [];
  return data.map(toHighlight);
}

export async function getBookByTitle(title: string): Promise<Book | undefined> {
  const { data, error } = await supabase
    .from("books")
    .select("*, highlights(count)")
    .eq("title", title)
    .maybeSingle();

  if (error || !data) return undefined;
  return toBook(data);
}

export async function getBookById(id: string): Promise<Book | undefined> {
  const { data, error } = await supabase
    .from("books")
    .select("*, highlights(count)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return undefined;
  return toBook(data);
}

export async function getHighlightsByBook(bookId: string): Promise<Highlight[]> {
  const { data, error } = await supabase
    .from("highlights")
    .select("*, books(title, author, cover_image_url)")
    .eq("book_id", bookId);

  if (error || !data) return [];
  return data.map(toHighlight);
}

export async function getAllBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from("books")
    .select("*, highlights(count)")
    .order("title");

  if (error || !data) return [];
  return data.map(toBook);
}

export async function getRecommendedBooks(query: string): Promise<Book[]> {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return [];

  const { data, error } = await supabase
    .from("books")
    .select("*, highlights(quote, tags)")
    .limit(50);

  if (error || !data) return [];

  const scored = data.map((b) => {
    let score = 0;
    const hlText = (b.highlights || [])
      .map((h: any) => `${h.quote} ${(h.tags || []).join(" ")}`)
      .join(" ");
    const searchText = `${b.title} ${b.author} ${b.description || ""} ${hlText}`.toLowerCase();
    for (const word of words) {
      if (searchText.includes(word)) score++;
    }
    return { book: b, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => toBook(s.book));
}

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
    Leadership: "Guiding others with wisdom and integrity",
    Learning: "The lifelong pursuit of knowledge",
    People: "Understanding human nature",
    Perseverance: "Never giving up when it matters",
    Forgiveness: "Letting go to move forward",
    Communication: "Expressing ideas with clarity and impact",
    Humility: "Staying grounded in who you are",
    Love: "The deepest human connection",
    Family: "The bonds that shape us",
    Friends: "The people who walk beside us",
    Work: "Making meaningful contributions",
    Health: "Taking care of body and mind",
    Reading: "Growing through books and ideas",
    Teaching: "Sharing wisdom with others",
    Investing: "Building wealth wisely",
    Influence: "Moving others through understanding",
    "Anger Management": "Mastering your emotional responses",
    Death: "Confronting mortality with grace",
    Honesty: "Living with integrity and truth",
    "Moral Compass": "Navigating right and wrong",
    Networking: "Building meaningful professional connections",
    Overwhelmed: "Finding peace in chaos",
    Procrastinating: "Overcoming the habit of delay",
    "Time Management": "Making every moment count",
    Quality: "Pursuing excellence in all things",
    Resilience: "Bouncing back stronger",
  };
  return map[tag] || "Explore wisdom on this topic";
}
