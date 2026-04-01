import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HighlightRow {
  record_id: string;
  book_title: string;
  author: string;
  quote: string;
  tags: string[];
  location?: string;
  stars?: boolean;
  highlight_date?: string;
  char_length?: number;
  blogged?: boolean;
  my_notes?: string;
  isbn?: string;
  cover_image_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth check ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userEmail = claimsData.claims.email;
    const adminEmail = 'vardan@gmail.com';
    if (userEmail !== adminEmail) {
      return new Response(JSON.stringify({ error: 'Forbidden — admin access only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Proceed with seeding ---
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { rows } = await req.json() as { rows: HighlightRow[] };

    if (!rows || !Array.length) {
      return new Response(JSON.stringify({ error: 'No rows provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract unique books
    const booksMap = new Map<string, { title: string; author: string; isbn?: string; cover_image_url?: string }>();
    for (const row of rows) {
      const key = `${row.book_title}|||${row.author}`;
      if (!booksMap.has(key)) {
        booksMap.set(key, {
          title: row.book_title,
          author: row.author,
          isbn: row.isbn,
          cover_image_url: row.cover_image_url,
        });
      }
    }

    // Upsert books
    const booksArray = Array.from(booksMap.values());
    for (const book of booksArray) {
      const { error } = await supabase.from('books').upsert(
        { title: book.title, author: book.author, isbn: book.isbn, cover_image_url: book.cover_image_url },
        { onConflict: 'title,author', ignoreDuplicates: true }
      );
      if (error) {
        // Try insert if upsert fails (no unique constraint on title,author)
        const { data: existing } = await supabase.from('books')
          .select('id')
          .eq('title', book.title)
          .eq('author', book.author)
          .maybeSingle();
        if (!existing) {
          await supabase.from('books').insert({
            title: book.title,
            author: book.author,
            isbn: book.isbn,
            cover_image_url: book.cover_image_url,
          });
        }
      }
    }

    // Get all books for ID lookup
    const { data: allBooks } = await supabase.from('books').select('id, title, author');
    const bookIdMap = new Map<string, string>();
    for (const b of allBooks || []) {
      bookIdMap.set(`${b.title}|||${b.author}`, b.id);
    }

    // Insert highlights in batches
    const highlightRows = rows.map(row => ({
      record_id: row.record_id,
      book_id: bookIdMap.get(`${row.book_title}|||${row.author}`) || null,
      quote: row.quote,
      tags: row.tags,
      location: row.location || null,
      stars: row.stars || false,
      highlight_date: row.highlight_date || null,
      char_length: row.char_length || null,
      blogged: row.blogged || false,
      my_notes: row.my_notes || null,
    }));

    // Batch insert in chunks of 50
    let inserted = 0;
    let errors: string[] = [];
    for (let i = 0; i < highlightRows.length; i += 50) {
      const batch = highlightRows.slice(i, i + 50);
      const { error } = await supabase.from('highlights').upsert(batch, {
        onConflict: 'record_id',
        ignoreDuplicates: true,
      });
      if (error) {
        errors.push(`Batch ${i}: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      books_count: booksArray.length,
      highlights_inserted: inserted,
      errors,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
