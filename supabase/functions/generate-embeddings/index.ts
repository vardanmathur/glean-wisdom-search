import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 50;

interface ErrorDetail {
  highlight_id: string;
  quote_length: number;
  error_message: string;
  http_status: number | null;
}

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

    const { data: batch, error: fetchError } = await supabase
      .from("highlights")
      .select("id, quote")
      .is("embedding", null)
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;

    let processed = 0;
    const errorDetails: ErrorDetail[] = [];

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
          const detail: ErrorDetail = {
            highlight_id: highlight.id,
            quote_length: highlight.quote?.length ?? 0,
            error_message: errText,
            http_status: embResponse.status,
          };
          console.error(`Embedding API failed for ${highlight.id} (quote_length=${detail.quote_length}, status=${embResponse.status}): ${errText}`);
          errorDetails.push(detail);
          continue;
        }

        const embData = await embResponse.json();
        const embedding = embData.embedding?.values;

        if (!embedding || embedding.length !== 768) {
          const detail: ErrorDetail = {
            highlight_id: highlight.id,
            quote_length: highlight.quote?.length ?? 0,
            error_message: `Invalid embedding dimensions: got ${embedding?.length ?? 0}, expected 768`,
            http_status: embResponse.status,
          };
          console.error(`Invalid embedding for ${highlight.id}: ${detail.error_message}`);
          errorDetails.push(detail);
          continue;
        }

        const vectorStr = `[${embedding.join(",")}]`;
        const { error: updateError } = await supabase
          .from("highlights")
          .update({ embedding: vectorStr })
          .eq("id", highlight.id);

        if (updateError) {
          const detail: ErrorDetail = {
            highlight_id: highlight.id,
            quote_length: highlight.quote?.length ?? 0,
            error_message: `DB update failed: ${updateError.message}`,
            http_status: null,
          };
          console.error(`Update failed for ${highlight.id}: ${updateError.message}`);
          errorDetails.push(detail);
          continue;
        }

        processed++;
      } catch (e) {
        const detail: ErrorDetail = {
          highlight_id: highlight.id,
          quote_length: highlight.quote?.length ?? 0,
          error_message: `Exception: ${e instanceof Error ? e.message : String(e)}`,
          http_status: null,
        };
        console.error(`Error processing ${highlight.id}: ${e}`);
        errorDetails.push(detail);
      }
    }

    const newRemaining = (remaining ?? 0) - processed;

    return new Response(JSON.stringify({
      processed,
      remaining: newRemaining,
      total: totalCount ?? 0,
      errors: errorDetails.length > 0 ? errorDetails.map(d => d.highlight_id) : undefined,
      error_details: errorDetails.length > 0 ? errorDetails : undefined,
      message: newRemaining > 0
        ? "Batch complete. Call again to process next batch."
        : "All highlights now have embeddings!",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-embeddings error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
