import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, keywordScores } = await req.json();

    if (!query || typeof query !== "string" || !query.trim()) {
      return new Response(
        JSON.stringify({ results: [], coverage: "poor", suggestions: [], message: "Empty query" }),
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
    const queryVector: number[] | undefined =
      embeddingData?.embedding?.values || embeddingData?.embedding?.value;

    if (!queryVector || !Array.isArray(queryVector) || queryVector.length === 0) {
      console.error("No embedding vector returned:", JSON.stringify(embeddingData).slice(0, 500));
      return new Response(JSON.stringify({ error: "No embedding returned" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Run pgvector cosine similarity via service role + raw SQL through PostgREST
    // We use a parameterised raw query via the PG REST endpoint isn't possible directly,
    // so we leverage the supabase-js client + a small SECURITY-DEFINER-free approach:
    // call the postgres meta endpoint via fetch using PostgREST RPC isn't available either.
    // Instead use the pg connection via the `postgres` function endpoint.
    //
    // Simplest reliable path: use supabase.rpc-less approach with PostgREST + a view is overkill.
    // We'll execute via PostgREST by building the query through fetch directly to PG via /rest/v1/rpc
    // — but no RPC exists. Per user request (no migration), we use the raw SQL through
    // the Supabase service role using the `pg-meta` style fetch to /pg-meta isn't standard.
    //
    // Working solution: connect via the Postgres direct URL (SUPABASE_DB_URL is available as a secret
    // for db tooling) using the `postgres` deno driver.

    // Use the postgres deno driver via the SUPABASE_DB_URL secret
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) {
      console.error("SUPABASE_DB_URL not available");
      return new Response(JSON.stringify({ error: "Database URL not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.4/mod.js");
    const sql = postgres(dbUrl, { prepare: false, max: 1 });

    const vectorLiteral = `[${queryVector.join(",")}]`;

    let rows: any[] = [];
    try {
      rows = await sql`
        SELECT
          h.id,
          h.quote,
          h.book_id,
          h.tags,
          h.my_notes,
          1 - (h.embedding <=> ${vectorLiteral}::vector) AS vector_score
        FROM highlights h
        WHERE h.embedding IS NOT NULL
          AND (h.visibility = 'public' OR h.visibility IS NULL)
        ORDER BY h.embedding <=> ${vectorLiteral}::vector
        LIMIT 50
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }

    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({
          results: [],
          coverage: "poor",
          suggestions: [],
          message:
            "Glean doesn't have strong coverage on this topic yet. Here are a few loosely related ideas that might still help.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Hybrid scoring
    const scoresMap: Record<string, number> = keywordScores && typeof keywordScores === "object" ? keywordScores : {};
    const maxKeyword = Math.max(0, ...Object.values(scoresMap).map((v) => Number(v) || 0));
    const hasKeyword = maxKeyword > 0;

    const scored = rows.map((r: any) => {
      const vScore = Math.max(0, Math.min(1, Number(r.vector_score) || 0));
      let finalScore = vScore;
      if (hasKeyword) {
        const k = Number(scoresMap[r.id] || 0) / maxKeyword;
        finalScore = 0.7 * vScore + 0.3 * k;
      }
      return {
        id: r.id,
        quote: r.quote,
        book_id: r.book_id,
        tags: r.tags || [],
        my_notes: r.my_notes,
        vector_score: vScore,
        final_score: finalScore,
      };
    });

    scored.sort((a, b) => b.final_score - a.final_score);

    const topScore = scored[0]?.final_score || 0;
    const threshold = Math.max(topScore * 0.8, 0.6);

    const tierFor = (s: number): "strong" | "good" | "moderate" | "excluded" => {
      if (s >= 0.85) return "strong";
      if (s >= 0.75) return "good";
      if (s >= 0.65) return "moderate";
      return "excluded";
    };

    const aboveThreshold = scored.filter((s) => s.final_score >= threshold && s.final_score >= 0.65);
    const capped = aboveThreshold.slice(0, 15).map((s) => ({ ...s, tier: tierFor(s.final_score) }));

    // Poor coverage: nothing meets 0.65
    if (capped.length === 0) {
      const suggestions = scored.slice(0, 3).map((s) => ({ ...s, tier: tierFor(s.final_score) }));
      return new Response(
        JSON.stringify({
          results: [],
          coverage: "poor",
          suggestions,
          message:
            "Glean doesn't have strong coverage on this topic yet. Here are a few loosely related ideas that might still help.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        results: capped,
        coverage: "good",
        message: null,
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
