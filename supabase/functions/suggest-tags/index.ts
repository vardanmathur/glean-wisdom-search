import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { quote, bookTitle, tags } = await req.json();

    if (!quote || typeof quote !== "string" || quote.trim().length < 20) {
      return new Response(JSON.stringify({ tags: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(tags) || tags.length === 0) {
      return new Response(JSON.stringify({ tags: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are tagging a book highlight for a personal wisdom library.

Choose the 2-4 tags that best describe what this passage is ABOUT — its central idea, not incidental words it happens to contain.

Rules:
- Use ONLY tags from the list below, copied exactly as written
- Prefer specific tags over broad ones
- Only use broad tags like "Life", "People", or "Thinking" when nothing more specific genuinely fits
- Return ONLY a JSON array of strings, nothing else — no prose, no explanation, no markdown

Available tags:
${tags.join(", ")}

${bookTitle ? `From the book: "${bookTitle}"\n\n` : ""}Passage:
"""
${quote.trim().slice(0, 2000)}
"""`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 150,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error (suggest-tags):", response.status, await response.text());
      return new Response(JSON.stringify({ tags: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const match = content.match(/\[[\s\S]*?\]/);
    if (!match) {
      console.error("Could not parse tags from:", content);
      return new Response(JSON.stringify({ tags: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      console.error("JSON parse failed:", e, "raw:", match[0]);
      return new Response(JSON.stringify({ tags: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(parsed)) {
      return new Response(JSON.stringify({ tags: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate against the taxonomy passed in the request — case-insensitive
    // match, mapped back to the caller's canonical casing. Never trust the
    // model's casing or invent tags outside what was offered.
    const canonicalByLower = new Map(tags.map((t: string) => [String(t).trim().toLowerCase(), t]));
    const validated: string[] = [];
    for (const t of parsed) {
      const canonical = canonicalByLower.get(String(t).trim().toLowerCase());
      if (canonical && !validated.includes(canonical)) {
        validated.push(canonical);
      }
    }

    return new Response(JSON.stringify({ tags: validated.slice(0, 4) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in suggest-tags:", error);
    return new Response(JSON.stringify({ tags: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
