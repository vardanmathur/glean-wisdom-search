CREATE OR REPLACE FUNCTION public.preview_book_merge(source_book_id uuid, target_book_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.books%rowtype;
  tgt public.books%rowtype;
  src_count int; tgt_count int;
  public_count int; private_count int; other_count int; clash_count int;
  src_has_summary boolean; tgt_has_summary boolean;
  summary_action text := 'none';
  fill text[] := '{}';
  warns text[] := '{}';
BEGIN
  IF NOT public.has_role('admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF source_book_id IS NULL OR target_book_id IS NULL OR source_book_id = target_book_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Choose two different books');
  END IF;
  SELECT * INTO src FROM public.books WHERE books.id = source_book_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Source book not found'); END IF;
  SELECT * INTO tgt FROM public.books WHERE books.id = target_book_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Target book not found'); END IF;

  SELECT count(*),
         count(*) FILTER (WHERE highlights.visibility = 'public'),
         count(*) FILTER (WHERE highlights.visibility = 'private')
    INTO src_count, public_count, private_count
    FROM public.highlights WHERE highlights.book_id = source_book_id;
  other_count := src_count - public_count - private_count;
  SELECT count(*) INTO tgt_count FROM public.highlights WHERE highlights.book_id = target_book_id;

  SELECT count(*) INTO clash_count
    FROM public.highlights s
    JOIN public.highlights t
      ON t.book_id = target_book_id AND lower(btrim(t.quote)) = lower(btrim(s.quote))
   WHERE s.book_id = source_book_id;

  src_has_summary := EXISTS (SELECT 1 FROM public.book_summaries WHERE book_summaries.book_id = source_book_id);
  tgt_has_summary := EXISTS (SELECT 1 FROM public.book_summaries WHERE book_summaries.book_id = target_book_id);
  IF src_has_summary AND tgt_has_summary THEN summary_action := 'discard_source';
  ELSIF src_has_summary THEN summary_action := 'move_source';
  END IF;

  IF (tgt.isbn IS NULL OR btrim(tgt.isbn) = '') AND src.isbn IS NOT NULL AND btrim(src.isbn) <> '' THEN
    fill := fill || 'isbn';
  END IF;
  IF (tgt.cover_image_url IS NULL OR btrim(tgt.cover_image_url) = '') AND src.cover_image_url IS NOT NULL AND btrim(src.cover_image_url) <> '' THEN
    fill := fill || 'cover_image_url';
  END IF;

  IF lower(btrim(src.title)) <> lower(btrim(tgt.title)) THEN warns := warns || 'Titles differ'; END IF;
  IF lower(btrim(coalesce(src.author, ''))) <> lower(btrim(coalesce(tgt.author, ''))) THEN warns := warns || 'Authors differ'; END IF;
  IF clash_count > 0 THEN warns := warns || (clash_count || ' quote(s) already exist in the target book'); END IF;

  RETURN jsonb_build_object(
    'success', true,
    'source', jsonb_build_object('id', src.id, 'title', src.title, 'author', src.author, 'isbn', src.isbn, 'highlight_count', src_count),
    'target', jsonb_build_object('id', tgt.id, 'title', tgt.title, 'author', tgt.author, 'isbn', tgt.isbn, 'highlight_count', tgt_count),
    'highlights_to_move', src_count,
    'visibility', jsonb_build_object('public', public_count, 'private', private_count, 'other', other_count),
    'summary_action', summary_action,
    'fields_to_fill', to_jsonb(fill),
    'warnings', to_jsonb(warns)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_books(source_book_id uuid, target_book_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.books%rowtype;
  tgt public.books%rowtype;
  moved int := 0;
  remaining int := 0;
  summary_action text := 'none';
  filled text[] := '{}';
BEGIN
  IF NOT public.has_role('admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF source_book_id IS NULL OR target_book_id IS NULL OR source_book_id = target_book_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Choose two different books');
  END IF;

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

    SELECT count(*) INTO remaining FROM public.highlights WHERE highlights.book_id = source_book_id;
    IF remaining > 0 THEN RAISE EXCEPTION 'Highlights still point at the source book'; END IF;

    DELETE FROM public.books WHERE books.id = source_book_id;

    IF (tgt.isbn IS NULL OR btrim(tgt.isbn) = '') AND src.isbn IS NOT NULL AND btrim(src.isbn) <> '' THEN
      UPDATE public.books SET isbn = src.isbn WHERE books.id = target_book_id;
      filled := filled || 'isbn';
    END IF;
    IF (tgt.cover_image_url IS NULL OR btrim(tgt.cover_image_url) = '') AND src.cover_image_url IS NOT NULL AND btrim(src.cover_image_url) <> '' THEN
      UPDATE public.books SET cover_image_url = src.cover_image_url WHERE books.id = target_book_id;
      filled := filled || 'cover_image_url';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'moved_highlights', moved,
      'deleted_source', true,
      'filled_fields', to_jsonb(filled),
      'summary_action', summary_action,
      'source_title', src.title,
      'source_author', src.author,
      'target_id', target_book_id
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_book_merge(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.merge_books(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.preview_book_merge(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_books(uuid, uuid) TO authenticated;