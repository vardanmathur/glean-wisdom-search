import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CACHE_TTL_DAYS = 180;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookId, bookTitle, author, highlights } = await req.json();

    if (!bookId || !bookTitle || !Array.isArray(highlights) || highlights.length === 0) {
      return new Response(JSON.stringify({ error: "Missing or invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- Cache check ---
    const { data: cached } = await supabase
      .from("book_summaries")
      .select("summary, manually_edited, generated_at")
      .eq("book_id", bookId)
      .maybeSingle();

    if (cached) {
      if (cached.manually_edited) {
        return new Response(JSON.stringify({ summary: cached.summary }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const ageMs = Date.now() - new Date(cached.generated_at).getTime();
      if (ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) {
        return new Response(JSON.stringify({ summary: cached.summary }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // --- Generate fresh ---
    const sample = highlights
      .slice(0, 20)
      .map((q: string, i: number) => `${i + 1}. ${q}`)
      .join("\n");

    const systemPrompt =
      "You are a thoughtful literary curator. Given a collection of highlights from a book, write a 3-4 sentence summary that captures the book's core thesis, its most important insight, and why a busy professional should read it. Write in second person (e.g. 'This book will show you...'). Be specific — use details from the highlights, not generic praise. Max 80 words.";

    const userContent = `Book: ${bookTitle}\nAuthor: ${author || "Unknown"}\n\nHighlights:\n${sample}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 400,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI gateway error (generate-book-summary):", aiResponse.status, await aiResponse.text());
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResponse.json();
    const summary = data.choices?.[0]?.message?.content?.trim() || "";

    if (!summary) {
      return new Response(JSON.stringify({ error: "Empty summary" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Upsert cache ---
    const { error: upsertError } = await supabase
      .from("book_summaries")
      .upsert(
        {
          book_id: bookId,
          summary,
          manually_edited: false,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "book_id" }
      );

    if (upsertError) {
      console.error("Cache write error:", upsertError.message);
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-book-summary:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
