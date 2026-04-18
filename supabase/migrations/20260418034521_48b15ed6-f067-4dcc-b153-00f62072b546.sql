CREATE OR REPLACE FUNCTION public.match_highlights(
  query_embedding vector,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  quote text,
  book_id uuid,
  tags text[],
  my_notes text,
  vector_score double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL ivfflat.probes = 10;

  RETURN QUERY
  SELECT
    h.id,
    h.quote,
    h.book_id,
    h.tags,
    h.my_notes,
    (1 - (h.embedding <=> query_embedding))::double precision AS vector_score
  FROM public.highlights h
  WHERE h.embedding IS NOT NULL
    AND (h.visibility = 'public' OR h.visibility IS NULL)
  ORDER BY h.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_highlights(vector, int) TO anon, authenticated, service_role;