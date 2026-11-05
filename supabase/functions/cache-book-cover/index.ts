import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Keeps our own copy of each book's cover in the public "covers" bucket.
// Input is book ids only: the source URL always comes from books.cover_image_url, never from the client.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "covers";
const MAX_BOOKS = 10;
const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// http/https only, and never an address on a private or local network.
function isAllowedSource(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host === "[::1]") return false;
  if (/^(127|10|0)[.]/.test(host) || /^192[.]168[.]/.test(host) || /^169[.]254[.]/.test(host)) return false;
  const m = host.match(/^172[.](\d+)[.]/);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return false;
  return true;
}

// Reads the body but gives up as soon as it passes the size limit.
async function readLimited(res: Response, limit: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Require authenticated admin user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", claimsData.claims.sub)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json({ error: "Forbidden" }, 403);

  // Body: { book_ids: string[] } (max 10). Nothing else is read from the client.
  let bookIds: string[] = [];
  try {
    const body = await req.json();
    if (body && Array.isArray(body.book_ids)) {
      bookIds = [...new Set(body.book_ids.filter((x: unknown): x is string => typeof x === "string" && x.length > 0))];
    }
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (bookIds.length === 0) return json({ error: "book_ids is required" }, 400);
  if (bookIds.length > MAX_BOOKS) return json({ error: `At most ${MAX_BOOKS} book_ids per call` }, 400);

  const storage = supabase.storage.from(BUCKET);

  const listFiles = async (bookId: string): Promise<string[]> => {
    const { data, error } = await storage.list(bookId, { limit: 100 });
    if (error) throw error;
    return (data ?? []).map((f) => f.name).filter(Boolean);
  };

  const processBook = async (bookId: string): Promise<{ book_id: string; status: string }> => {
    try {
      const { data: book, error } = await supabase
        .from("books")
        .select("id, cover_image_url, cover_cached_url, cover_cached_from")
        .eq("id", bookId)
        .maybeSingle();
      if (error) throw error;
      if (!book) return { book_id: bookId, status: "not_found" };

      const source = (book.cover_image_url ?? "").trim();

      // No original cover any more: remove our copy and clear the columns.
      if (!source) {
        const names = await listFiles(bookId);
        if (names.length > 0) {
          const { error: rmErr } = await storage.remove(names.map((n) => `${bookId}/${n}`));
          if (rmErr) throw rmErr;
        }
        const { error: clearErr } = await supabase
          .from("books")
          .update({ cover_cached_url: null, cover_cached_from: null, cover_cached_at: null })
          .eq("id", bookId)
          .is("cover_image_url", null);
        if (clearErr) throw clearErr;
        return { book_id: bookId, status: "cleared" };
      }

      // Already a copy of this exact original.
      if (book.cover_cached_url && book.cover_cached_from === source) return { book_id: bookId, status: "current" };

      if (!isAllowedSource(source)) return { book_id: bookId, status: "failed: source not allowed" };

      // Download: follows redirects, 15s limit, 2xx, image/*, <= 2 MB.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let bytes: Uint8Array | null = null;
      let contentType = "";
      try {
        const res = await fetch(source, { redirect: "follow", signal: controller.signal });
        if (res.status < 200 || res.status > 299) return { book_id: bookId, status: `failed: http ${res.status}` };
        contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        if (!contentType.startsWith("image/")) return { book_id: bookId, status: "failed: not an image" };
        if (!EXTENSIONS[contentType]) return { book_id: bookId, status: `failed: unsupported type ${contentType}` };
        bytes = await readLimited(res, MAX_BYTES);
      } finally {
        clearTimeout(timer);
      }
      if (!bytes || bytes.byteLength === 0) return { book_id: bookId, status: "failed: empty or over 2 MB" };

      const path = `${bookId}/${Date.now()}.${EXTENSIONS[contentType]}`;
      const { error: upErr } = await storage.upload(path, bytes, { contentType, upsert: false });
      if (upErr) throw upErr;
      const publicUrl = storage.getPublicUrl(path).data.publicUrl;

      // Only record it if the original is still the one we downloaded.
      const { data: updated, error: updErr } = await supabase
        .from("books")
        .update({ cover_cached_url: publicUrl, cover_cached_from: source, cover_cached_at: new Date().toISOString() })
        .eq("id", bookId)
        .eq("cover_image_url", source)
        .select("id");
      if (updErr) {
        await storage.remove([path]);
        throw updErr;
      }
      if (!updated || updated.length === 0) {
        await storage.remove([path]);
        return { book_id: bookId, status: "changed_meanwhile" };
      }

      // Drop any older copies.
      const mine = path.slice(bookId.length + 1);
      const others = (await listFiles(bookId)).filter((n) => n !== mine);
      if (others.length > 0) await storage.remove(others.map((n) => `${bookId}/${n}`));
      return { book_id: bookId, status: "cached" };
    } catch (e) {
      // The existing stored copy (if any) is left untouched.
      console.error(`cache-book-cover failed for ${bookId}:`, e);
      return { book_id: bookId, status: `failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  };

  const results = await Promise.all(bookIds.map(processBook));
  return json({ results });
});
