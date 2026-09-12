import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TagItem {
  name: string;
  count: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tags } = await req.json();

    if (!Array.isArray(tags) || tags.length === 0) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validTags = tags.filter(
      (t): t is TagItem =>
        t && typeof t.name === "string" && typeof t.count === "number"
    );

    if (validTags.length === 0) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tagLines = validTags
      .map((t) => `Tag: ${t.name} (${t.count} highlights)`)
      .join("\n");

    const prompt = `You are a tag taxonomy analyst for a personal wisdom library. Given a list of tags with their usage counts, identify pairs of tags that are semantically redundant or overlapping. For each pair, explain why they overlap and which one to keep. Be conservative — only flag clear overlaps, not tangential relationships.

Return ONLY a JSON array, no prose:
[{
  tag1: string,
  tag2: string,
  reason: string,
  keep: string,
  confidence: 'high' | 'medium' | 'low'
}]

Tags:
${tagLines}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        max_tokens: 1500,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error (analyse-tags):", response.status, await response.text());
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const match = content.match(/\[[\s\S]*?\]/);
    if (!match) {
      console.error("Could not parse suggestions from:", content);
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      console.error("JSON parse failed:", e, "raw:", match[0]);
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(parsed)) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const valid = parsed.filter(
      (item: any) =>
        item &&
        typeof item.tag1 === "string" &&
        typeof item.tag2 === "string" &&
        typeof item.reason === "string" &&
        typeof item.keep === "string" &&
        ["high", "medium", "low"].includes(item.confidence)
    );

    return new Response(JSON.stringify({ suggestions: valid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyse-tags:", error);
    return new Response(JSON.stringify({ suggestions: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
