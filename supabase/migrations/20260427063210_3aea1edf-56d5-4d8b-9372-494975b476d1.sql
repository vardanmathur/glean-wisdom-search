CREATE OR REPLACE FUNCTION public.search_books_fuzzy(search_term text)
RETURNS TABLE(id uuid, title text, author text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT b.id, b.title, b.author
  FROM public.books b
  WHERE regexp_replace(lower(b.title), '[''’]', '', 'g')
        ILIKE '%' || regexp_replace(lower(search_term), '[''’]', '', 'g') || '%'
  ORDER BY b.title
  LIMIT 8;
END;
$$;