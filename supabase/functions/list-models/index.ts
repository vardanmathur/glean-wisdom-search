import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Try listing models
  const listRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`
  );
  const listData = await listRes.json();

  if (listData.error) {
    return new Response(JSON.stringify({ error: "API key error", details: listData.error }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Filter to embedding-capable models
  const embeddingModels = (listData.models || [])
    .filter((m: any) => m.supportedGenerationMethods?.includes("embedContent"))
    .map((m: any) => ({ name: m.name, displayName: m.displayName, methods: m.supportedGenerationMethods }));

  return new Response(JSON.stringify({ 
    totalModels: listData.models?.length ?? 0,
    embeddingModels 
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
