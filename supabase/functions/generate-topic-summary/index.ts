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
    const { topicName, highlights } = await req.json();

    if (!topicName || !highlights || !Array.isArray(highlights) || highlights.length === 0) {
      return new Response(JSON.stringify({ summary: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sampleHighlights = highlights.slice(0, 5).join("\n\n");

    const prompt = `You are a wisdom curator for Glean, a platform built on curated book highlights. 
Given the topic "${topicName}" and these highlight samples, write a 2-3 sentence 
synthesis that captures the core insight this topic offers readers. 

Write in second person, directly addressing the reader. Be specific and insightful 
— not generic. Do not use phrases like "this topic covers" or "highlights include". 
Just deliver the insight directly as if you are a wise mentor speaking to someone 
who needs this wisdom right now.

Sample highlights:
${sampleHighlights}`;

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
      console.error("AI gateway error (generate-topic-summary):", response.status, await response.text());
      return new Response(JSON.stringify({ summary: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-topic-summary:", error);
    return new Response(JSON.stringify({ summary: "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

