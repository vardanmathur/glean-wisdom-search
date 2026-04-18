import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Module-level Supabase client — reuses HTTP connection across invocations on a warm isolate
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

// L2-normalize a vector to unit length (no-op if zero-norm)
function l2Normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  let t1 = t0;
  let t2 = t0;
  let t3 = t0;

  try {
    const { query, wordCount: rawWordCount } = await req.json();
    const wordCount = Number.isFinite(Number(rawWordCount)) && Number(rawWordCount) > 0
      ? Math.floor(Number(rawWordCount))
      : 5;

    // Length-adjusted thresholds: shorter queries are intrinsically less specific,
    // so we lower the bar; longer queries demand precision. Tuned for Gemini-768
    // truncated embeddings whose cosine range compresses around 0.5–0.7.
    let hardFloor: number;
    let coverageThreshold: number;
    if (wordCount <= 4) {
      hardFloor = 0.52;
      coverageThreshold = 0.56;
    } else if (wordCount <= 7) {
      hardFloor = 0.52;
      coverageThreshold = 0.55;
    } else {
      hardFloor = 0.55;
      coverageThreshold = 0.57;
    }

    if (!query || typeof query !== "string" || !query.trim()) {
      return new Response(
        JSON.stringify({
          results: [],
          coverage: "poor",
          suggestions: [],
          message: "Empty query",
          timings: { embedding_ms: 0, pgvector_ms: 0, scoring_ms: 0, total_ms: 0 },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      console.error("GEMINI_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Embed the query with Gemini
    const embeddingResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: query }] },
          outputDimensionality: 768,
        }),
      }
    );

    if (!embeddingResponse.ok) {
      const errText = await embeddingResponse.text();
      console.error("Gemini embed error:", embeddingResponse.status, errText);
      return new Response(
        JSON.stringify({ error: "Embedding failed", status: embeddingResponse.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const embeddingData = await embeddingResponse.json();
    const rawVector: number[] | undefined =
      embeddingData?.embedding?.values || embeddingData?.embedding?.value;

    // Gemini's outputDimensionality=768 returns truncated, non-unit vectors (norm ~0.58).
    // L2-normalize so cosine scores span the full 0-1 range and match unit-norm stored vectors.
    const queryVector = rawVector && Array.isArray(rawVector) && rawVector.length > 0
      ? l2Normalize(rawVector)
      : undefined;
    t1 = Date.now();

    if (!queryVector || queryVector.length === 0) {
      console.error("No embedding vector returned:", JSON.stringify(embeddingData).slice(0, 500));
      return new Response(JSON.stringify({ error: "No embedding returned" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Run pgvector cosine similarity via the SECURITY DEFINER RPC.
    //    Reuses the module-level supabase-js client → no per-request TLS+auth handshake.
    const { data: rows, error: rpcError } = await supabase.rpc("match_highlights", {
      query_embedding: queryVector,
      match_count: 50,
    });
    t2 = Date.now();

    if (rpcError) {
      console.error("match_highlights RPC error:", rpcError);
      return new Response(
        JSON.stringify({ error: "Vector search failed", details: rpcError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!rows || rows.length === 0) {
      t3 = Date.now();
      const timings = {
        embedding_ms: t1 - t0,
        pgvector_ms: t2 - t1,
        scoring_ms: t3 - t2,
        total_ms: t3 - t0,
      };
      console.log("[search-semantic] timings (no rows):", timings);
      return new Response(
        JSON.stringify({
          results: [],
          coverage: "poor",
          suggestions: [],
          message:
            "Glean doesn't have strong coverage on this topic yet. Here are a few loosely related ideas that might still help.",
          timings,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Pure vector scoring — keyword blending was found to actively hurt natural-language
    //    queries (semantic top results paraphrase concepts and have zero literal-keyword overlap,
    //    so blending collapsed their scores while inflating off-topic items with stopword matches).
    const scored = rows.map((r: any) => {
      const vScore = Math.max(0, Math.min(1, Number(r.vector_score) || 0));
      return {
        id: r.id,
        quote: r.quote,
        book_id: r.book_id,
        tags: r.tags || [],
        my_notes: r.my_notes,
        vector_score: vScore,
        final_score: vScore,
      };
    });

    scored.sort((a, b) => b.final_score - a.final_score);

    const topScore = scored[0]?.final_score || 0;
    const threshold = Math.max(topScore * 0.8, coverageThreshold);

    const tierFor = (s: number): "strong" | "good" | "moderate" | "excluded" => {
      if (s >= 0.67) return "strong";
      if (s >= 0.62) return "good";
      if (s >= 0.50) return "moderate";
      return "excluded";
    };

    const aboveThreshold = scored.filter((s) => s.final_score >= threshold && s.final_score >= hardFloor);
    const capped = aboveThreshold.slice(0, 15).map((s) => ({ ...s, tier: tierFor(s.final_score) }));

    t3 = Date.now();
    const timings = {
      embedding_ms: t1 - t0,
      pgvector_ms: t2 - t1,
      scoring_ms: t3 - t2,
      total_ms: t3 - t0,
    };
    console.log("[search-semantic] timings:", timings, "wordCount:", wordCount, "hardFloor:", hardFloor, "coverageThreshold:", coverageThreshold);

    // Poor coverage: nothing meets 0.50
    if (capped.length === 0) {
      const suggestions = scored.slice(0, 3).map((s) => ({ ...s, tier: tierFor(s.final_score) }));
      return new Response(
        JSON.stringify({
          results: [],
          coverage: "poor",
          suggestions,
          message:
            "Glean doesn't have strong coverage on this topic yet. Here are a few loosely related ideas that might still help.",
          timings,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        results: capped,
        coverage: "good",
        message: null,
        timings,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in search-semantic:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
