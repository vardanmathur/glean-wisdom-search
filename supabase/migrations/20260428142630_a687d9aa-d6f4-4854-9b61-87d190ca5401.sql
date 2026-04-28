CREATE OR REPLACE FUNCTION public.suggest_tags_for_quote(quote_text text)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  result text[];
  ts_query text;
BEGIN
  SELECT string_agg(lexeme, ' | ')
    INTO ts_query
  FROM (
    SELECT DISTINCT lower(regexp_replace(word, '[^a-zA-Z0-9]', '', 'g')) AS lexeme
    FROM unnest(regexp_split_to_array(quote_text, '\s+')) AS word
    WHERE length(regexp_replace(word, '[^a-zA-Z0-9]', '', 'g')) >= 4
    LIMIT 30
  ) t
  WHERE lexeme <> '';

  IF ts_query IS NOT NULL AND length(ts_query) > 0 THEN
    BEGIN
      WITH matches AS (
        SELECT h.tags
        FROM public.highlights h
        WHERE h.tags IS NOT NULL
          AND array_length(h.tags, 1) > 0
          AND (h.visibility = 'public' OR h.visibility IS NULL)
          AND to_tsvector('english', h.quote) @@ to_tsquery('english', ts_query)
        LIMIT 50
      ),
      exploded AS (SELECT unnest(tags) AS tag FROM matches),
      ranked AS (
        SELECT tag, count(*) AS freq
        FROM exploded
        WHERE tag IS NOT NULL AND length(trim(tag)) > 0
        GROUP BY tag
        ORDER BY freq DESC, tag ASC
        LIMIT 6
      )
      SELECT array_agg(tag) INTO result FROM ranked;
    EXCEPTION WHEN OTHERS THEN
      result := NULL;
    END;
  END IF;

  RETURN COALESCE(result, ARRAY[]::text[]);
END;
$function$