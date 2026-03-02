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
    const { question, highlights } = await req.json();

    if (!highlights || highlights.length === 0) {
      return new Response(JSON.stringify({ synthesis: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const highlightText = highlights
      .slice(0, 8)
      .map((h: any, i: number) => `${i + 1}. "${h.text}" — ${h.bookTitle} by ${h.author}`)
      .join("\n");

    const prompt = `You are Glean, a wisdom advisor that helps people find clarity through curated book insights.

A user has asked: "${question}"

Here are the most relevant highlights from curated books that relate to their question:

${highlightText}

Write a warm, thoughtful, personal response (150-200 words) that:
- Directly addresses their specific situation and question
- Synthesises the key insight that emerges from these highlights
- Feels like advice from a wise, experienced friend — not a generic self-help article
- Does NOT quote the highlights directly — synthesise them into your own guidance
- Ends with one short, memorable takeaway sentence

Do not use bullet points. Write in flowing prose. Be specific to their question, not generic.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", await response.text());
      return new Response(JSON.stringify({ synthesis: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const synthesis = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ synthesis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in synthesise-wisdom:", error);
    return new Response(JSON.stringify({ synthesis: "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
