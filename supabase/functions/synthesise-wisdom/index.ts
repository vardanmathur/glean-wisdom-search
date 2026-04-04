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

    const prompt = `You are Glean — a thoughtful, well-read friend who helps people find clarity through the wisdom of great books. You are warm, direct, and specific. You never sound like a self-help article or a corporate chatbot.

A person has come to you with this situation or question:
"${question}"

You have retrieved these highlights from curated books that are relevant to their situation:
${highlightText}

Write a response using EXACTLY this structure. Use the section labels as shown — they will be displayed as headers in the UI:

---

MY UNDERSTANDING OF YOUR PROBLEM
[EXACTLY 2 sentences. Never write more than 2 sentences for this section. Show you have genuinely understood their specific situation. Do not paraphrase their question back at them — interpret what is underneath it. What is the real tension or challenge they are facing? Be specific to their words, not generic.]

WHAT THE BOOKS SUGGEST
[2-3 short paragraphs, each built around one insight drawn DIRECTLY from one of the retrieved highlights. Start each paragraph with the book name in bold followed by a dash and the insight. Format: **Book Title** — insight text. Do not quote the highlight verbatim — synthesise it into your own words and connect it explicitly to their situation. Each paragraph should feel like it was written because of that specific highlight, not despite it.]

ONE THING WORTH TRYING
[1-2 sentences of a specific, practical suggestion. Not generic advice like "reflect on your values." Something concrete they could actually do this week. Ground it in the highlights where possible.]

A BOOK WORTH READING
[Name one specific book from the retrieved highlights that you think would help them most with this particular situation. Say which book and in one sentence say exactly why it fits their situation — not a generic description of the book.]

SOMETHING TO SIT WITH
[One short, honest question for them to reflect on. Make it specific to their situation. Not a generic coaching question — something that might genuinely stop them in their tracks.]

---

Tone rules:
- Write like a thoughtful, well-read friend — warm, direct, a little wise
- Never use bullet points within sections
- Never use phrases like "it's important to", "it is worth noting", "in conclusion", "I hope this helps"
- Never give generic self-help advice that could apply to anyone
- Every sentence should feel like it was written for THIS person and THIS situation
- If the highlights don't perfectly match the question, be honest — say "the books don't speak to this directly, but here's what comes closest and why it might still help"
- Keep the entire response under 350 words
- Use plain, conversational English — no jargon, no corporate language`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 800,
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
