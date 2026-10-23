-- Record only. Run by hand in the Supabase SQL editor on 2026-10-23 (outside Lovable).
-- This is NOT a migration and is not picked up by supabase/migrations.

-- 1. Per-highlight decisions for tag overlap review
CREATE TABLE public.tag_overlap_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id uuid NOT NULL REFERENCES public.highlights(id) ON DELETE CASCADE,
  tag_a text NOT NULL,
  tag_b text NOT NULL,
  removed_tag text NULL,          -- NULL = kept both
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tag_overlap_pair_order CHECK (tag_a < tag_b),
  CONSTRAINT tag_overlap_removed_valid CHECK (removed_tag IS NULL OR removed_tag IN (tag_a, tag_b)),
  CONSTRAINT tag_overlap_unique UNIQUE (highlight_id, tag_a, tag_b)
);
ALTER TABLE public.tag_overlap_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage tag overlap decisions"
  ON public.tag_overlap_decisions FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- 2. Correct tag counts (no 1,000-row cap), incl. unused and unlisted tags
CREATE OR REPLACE FUNCTION public.tag_usage_counts()
RETURNS TABLE (tag text, highlight_count bigint, in_taxonomy boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.tag, u.n,
         EXISTS (SELECT 1 FROM public.tags WHERE lower(tags.name) = lower(u.tag))
  FROM (SELECT t.tag, count(*) AS n
        FROM public.highlights CROSS JOIN LATERAL unnest(highlights.tags) AS t(tag)
        GROUP BY t.tag) u
  WHERE public.has_role('admin')
  UNION ALL
  SELECT tags.name, 0, true
  FROM public.tags
  WHERE public.has_role('admin')
    AND NOT EXISTS (SELECT 1 FROM public.highlights
                    CROSS JOIN LATERAL unnest(highlights.tags) AS t(tag)
                    WHERE lower(t.tag) = lower(tags.name));
$$;

-- 3. Ranked tag pairs with review progress (decisions expire after N months)
CREATE OR REPLACE FUNCTION public.tag_overlap_pairs(min_shared integer DEFAULT 5,
                                                    expiry_months integer DEFAULT 12)
RETURNS TABLE (tag_a text, tag_b text, count_a bigint, count_b bigint,
               shared bigint, to_review bigint,
               share_of_smaller numeric, meaning_similarity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ht AS (
    SELECT highlights.id AS hid, t.tag
    FROM public.highlights CROSS JOIN LATERAL unnest(highlights.tags) AS t(tag)
  ),
  sizes AS (SELECT ht.tag, count(*) AS n FROM ht GROUP BY ht.tag),
  centroids AS (
    SELECT t.tag, avg(highlights.embedding) AS centroid
    FROM public.highlights CROSS JOIN LATERAL unnest(highlights.tags) AS t(tag)
    WHERE highlights.embedding IS NOT NULL
    GROUP BY t.tag
  ),
  pairs AS (
    SELECT a.tag AS t1, b.tag AS t2, a.hid
    FROM ht a JOIN ht b ON a.hid = b.hid AND a.tag < b.tag
  ),
  agg AS (
    SELECT pairs.t1, pairs.t2, count(*) AS shared,
           count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM public.tag_overlap_decisions d
             WHERE d.highlight_id = pairs.hid AND d.tag_a = pairs.t1 AND d.tag_b = pairs.t2
               AND d.decided_at > now() - make_interval(months => expiry_months)
           )) AS to_review
    FROM pairs GROUP BY pairs.t1, pairs.t2
  )
  SELECT agg.t1, agg.t2, sa.n, sb.n, agg.shared, agg.to_review,
         round(agg.shared::numeric / least(sa.n, sb.n), 2),
         round((1 - (ca.centroid <=> cb.centroid))::numeric, 3)
  FROM agg
  JOIN sizes sa ON sa.tag = agg.t1
  JOIN sizes sb ON sb.tag = agg.t2
  LEFT JOIN centroids ca ON ca.tag = agg.t1
  LEFT JOIN centroids cb ON cb.tag = agg.t2
  WHERE public.has_role('admin') AND agg.shared >= min_shared
  ORDER BY 7 DESC, 5 DESC;
$$;

-- 4. Unreviewed highlights for one pair, with a "fit" hint per tag
CREATE OR REPLACE FUNCTION public.tag_overlap_highlights(p_tag_a text, p_tag_b text,
                                                         expiry_months integer DEFAULT 12)
