import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an executive coach helping someone apply wisdom to their specific challenge. Your style is provocative, personal, and action-oriented.

Generate exactly 4 reflection questions:
1. A diagnostic provocation — what is really going on beneath the surface of their situation?
2. A personal mirror — which part of the wisdom applies most directly to them, and why are they resisting it?
3. A smallest-step question — what is ONE small daily change (less than 5 minutes) they could make starting tomorrow?
4. An accountability question — who in their life could help them stay honest about following through?

Rules:
- Sound like a coach, not a consultant
- Provocative and personal, not generic
- Specific to the query
- No yes/no questions
- Max 20 words per question
- Return ONLY a JSON array of 4 strings, no preamble, no numbering, no markdown`;

const FALLBACK = [
  "What is the real fear underneath this challenge that you have not named yet?",
  "Which piece of this wisdom stings the most, and what does that tell you about yourself?",
  "What is the smallest five-minute action you could take tomorrow morning to move forward?",
  "Who in your life will you ask to hold you accountable, and when will you tell them?",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, synthesis } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userContent = `The person's situation/question:\n"${query}"\n\nThe wisdom synthesis they were given:\n${synthesis || "(no synthesis available)"}\n\nReturn ONLY a JSON array of exactly 4 question strings.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ questions: FALLBACK }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const raw = data.choices?.[0]?.message?.content || "";

    let questions: string[] = [];
    try {
      const cleaned = raw.replace(/```json\s*|```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        questions = parsed.filter((q) => typeof q === "string" && q.trim().length > 0);
      }
    } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) {
            questions = parsed.filter((q) => typeof q === "string" && q.trim().length > 0);
          }
        } catch { /* noop */ }
      }
    }

    if (questions.length < 4) {
      questions = [...questions, ...FALLBACK].slice(0, 4);
    } else {
      questions = questions.slice(0, 4);
    }

    return new Response(JSON.stringify({ questions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-reflection-questions:", error);
    return new Response(JSON.stringify({ questions: FALLBACK }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
