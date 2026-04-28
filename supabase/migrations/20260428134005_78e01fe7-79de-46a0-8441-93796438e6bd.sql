CREATE OR REPLACE FUNCTION public.suggest_tags_for_quote(quote_text text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result text[];
BEGIN
  WITH matches AS (
    SELECT h.tags
    FROM public.highlights h
    WHERE h.tags IS NOT NULL
      AND array_length(h.tags, 1) > 0
      AND (h.visibility = 'public' OR h.visibility IS NULL)
      AND to_tsvector('english', h.quote) @@ plainto_tsquery('english', quote_text)
    LIMIT 15
  ),
  exploded AS (
    SELECT unnest(tags) AS tag FROM matches
  ),
  ranked AS (
    SELECT tag, count(*) AS freq
    FROM exploded
    WHERE tag IS NOT NULL AND length(trim(tag)) > 0
    GROUP BY tag
    ORDER BY freq DESC, tag ASC
    LIMIT 6
  )
  SELECT array_agg(tag) INTO result FROM ranked;
  RETURN COALESCE(result, ARRAY[]::text[]);
END;
$$;