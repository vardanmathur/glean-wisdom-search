import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 50;

// L2-normalize a vector to unit length. Gemini's outputDimensionality=768
// returns truncated, non-unit vectors — normalizing makes cosine scores span
// the full 0-1 range so semantic search thresholds work as intended.
function l2Normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

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

  // Require authenticated admin user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(
    authHeader.replace("Bearer ", "")
  );
  if (claimsErr || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", claimsData.claims.sub)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Optional body:
  //   { ids: string[] }            — target specific highlights (still skips rows that already have embeddings)
  //   { ids: string[], force: true } — regenerate embeddings for those IDs even if non-null
  // When omitted, falls back to scanning all rows with NULL embedding.
  let targetIds: string[] | null = null;
  let force = false;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && Array.isArray(body.ids) && body.ids.length > 0) {
        targetIds = body.ids.filter((x: unknown) => typeof x === "string");
      }
      if (body && body.force === true) {
        force = true;
      }
    } catch {
      // no body / invalid json — ignore, fall back to global scan
    }
  }

  try {
    let remaining: number | null = null;
    let totalCount: number | null = null;

    if (targetIds) {
      let countQuery = supabase
        .from("highlights")
        .select("id", { count: "exact", head: true })
        .in("id", targetIds);
      if (!force) countQuery = countQuery.is("embedding", null);
      const { count, error: countError } = await countQuery;
      if (countError) throw countError;
      remaining = count ?? 0;
      totalCount = targetIds.length;
    } else {
      const { count, error: countError } = await supabase
        .from("highlights")
        .select("id", { count: "exact", head: true })
        .is("embedding", null);
      if (countError) throw countError;
      remaining = count ?? 0;

      const { count: tc } = await supabase
        .from("highlights")
        .select("id", { count: "exact", head: true });
      totalCount = tc ?? 0;
    }

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

    let fetchQuery = supabase
      .from("highlights")
      .select("id, quote, tags");

    if (!force) {
      fetchQuery = fetchQuery.is("embedding", null);
    }

    if (targetIds) {
      fetchQuery = fetchQuery.in("id", targetIds);
    }

    const { data: batch, error: fetchError } = await fetchQuery.limit(BATCH_SIZE);

    if (fetchError) throw fetchError;

    let processed = 0;
    const errorDetails: ErrorDetail[] = [];

    for (const highlight of batch!) {
      try {
        // Enrich the embedding input with topic tags so semantic search
        // weighs both the quote text and its categorisation. Existing rows
        // continue to use quote-only embeddings until manually regenerated.
        const textToEmbed = highlight.tags && highlight.tags.length > 0
          ? `${highlight.quote}\n\nTopics: ${highlight.tags.join(", ")}`
          : highlight.quote;

        const embResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: { parts: [{ text: textToEmbed }] },
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

        const normalized = l2Normalize(embedding);
        const vectorStr = `[${normalized.join(",")}]`;
        const { error: updateError } = await supabase
          .from("highlights")
          .update({ embedding: vectorStr, embedding_refreshed_at: new Date().toISOString() })
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
