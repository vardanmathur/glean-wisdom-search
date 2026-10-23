import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, highlights } = await req.json();

    if (!highlights || highlights.length === 0) {
      return new Response(JSON.stringify({ scores: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const count = highlights.length;
    const highlightList = highlights
      .map((h: any, i: number) => `${i + 1}. "${h.text}" — ${h.bookTitle}`)
      .join("\n");

    const prompt = `A user asked: "${query}". Here are ${count} book highlights retrieved by keyword search. Rate each from 0-10 for semantic relevance to the user's actual question and situation. Consider meaning, not just word overlap. Return ONLY a valid JSON array of ${count} numbers, nothing else. Example: [7,3,9,2,8,1,6,4,7,5,3,8,2,9,1,6,4,7,3,8]

Highlights:
${highlightList}`;

    const aiController = new AbortController();
    const aiTimer = setTimeout(() => aiController.abort(), 30000);
    const aiStart = Date.now();
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      signal: aiController.signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        reasoning_effort: "none",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status, await response.text());
      return new Response(JSON.stringify({ scores: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    clearTimeout(aiTimer);
    const finishReason = data.choices?.[0]?.finish_reason;
    console.log("rerank-highlights", { finish_reason: finishReason, usage: data.usage, ms: Date.now() - aiStart });
    if (finishReason === "length") console.warn("rerank-highlights: finish_reason length", { usage: data.usage });
    const content = data.choices?.[0]?.message?.content || "";

    // Extract the JSON array from the response
    const match = content.match(/\[[\d,\s]+\]/);
    if (!match) {
      console.error("Could not parse scores from:", content);
      return new Response(JSON.stringify({ scores: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scores = JSON.parse(match[0]);
    if (!Array.isArray(scores) || scores.length !== count) {
      console.error("Score count mismatch:", scores.length, "vs", count);
      return new Response(JSON.stringify({ scores: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ scores }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if ((error as any)?.name === "AbortError") console.error("rerank-highlights: gateway timeout after 30s");
    console.error("Error in rerank-highlights:", error);
    return new Response(JSON.stringify({ scores: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
