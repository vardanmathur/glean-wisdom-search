import { supabase } from "@/integrations/supabase/client";

// AI-powered wisdom synthesis via edge function
export async function synthesiseWisdom(
  question: string,
  highlights: Highlight[]
): Promise<string> {
  if (highlights.length === 0) return "";

  try {
    const { data, error } = await supabase.functions.invoke("synthesise-wisdom", {
      body: { question, highlights },
    });

    if (error) {
      console.error("Synthesis error:", error);
      return "";
    }

    return data?.synthesis || "";
  } catch {
    return "";
  }
}

export interface Highlight {
  id: string;
  text: string;
  bookTitle: string;
  author: string;
  tags: string[];
  bookId?: string;
  coverImageUrl?: string;
  myNotes?: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  isbn?: string;
  coverImageUrl?: string;
  highlightCount?: number;
  avgHighlightLength?: number;
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  highlightCount: number;
  avgHighlightLength?: number;
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
    myNotes: row.my_notes || undefined,
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

const normaliseQuery = (q: string): string => {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(i|me|my|we|our|you|your|am|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|can|may|might|a|an|the|and|or|but|in|on|at|to|for|of|with|about|how|what|why|when|who|so|very|really|just|feel|feeling|felt|im|ive|dont|cant|wont|its)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const synonymMap: Record<string, string[]> = {
  "stuck": ["Career", "Purpose", "Clarity", "Motivation", "Ambition", "Priorities"],
  "career": ["Career", "Work", "Working", "Ambition", "Purpose", "Success", "Learning"],
  "job": ["Career", "Work", "Working", "Hiring", "Success"],
  "work": ["Work", "Working", "Career", "Productivity", "Leadership", "Quality"],
  "working": ["Working", "Work", "Productivity", "Habits", "Quality"],
  "promotion": ["Career", "Ambition", "Success", "Work", "Leadership"],
  "fired": ["Career", "Resilience", "Mistakes", "Work", "Perseverance"],
  "resign": ["Career", "Purpose", "Decision Making", "Ambition"],
  "burnout": ["Overwhelmed", "Work", "Habits", "Mental Health", "Priorities"],
  "overwhelm": ["Overwhelmed", "Productivity", "Prioritization", "Mental Health", "Habits"],
  "busy": ["Productivity", "Time Management", "Priorities", "Overwhelmed", "Working"],
  "salary": ["Money", "Investing", "Career", "Negotiation", "Success"],
  "hiring": ["Hiring", "Leadership", "People", "Work", "Trust"],
  "purpose": ["Purpose", "Ambition", "Life", "Motivation", "Priorities", "Success"],
  "meaning": ["Purpose", "Life", "Happiness", "Success", "Ambition"],
  "direction": ["Purpose", "Ambition", "Decision Making", "Priorities", "Goals"],
  "lost": ["Purpose", "Mental Health", "Motivation", "Life", "Anxiety"],
  "confused": ["Decision Making", "Purpose", "Thinking", "Clarity", "Anxiety"],
  "clarity": ["Purpose", "Decision Making", "Thinking", "Priorities", "Ambition"],
  "why": ["Purpose", "Motivation", "Life", "Ambition", "Happiness"],
  "passion": ["Purpose", "Ambition", "Motivation", "Career", "Happiness"],
  "dream": ["Ambition", "Purpose", "Motivation", "Success", "Procrastinating"],
  "success": ["Success", "Ambition", "Habits", "Perseverance", "Work", "Outcomes"],
  "ambition": ["Ambition", "Purpose", "Success", "Motivation", "Career"],
  "goal": ["Ambition", "Priorities", "Habits", "Success", "Outcomes", "Procrastinating"],
  "achieve": ["Success", "Habits", "Perseverance", "Ambition", "Outcomes"],
  "fail": ["Mistakes", "Perseverance", "Resilience", "Learning", "Success"],
  "failure": ["Mistakes", "Perseverance", "Resilience", "Learning", "Outcomes"],
  "mistake": ["Mistakes", "Learning", "Honesty", "Perseverance", "Humility"],
  "outcome": ["Outcomes", "Success", "Decision Making", "Priorities", "Luck"],
  "luck": ["Luck", "Success", "Outcomes", "Perseverance", "Ambition"],
  "win": ["Success", "Ambition", "Outcomes", "Perseverance", "Habits"],
  "lose": ["Mistakes", "Perseverance", "Resilience", "Learning", "Outcomes"],
  "leader": ["Leadership", "Influence", "People", "Communication", "Humility"],
  "leadership": ["Leadership", "Influence", "People", "Hiring", "Trust", "Communication"],
  "manage": ["Leadership", "People", "Work", "Hiring", "Communication"],
  "manager": ["Leadership", "People", "Hiring", "Work", "Communication"],
  "team": ["Leadership", "People", "Communication", "Trust", "Working"],
  "boss": ["Leadership", "Work", "Communication", "People", "Influence"],
  "employee": ["Leadership", "Hiring", "People", "Trust", "Work"],
  "delegate": ["Leadership", "Trust", "People", "Productivity", "Working"],
  "influence": ["Influence", "Leadership", "People", "Communication", "Negotiation"],
  "power": ["Influence", "Leadership", "Ambition", "Negotiation", "People"],
  "motivat": ["Motivation", "Habits", "Willpower", "Perseverance", "Productivity"],
  "habit": ["Habits", "Productivity", "Willpower", "Success", "Time Management"],
  "discipline": ["Willpower", "Habits", "Productivity", "Perseverance", "Success"],
  "willpower": ["Willpower", "Habits", "Motivation", "Discipline", "Perseverance"],
  "lazy": ["Procrastinating", "Habits", "Motivation", "Willpower", "Productivity"],
  "energy": ["Habits", "Health", "Motivation", "Productivity", "Willpower"],
  "routine": ["Habits", "Productivity", "Time Management", "Willpower", "Success"],
  "procrastinat": ["Procrastinating", "Habits", "Willpower", "Motivation", "Productivity"],
  "delay": ["Procrastinating", "Habits", "Time Management", "Willpower", "Priorities"],
  "distract": ["Procrastinating", "Productivity", "Habits", "Focus", "Time Management"],
  "focus": ["Productivity", "Habits", "Time Management", "Priorities", "Willpower"],
  "productiv": ["Productivity", "Habits", "Time Management", "Working", "Priorities"],
  "time": ["Time Management", "Productivity", "Priorities", "Habits", "Life"],
  "priorit": ["Prioritization", "Priorities", "Time Management", "Decision Making", "Outcomes"],
  "anxious": ["Anxiety", "Mental Health", "Overwhelmed", "Positivity", "Resilience"],
  "anxiety": ["Anxiety", "Mental Health", "Overwhelmed", "Positivity", "Resilience"],
  "stress": ["Overwhelmed", "Anxiety", "Mental Health", "Habits", "Resilience"],
  "worry": ["Anxiety", "Mental Health", "Thinking", "Overwhelmed", "Positivity"],
  "fear": ["Anxiety", "Perseverance", "Mental Health", "Willpower", "Courage"],
  "depress": ["Mental Health", "Happiness", "Positivity", "Resilience", "Purpose"],
  "sad": ["Mental Health", "Happiness", "Positivity", "Resilience", "Life"],
  "happy": ["Happiness", "Positivity", "Life", "Needs&Wants", "Desires"],
  "happiness": ["Happiness", "Positivity", "Life", "Desires", "Needs&Wants", "Success"],
  "peace": ["Mental Health", "Happiness", "Positivity", "Life", "Overwhelmed"],
  "calm": ["Mental Health", "Anxiety", "Positivity", "Habits", "Willpower"],
  "health": ["Health", "Habits", "Mental Health", "Life", "Productivity"],
  "mindful": ["Mental Health", "Habits", "Positivity", "Thinking", "Anxiety"],
  "decision": ["Decision Making", "Thinking", "Priorities", "Outcomes", "Wisdom"],
  "decide": ["Decision Making", "Thinking", "Priorities", "Ambition", "Outcomes"],
  "choice": ["Decision Making", "Priorities", "Outcomes", "Life", "Thinking"],
  "think": ["Thinking", "Decision Making", "Learning", "Mental Health", "Wisdom"],
  "wisdom": ["Thinking", "Learning", "Life", "Purpose", "Success"],
  "regret": ["Decision Making", "Mistakes", "Life", "Forgiveness", "Happiness"],
  "risk": ["Decision Making", "Luck", "Outcomes", "Ambition", "Investing"],
  "relationship": ["Relationships", "Love", "Trust", "Communication", "Living with Others"],
  "friend": ["Friends", "Relationships", "Trust", "Living with Others", "People"],
  "family": ["Family", "Love", "Relationships", "Living with Others", "Children"],
  "marriage": ["Marriage", "Love", "Relationships", "Trust", "Living with Others"],
  "love": ["Love", "Marriage", "Relationships", "Family", "Happiness"],
  "children": ["Children", "Family", "Love", "Teaching", "Relationships"],
  "parent": ["Family", "Children", "Love", "Teaching", "Relationships"],
  "trust": ["Trust", "Relationships", "Honesty", "People", "Communication"],
  "lonely": ["Relationships", "Friends", "Mental Health", "Living with Others", "Happiness"],
  "conflict": ["Living with Others", "Communication", "Relationships", "Negotiation", "Forgiveness"],
  "forgive": ["Forgiveness", "Relationships", "Mental Health", "Life", "Trust"],
  "anger": ["Living with Others", "Mental Health", "Relationships", "Forgiveness", "Thinking"],
  "people": ["People", "Relationships", "Living with Others", "Communication", "Trust"],
  "communicat": ["Communication", "Relationships", "Influence", "Leadership", "People"],
  "speak": ["Communication", "Influence", "People", "Leadership", "Honesty"],
  "listen": ["Communication", "Relationships", "Humility", "People", "Leadership"],
  "negotiat": ["Negotiation", "Influence", "Communication", "People", "Work"],
  "persuad": ["Influence", "Communication", "Negotiation", "People", "Leadership"],
  "feedback": ["Communication", "Learning", "Honesty", "Leadership", "Humility"],
  "honest": ["Honesty", "Trust", "Relationships", "Life", "Communication"],
  "integrity": ["Honesty", "Trust", "Life", "People", "Success"],
  "humble": ["Humility", "Learning", "People", "Leadership", "Honesty"],
  "humility": ["Humility", "Learning", "Honesty", "Leadership", "People"],
  "ego": ["Humility", "Leadership", "People", "Success", "Living with Others"],
  "proud": ["Humility", "Success", "Life", "Ambition", "People"],
  "moral": ["Honesty", "Life", "Trust", "People", "Decision Making"],
  "ethic": ["Honesty", "Work", "Leadership", "Trust", "Life"],
  "money": ["Money", "Investing", "Success", "Work", "Priorities"],
  "invest": ["Investing", "Money", "Success", "Habits", "Priorities"],
  "wealth": ["Investing", "Money", "Success", "Ambition", "Habits"],
  "financ": ["Money", "Investing", "Success", "Priorities", "Work"],
  "rich": ["Money", "Investing", "Success", "Happiness", "Needs&Wants"],
  "spend": ["Money", "Habits", "Priorities", "Needs&Wants", "Investing"],
  "save": ["Money", "Habits", "Investing", "Priorities", "Willpower"],
  "debt": ["Money", "Investing", "Habits", "Overwhelmed", "Priorities"],
  "learn": ["Learning", "Reading", "Habits", "Growth", "Teaching"],
  "read": ["Reading", "Learning", "Habits", "Knowledge", "Growth"],
  "teach": ["Teaching", "Learning", "People", "Communication", "Leadership"],
  "grow": ["Learning", "Ambition", "Habits", "Success", "Purpose"],
  "knowledge": ["Learning", "Reading", "Thinking", "Wisdom", "Teaching"],
  "skill": ["Learning", "Career", "Work", "Habits", "Success"],
  "improve": ["Learning", "Habits", "Success", "Perseverance", "Quality"],
  "quality": ["Quality", "Work", "Habits", "Success", "Learning"],
  "life": ["Life", "Purpose", "Happiness", "Death", "Success"],
  "death": ["Death", "Life", "Purpose", "Family", "Happiness"],
  "old": ["Life", "Death", "Time Management", "Happiness", "Purpose"],
  "age": ["Life", "Death", "Habits", "Health", "Purpose"],
  "legacy": ["Life", "Purpose", "Success", "Family", "Ambition"],
  "ai": ["Career", "Work", "Learning", "Ambition", "Thinking"],
  "artificial intelligence": ["Career", "Work", "Learning", "Thinking", "Ambition"],
  "technology": ["Career", "Work", "Learning", "Thinking", "Productivity"],
  "automat": ["Career", "Work", "Ambition", "Learning", "Productivity"],
  "relevant": ["Career", "Learning", "Ambition", "Work", "Success"],
  "obsolete": ["Career", "Learning", "Perseverance", "Ambition", "Motivation"],
  "want": ["Needs&Wants", "Desires", "Happiness", "Ambition", "Purpose"],
  "need": ["Needs&Wants", "Priorities", "Life", "Happiness", "Purpose"],
  "desire": ["Desires", "Needs&Wants", "Happiness", "Ambition", "Love"],
  "expect": ["Expectations", "Happiness", "Relationships", "Life", "Outcomes"],
  "disappoint": ["Expectations", "Happiness", "Relationships", "Mistakes", "Resilience"],
  "envy": ["Happiness", "Success", "Needs&Wants", "Life", "People"],
  "compar": ["Success", "Happiness", "Ambition", "People", "Life"],
  "persever": ["Perseverance", "Habits", "Willpower", "Success", "Motivation"],
  "resilience": ["Perseverance", "Mental Health", "Positivity", "Habits", "Success"],
  "give up": ["Perseverance", "Motivation", "Willpower", "Habits", "Success"],
  "quit": ["Perseverance", "Decision Making", "Career", "Willpower", "Habits"],
  "tough": ["Perseverance", "Willpower", "Mental Health", "Resilience", "Habits"],
  "hard": ["Perseverance", "Habits", "Willpower", "Success", "Work"],
  "struggle": ["Perseverance", "Mental Health", "Motivation", "Resilience", "Habits"],
  "fun": ["Funny", "Happiness", "Life", "People", "Relationships"],
  "humor": ["Funny", "People", "Life", "Relationships", "Communication"],
  "art": ["Art", "Learning", "Life", "Quality", "Happiness"],
  "star": ["Stars", "Life", "Purpose", "Ambition", "Inspiration"],
  "inspir": ["Stars", "Motivation", "Purpose", "Ambition", "Perseverance"],
  "pithy": ["Pithy", "Thinking", "Wisdom", "Learning", "Life"],
};

function expandQueryTags(words: string[]): Set<string> {
  const expandedTags = new Set<string>();
  for (const word of words) {
    for (const [trigger, mappedTags] of Object.entries(synonymMap)) {
      if (word.includes(trigger) || trigger.includes(word)) {
        mappedTags.forEach(tag => expandedTags.add(tag));
      }
    }
  }
  return expandedTags;
}

// Search highlights using semantic keyword matching
export async function searchHighlights(query: string): Promise<Highlight[]> {
  if (!query.trim()) return [];

  const normalisedQuery = normaliseQuery(query);
  const words = normalisedQuery.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return [];

  const { data, error } = await supabase
    .from("highlights")
    .select("*, books(title, author, cover_image_url)")
    .limit(2000);

  if (error || !data) return [];

  const expandedTags = expandQueryTags(words);

  const scored = data.map((h) => {
    let score = 0;
    const highlightText = `${h.quote} ${h.books?.title || ""} ${h.books?.author || ""}`.toLowerCase();
    const highlightTags: string[] = h.tags || [];

    for (const word of words) {
      if (highlightText.includes(word)) score += 1;
    }

    for (const tag of highlightTags) {
      for (const word of words) {
        if (tag.toLowerCase().includes(word) || word.includes(tag.toLowerCase())) {
          score += 3;
        }
      }
    }

    for (const tag of highlightTags) {
      if (expandedTags.has(tag)) {
        score += 2;
      }
    }

    return { row: h, score };
  });

  const keywordRanked = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (keywordRanked.length === 0) {
    return data
      .filter(h => (h.tags || []).some((t: string) =>
        ["Life", "Success", "Habits", "Purpose", "Motivation"].includes(t)
      ))
      .slice(0, 5)
      .map(toHighlight);
  }

  // Take top 20 for AI semantic re-ranking
  const top20 = keywordRanked.slice(0, 20);
  const top20Highlights = top20.map((s) => toHighlight(s.row));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const { data: rerankData, error: rerankError } = await supabase.functions.invoke(
      "rerank-highlights",
      {
        body: { query, highlights: top20Highlights },
      }
    );

    clearTimeout(timeout);

    const aiScores: number[] = rerankData?.scores || [];
    if (!rerankError && aiScores.length === top20.length) {
      const combined = top20.map((item, i) => ({
        ...item,
        combinedScore: item.score * (aiScores[i] / 10),
      }));
      combined.sort((a, b) => b.combinedScore - a.combinedScore);
      return combined.slice(0, 8).map((s) => toHighlight(s.row));
    }
  } catch {
    // AI re-ranking failed — fall back to keyword order
  }

  return top20Highlights.slice(0, 10);
}

export async function getAllTopics(): Promise<Topic[]> {
  // Fetch ALL highlights — only the tags column — no row limit
  const { data, error } = await supabase
    .from("highlights")
    .select("tags");

  if (error || !data) return [];

  // Count occurrences of each tag, normalising to Title Case to merge duplicates
  const tagCounts: Record<string, number> = {};
  for (const row of data) {
    for (const tag of row.tags || []) {
      const normalisedTag = tag.trim().split(" ")
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
      tagCounts[normalisedTag] = (tagCounts[normalisedTag] || 0) + 1;
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

  // Fetch avg char_length per book
  const { data: avgData } = await supabase
    .from("highlights")
    .select("book_id, char_length");

  const bookAvg: Record<string, number[]> = {};
  for (const row of avgData || []) {
    if (row.book_id && row.char_length) {
      if (!bookAvg[row.book_id]) bookAvg[row.book_id] = [];
      bookAvg[row.book_id].push(row.char_length);
    }
  }

  return data.map((row) => {
    const book = toBook(row);
    const lengths = bookAvg[row.id] || [];
    book.avgHighlightLength = lengths.length > 0
      ? Math.round(lengths.reduce((a: number, b: number) => a + b, 0) / lengths.length)
      : 0;
    return book;
  });
}

export async function getRecommendedBooks(
  query: string,
  matchedHighlights: Highlight[]
): Promise<(Book & { matchedHighlightCount: number })[]> {
  // Step 1: Count highlight contributions per book
  const bookHighlightCounts: Record<string, number> = {};

  for (const highlight of matchedHighlights) {
    if (highlight.bookId) {
      bookHighlightCounts[highlight.bookId] =
        (bookHighlightCounts[highlight.bookId] || 0) + 1;
    }
  }

  // Step 2: Sort books by how many matched highlights they contributed
  const rankedBookIds = Object.entries(bookHighlightCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([bookId]) => bookId);

  // Step 3: Fetch full book details for top 3 books
  if (rankedBookIds.length > 0) {
    const { data, error } = await supabase
      .from("books")
      .select("*, highlights(count)")
      .in("id", rankedBookIds);

    if (!error && data) {
      const bookMap = new Map(data.map((b) => [b.id, b]));
      const rankedBooks = rankedBookIds
        .filter((id) => bookMap.has(id))
        .map((id) => ({
          ...toBook(bookMap.get(id)),
          matchedHighlightCount: bookHighlightCounts[id] || 0,
        }));

      if (rankedBooks.length >= 3) return rankedBooks;

      // Step 4: Fallback — fill remaining slots with keyword-matched books
      const existingIds = new Set(rankedBookIds);
      const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

      const { data: allBooks } = await supabase
        .from("books")
        .select("*, highlights(count)")
        .limit(50);

      if (allBooks) {
        const fallbacks = allBooks
          .filter((b) => !existingIds.has(b.id))
          .map((b) => {
            let score = 0;
            const searchText = `${b.title} ${b.author} ${b.description || ""}`.toLowerCase();
            for (const word of words) {
              if (searchText.includes(word)) score++;
            }
            return { book: b, score };
          })
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3 - rankedBooks.length)
          .map((s) => ({ ...toBook(s.book), matchedHighlightCount: 0 }));

        return [...rankedBooks, ...fallbacks];
      }

      return rankedBooks;
    }
  }

  // Full fallback: keyword search if no highlights had book IDs
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return [];

  const { data, error } = await supabase
    .from("books")
    .select("*, highlights(count)")
    .limit(50);

  if (error || !data) return [];

  return data
    .map((b) => {
      let score = 0;
      const searchText = `${b.title} ${b.author} ${b.description || ""}`.toLowerCase();
      for (const word of words) {
        if (searchText.includes(word)) score++;
      }
      return { book: b, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => ({ ...toBook(s.book), matchedHighlightCount: 0 }));
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