RETURNS TABLE (highlight_id uuid, quote text, my_notes text, tags text[],
               book_title text, book_author text, fit_a numeric, fit_b numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT t.tag, avg(highlights.embedding) AS centroid
    FROM public.highlights CROSS JOIN LATERAL unnest(highlights.tags) AS t(tag)
    WHERE highlights.embedding IS NOT NULL AND t.tag IN (p_tag_a, p_tag_b)
    GROUP BY t.tag
  )
  SELECT highlights.id, highlights.quote, highlights.my_notes, highlights.tags,
         books.title, books.author,
         round((1 - (highlights.embedding <=> ca.centroid))::numeric, 3),
         round((1 - (highlights.embedding <=> cb.centroid))::numeric, 3)
  FROM public.highlights
  JOIN public.books ON books.id = highlights.book_id
  LEFT JOIN c ca ON ca.tag = p_tag_a
  LEFT JOIN c cb ON cb.tag = p_tag_b
  WHERE public.has_role('admin')
    AND highlights.tags @> ARRAY[p_tag_a, p_tag_b]
    AND NOT EXISTS (
      SELECT 1 FROM public.tag_overlap_decisions d
      WHERE d.highlight_id = highlights.id
        AND d.tag_a = least(p_tag_a, p_tag_b) AND d.tag_b = greatest(p_tag_a, p_tag_b)
        AND d.decided_at > now() - make_interval(months => expiry_months))
  ORDER BY highlights.created_at;
$$;

-- 5. Record one decision for one highlight (optionally removing one tag)
CREATE OR REPLACE FUNCTION public.resolve_tag_overlap(p_highlight_id uuid, p_tag_a text,
                                                      p_tag_b text, p_remove_tag text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_a text := least(trim(p_tag_a), trim(p_tag_b));
  v_b text := greatest(trim(p_tag_a), trim(p_tag_b));
  v_tags text[];
BEGIN
  IF NOT public.has_role('admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;
  IF v_a = v_b THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tags must be different');
  END IF;
  IF p_remove_tag IS NOT NULL AND p_remove_tag NOT IN (v_a, v_b) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Removed tag must be one of the pair');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.highlights
                 WHERE highlights.id = p_highlight_id AND highlights.tags @> ARRAY[v_a, v_b]) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Highlight no longer has both tags');
  END IF;
  IF p_remove_tag IS NOT NULL THEN
    UPDATE public.highlights SET tags = array_remove(highlights.tags, p_remove_tag)
    WHERE highlights.id = p_highlight_id;
  END IF;
  INSERT INTO public.tag_overlap_decisions (highlight_id, tag_a, tag_b, removed_tag)
  VALUES (p_highlight_id, v_a, v_b, p_remove_tag)
  ON CONFLICT (highlight_id, tag_a, tag_b)
  DO UPDATE SET removed_tag = EXCLUDED.removed_tag, decided_at = now();
  SELECT highlights.tags INTO v_tags FROM public.highlights WHERE highlights.id = p_highlight_id;
  RETURN jsonb_build_object('success', true, 'tags', v_tags);
END; $$;

-- 6. Undo the decision for one highlight + pair
CREATE OR REPLACE FUNCTION public.undo_tag_overlap(p_highlight_id uuid, p_tag_a text, p_tag_b text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_a text := least(trim(p_tag_a), trim(p_tag_b));
  v_b text := greatest(trim(p_tag_a), trim(p_tag_b));
  v_removed text;
  v_tags text[];
BEGIN
  IF NOT public.has_role('admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;
  SELECT d.removed_tag INTO v_removed FROM public.tag_overlap_decisions d
  WHERE d.highlight_id = p_highlight_id AND d.tag_a = v_a AND d.tag_b = v_b;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No decision to undo');
  END IF;
  IF v_removed IS NOT NULL THEN
    UPDATE public.highlights SET tags = array_append(highlights.tags, v_removed)
    WHERE highlights.id = p_highlight_id AND NOT (highlights.tags @> ARRAY[v_removed]);
  END IF;
  DELETE FROM public.tag_overlap_decisions d
  WHERE d.highlight_id = p_highlight_id AND d.tag_a = v_a AND d.tag_b = v_b;
  SELECT highlights.tags INTO v_tags FROM public.highlights WHERE highlights.id = p_highlight_id;
  RETURN jsonb_build_object('success', true, 'tags', v_tags);
END; $$;

-- 7. Grants (functions default to EXECUTE for PUBLIC)
REVOKE EXECUTE ON FUNCTION public.tag_usage_counts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tag_overlap_pairs(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tag_overlap_highlights(text, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_tag_overlap(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.undo_tag_overlap(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tag_usage_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tag_overlap_pairs(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tag_overlap_highlights(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_tag_overlap(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_tag_overlap(uuid, text, text) TO authenticated;
