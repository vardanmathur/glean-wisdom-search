import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BookResult {
  title: string;
  author: string | null;
  isbn: string | null;
  coverUrl: string | null;
  source: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, author, offset } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid query" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startIndex = typeof offset === "number" ? offset : 0;
    const authorStr = typeof author === "string" ? author.trim() : "";
    const googleKey = Deno.env.get("GOOGLE_BOOKS_API_KEY");

    const books: BookResult[] = [];
    let googleCount = 0;
    let openLibraryCount = 0;

    // --- Google Books ---
    if (googleKey) {
      try {
        const q = authorStr
          ? `intitle:${encodeURIComponent(query)}+inauthor:${encodeURIComponent(authorStr)}`
          : encodeURIComponent(query);
        const res = await fetch(
          `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=10&startIndex=${startIndex}&key=${googleKey}`
        );
        if (res.ok) {
          const json = await res.json();
          const items = json.items ?? [];
          googleCount = items.length;
          for (const item of items) {
            const vi = item?.volumeInfo;
            if (!vi?.title) continue;
            const ids = vi.industryIdentifiers ?? [];
            const isbn =
              ids.find((i: any) => i.type === "ISBN_13")?.identifier ??
              ids.find((i: any) => i.type === "ISBN_10")?.identifier ??
              null;
            const thumb = vi.imageLinks?.thumbnail;
            const coverUrl = thumb ? thumb.replace("zoom=1", "zoom=2") : null;
            books.push({
              title: vi.title,
              author: vi.authors?.[0] ?? null,
              isbn,
              coverUrl,
              source: "Google Books",
            });
          }
        }
      } catch { /* silent */ }
    }

    // --- Open Library ---
    try {
      const parts = authorStr.split(/\s+/).filter(Boolean);
      const olAuthor = parts.length > 1
        ? parts[parts.length - 1] + ", " + parts.slice(0, -1).join(" ")
        : authorStr;
      const res = await fetch(
        `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&author=${encodeURIComponent(olAuthor)}&limit=10&offset=${startIndex}`
      );
      if (res.ok) {
        const json = await res.json();
        const docs = json.docs ?? [];
        openLibraryCount = docs.length;
        for (const doc of docs) {
          if (!doc.title) continue;
          books.push({
            title: doc.title,
            author: doc.author_name?.[0] ?? null,
            isbn: doc.isbn?.[0] ?? null,
            coverUrl: doc.cover_i
              ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
              : null,
            source: "Open Library",
          });
        }
      }
    } catch { /* silent */ }

    // --- Dedupe ---
    const seenIsbn = new Set<string>();
    const seenTitleAuthor = new Set<string>();
    const combined: BookResult[] = [];

    for (const b of books) {
      if (b.isbn) {
        const cleanIsbn = b.isbn.replace(/[^0-9Xx]/g, "");
        if (seenIsbn.has(cleanIsbn)) continue;
        seenIsbn.add(cleanIsbn);
      } else {
        const key = `${b.title.toLowerCase().trim()}|${(b.author ?? "").toLowerCase().trim()}`;
        if (seenTitleAuthor.has(key)) continue;
        seenTitleAuthor.add(key);
      }
      combined.push(b);
      if (combined.length >= 5) break;
    }

    const hasMore = googleCount >= 10 || openLibraryCount >= 10;

    return new Response(JSON.stringify({ books: combined, hasMore }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in search-books:", error);
    return new Response(JSON.stringify({ books: [], hasMore: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
