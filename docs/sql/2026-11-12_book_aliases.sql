-- Record only. Run by hand by Vardan on 2026-11-12 (outside Lovable credits).
-- NOT a migration; not picked up by supabase/migrations.

-- 1. Aliases: old or alternative titles that point at a book
CREATE TABLE public.book_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  alias_title text NOT NULL CHECK (btrim(alias_title) <> ''),
  alias_author text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX book_aliases_title_key ON public.book_aliases (lower(btrim(alias_title)));
CREATE INDEX book_aliases_book_id_idx ON public.book_aliases (book_id);
ALTER TABLE public.book_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read book aliases" ON public.book_aliases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins add book aliases" ON public.book_aliases
  FOR INSERT TO authenticated WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins delete book aliases" ON public.book_aliases
  FOR DELETE TO authenticated USING (public.has_role('admin'));
REVOKE ALL ON public.book_aliases FROM anon;

-- 2. Renaming a book records its old title as an alias
CREATE OR REPLACE FUNCTION public.record_book_title_alias()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(btrim(NEW.title)) IS DISTINCT FROM lower(btrim(OLD.title)) THEN
    -- renaming back to an earlier title: it is no longer an alias
    DELETE FROM public.book_aliases
     WHERE book_aliases.book_id = NEW.id
       AND lower(btrim(book_aliases.alias_title)) = lower(btrim(NEW.title));
    IF btrim(coalesce(OLD.title, '')) <> '' THEN
      INSERT INTO public.book_aliases (book_id, alias_title, alias_author)
      VALUES (NEW.id, btrim(OLD.title), OLD.author)
      ON CONFLICT ((lower(btrim(alias_title)))) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.record_book_title_alias() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER books_record_title_alias
  AFTER UPDATE OF title ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.record_book_title_alias();

-- 3. Merging keeps the merged-away title (and its aliases) as aliases of the kept book
CREATE OR REPLACE FUNCTION public.merge_books(source_book_id uuid, target_book_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  src public.books%rowtype;
  tgt public.books%rowtype;
  moved int := 0;
  remaining int := 0;
  summary_action text := 'none';
  filled text[] := '{}';
BEGIN
  IF NOT public.has_role('admin') THEN RETURN jsonb_build_object('success', false, 'error', 'Not authorized'); END IF;
  IF source_book_id IS NULL OR target_book_id IS NULL OR source_book_id = target_book_id THEN RETURN jsonb_build_object('success', false, 'error', 'Choose two different books'); END IF;

  BEGIN
    PERFORM 1 FROM public.books WHERE books.id IN (source_book_id, target_book_id) ORDER BY books.id FOR UPDATE;
    SELECT * INTO src FROM public.books WHERE books.id = source_book_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Source book not found'; END IF;
    SELECT * INTO tgt FROM public.books WHERE books.id = target_book_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Target book not found'; END IF;

    UPDATE public.highlights SET book_id = target_book_id WHERE highlights.book_id = source_book_id;
    GET DIAGNOSTICS moved = ROW_COUNT;

    IF EXISTS (SELECT 1 FROM public.book_summaries WHERE book_summaries.book_id = source_book_id) THEN
      IF EXISTS (SELECT 1 FROM public.book_summaries WHERE book_summaries.book_id = target_book_id) THEN
        DELETE FROM public.book_summaries WHERE book_summaries.book_id = source_book_id;
        summary_action := 'discard_source';
      ELSE
        UPDATE public.book_summaries SET book_id = target_book_id WHERE book_summaries.book_id = source_book_id;
        summary_action := 'move_source';
      END IF;
    END IF;

    -- NEW: carry aliases across, and record the merged-away title as an alias
    UPDATE public.book_aliases SET book_id = target_book_id WHERE book_aliases.book_id = source_book_id;
    IF lower(btrim(src.title)) <> lower(btrim(tgt.title)) THEN
      INSERT INTO public.book_aliases (book_id, alias_title, alias_author)
      VALUES (target_book_id, btrim(src.title), src.author)
      ON CONFLICT ((lower(btrim(alias_title)))) DO UPDATE SET book_id = EXCLUDED.book_id;
    END IF;
    DELETE FROM public.book_aliases
     WHERE book_aliases.book_id = target_book_id
       AND lower(btrim(book_aliases.alias_title)) = lower(btrim(tgt.title));

    SELECT count(*) INTO remaining FROM public.highlights WHERE highlights.book_id = source_book_id;
    IF remaining > 0 THEN RAISE EXCEPTION 'Highlights still point at the source book'; END IF;
    DELETE FROM public.books WHERE books.id = source_book_id;

    IF (tgt.isbn IS NULL OR btrim(tgt.isbn) = '') AND src.isbn IS NOT NULL AND btrim(src.isbn) <> '' THEN
      UPDATE public.books SET isbn = src.isbn WHERE books.id = target_book_id;
      filled := array_append(filled, 'isbn');
    END IF;
    IF (tgt.cover_image_url IS NULL OR btrim(tgt.cover_image_url) = '') AND src.cover_image_url IS NOT NULL AND btrim(src.cover_image_url) <> '' THEN
      UPDATE public.books SET cover_image_url = src.cover_image_url WHERE books.id = target_book_id;
      filled := array_append(filled, 'cover_image_url');
    END IF;

    RETURN jsonb_build_object('success', true, 'moved_highlights', moved, 'deleted_source', true, 'filled_fields', to_jsonb(filled), 'summary_action', summary_action, 'source_title', src.title, 'source_author', src.author, 'target_id', target_book_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
END;
$function$;
