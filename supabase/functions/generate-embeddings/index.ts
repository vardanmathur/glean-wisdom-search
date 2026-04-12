import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 50;

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get total count of highlights without embeddings
    const { count: remaining, error: countError } = await supabase
      .from("highlights")
      .select("id", { count: "exact", head: true })
      .is("embedding", null);

    if (countError) throw countError;

    const { count: totalCount } = await supabase
      .from("highlights")
      .select("id", { count: "exact", head: true });

    if (remaining === 0) {
      return new Response(JSON.stringify({
        processed: 0,
        remaining: 0,
        total: totalCount ?? 0,
        message: "All highlights already have embeddings.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch batch
    const { data: batch, error: fetchError } = await supabase
      .from("highlights")
      .select("id, quote")
      .is("embedding", null)
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;

    let processed = 0;
    const errors: string[] = [];

    for (const highlight of batch!) {
      try {
        const embResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: { parts: [{ text: highlight.quote }] },
              outputDimensionality: 768,
            }),
          }
        );

        if (!embResponse.ok) {
          const errText = await embResponse.text();
          console.error(`Embedding failed for ${highlight.id}: ${errText}`);
          errors.push(highlight.id);
          continue;
        }

        const embData = await embResponse.json();
        const embedding = embData.embedding?.values;

        if (!embedding || embedding.length !== 768) {
          console.error(`Invalid embedding for ${highlight.id}: got ${embedding?.length ?? 0} dims`);
          errors.push(highlight.id);
          continue;
        }

        // Write embedding as a pgvector-compatible string
        const vectorStr = `[${embedding.join(",")}]`;
        const { error: updateError } = await supabase
          .from("highlights")
          .update({ embedding: vectorStr })
          .eq("id", highlight.id);

        if (updateError) {
          console.error(`Update failed for ${highlight.id}:`, updateError.message);
          errors.push(highlight.id);
          continue;
        }

        processed++;
      } catch (e) {
        console.error(`Error processing ${highlight.id}:`, e);
        errors.push(highlight.id);
      }
    }

    const newRemaining = (remaining ?? 0) - processed;

    return new Response(JSON.stringify({
      processed,
      remaining: newRemaining,
      total: totalCount ?? 0,
      errors: errors.length > 0 ? errors : undefined,
      message: newRemaining > 0
        ? "Batch complete. Call again to process next batch."
        : "All highlights now have embeddings!",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-embeddings error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
