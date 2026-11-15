import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildInstructions, detectImageMime, parseMode, parseModelReply, validateImage } from "./parse.ts";

// Reads the text in a photo of a book page. The image comes in as base64, goes to the AI gateway and is never
// stored. Only the finish reason, token usage and elapsed time are logged: never the image or the text.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Any signed-in user (Add highlight is open to everyone with an account)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);

  let body: { image?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const problem = validateImage(body.image);
  if (problem) return json({ error: problem }, 400);
  const mode = parseMode(body.mode);
  if (!mode) return json({ error: "mode must be auto or all" }, 400);

  const image = body.image as string;
  const mime = detectImageMime(image)!;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  const started = Date.now();
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      signal: controller.signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        reasoning_effort: "none",
        max_tokens: 3000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildInstructions(mode) },
              { type: "image_url", image_url: { url: `data:${mime};base64,${image}` } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      // Status only: the response body is not logged either.
      console.error("read-text-from-image: gateway error", { status: response.status, ms: Date.now() - started });
      if (response.status === 402) return json({ error: "credits" });
      if (response.status === 429) return json({ error: "rate_limit" });
      return json({ error: "failed" });
    }

    const data = await response.json();
    console.log("read-text-from-image", {
      finish_reason: data.choices?.[0]?.finish_reason,
      usage: data.usage,
      ms: Date.now() - started,
    });
    const result = parseModelReply(data.choices?.[0]?.message?.content);
    return json({ text: result.text, marked_found: result.marked_found });
  } catch (err) {
    console.error("read-text-from-image: failed", { name: err instanceof Error ? err.name : "error", ms: Date.now() - started });
    return json({ error: "failed" });
  } finally {
    clearTimeout(timer);
  }
});
