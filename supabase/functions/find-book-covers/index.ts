import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Candidate {
  url: string;
  source: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, author, isbn } = await req.json();

    if (!title || typeof title !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const googleKey = Deno.env.get("GOOGLE_BOOKS_API_KEY");
    console.log("googleKey present:", !!googleKey);
    const candidates: Candidate[] = [];

    // --- ISBN candidates ---
    if (isbn && typeof isbn === "string" && isbn.trim()) {
      const cleanIsbn = isbn.trim();
      candidates.push({
        url: `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(cleanIsbn)}-L.jpg?default=false`,
        source: "Open Library (ISBN)",
      });

      if (googleKey) {
        try {
          const res = await fetch(
            `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(cleanIsbn)}&key=${googleKey}`
          );
          console.log("google isbn status:", res.status);
          if (res.ok) {
            const json = await res.json();
            console.log("google isbn items:", (json.items ?? []).length);
            for (const item of (json.items ?? []).slice(0, 2)) {
              const thumb = item?.volumeInfo?.imageLinks?.thumbnail;
              if (thumb) {
                candidates.push({
                  url: thumb.replace("zoom=1", "zoom=2"),
                  source: "Google Books (ISBN)",
                });
              }
            }
          }
        } catch { /* silent */ }
      }
    }

    // --- Title + author candidates (always run) ---
    const authorStr = typeof author === "string" ? author.trim() : "";
    const parts = authorStr.split(/\s+/).filter(Boolean);
    const olAuthor = parts.length > 1
      ? parts[parts.length - 1] + ", " + parts.slice(0, -1).join(" ")
      : authorStr;

    try {
      const res = await fetch(
        `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(olAuthor)}&limit=5`
      );
      if (res.ok) {
        const json = await res.json();
        for (const doc of (json.docs ?? []).filter((d: any) => d?.cover_i).slice(0, 3)) {
          candidates.push({
            url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
            source: "Open Library",
          });
        }
      }
    } catch { /* silent */ }

    if (googleKey) {
      try {
        const res = await fetch(
          `https://www.googleapis.com/books/v1/volumes?q=title:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(authorStr)}&maxResults=5&key=${googleKey}`
        );
        if (res.ok) {
          const json = await res.json();
          let added = 0;
          for (const item of json.items ?? []) {
            if (added >= 3) break;
            const thumb = item?.volumeInfo?.imageLinks?.thumbnail;
            if (thumb) {
              candidates.push({
                url: thumb.replace("zoom=1", "zoom=2"),
                source: "Google Books",
              });
              added++;
            }
          }
        }
      } catch { /* silent */ }
    }

    // --- Dedupe by URL, cap at 8 ---
    const seen = new Set<string>();
    const combined: Candidate[] = [];
    for (const c of candidates) {
      if (!c.url || seen.has(c.url)) continue;
      seen.add(c.url);
      combined.push(c);
      if (combined.length >= 8) break;
    }

    return new Response(JSON.stringify({ candidates: combined }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in find-book-covers:", error);
    return new Response(JSON.stringify({ candidates: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
