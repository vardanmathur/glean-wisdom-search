-- Record only. Run by hand in the Lovable SQL editor on 2026-11-05 (outside Lovable credits).
-- This is NOT a migration and is not picked up by supabase/migrations.
-- Inspire Me: pick the least-shown public highlight (random tie-break) and record the show.

-- 1. Stats table (writes only through the functions below)
CREATE TABLE public.highlight_inspire_stats (
  highlight_id uuid PRIMARY KEY REFERENCES public.highlights(id) ON DELETE CASCADE,
  times_shown integer NOT NULL DEFAULT 0 CHECK (times_shown >= 0),
  last_shown_at timestamptz
);
ALTER TABLE public.highlight_inspire_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read inspire stats"
  ON public.highlight_inspire_stats FOR SELECT TO authenticated
  USING (public.has_role('admin'));
REVOKE ALL ON public.highlight_inspire_stats FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.highlight_inspire_stats FROM authenticated;

-- 2. Pick and record in one call
CREATE OR REPLACE FUNCTION public.pick_inspire_highlight(
  p_avoid_book_id uuid DEFAULT NULL,
  p_include_private boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  SELECT h.id INTO v_id
  FROM public.highlights h
  LEFT JOIN public.highlight_inspire_stats s ON s.highlight_id = h.id
  WHERE h.visibility = 'public'
     OR (p_include_private AND v_uid IS NOT NULL AND h.user_id = v_uid)
  ORDER BY
    (p_avoid_book_id IS NOT NULL AND h.book_id IS NOT DISTINCT FROM p_avoid_book_id),
    COALESCE(s.times_shown, 0),
    random()
  LIMIT 1;

  IF v_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.highlight_inspire_stats AS s (highlight_id, times_shown, last_shown_at)
  VALUES (v_id, 1, now())
  ON CONFLICT (highlight_id)
  DO UPDATE SET times_shown = s.times_shown + 1, last_shown_at = now();

  RETURN v_id;
END; $$;

-- 3. Admin summary for the Hub card
CREATE OR REPLACE FUNCTION public.inspire_stats_summary()
RETURNS TABLE (public_total bigint, shown_at_least_once bigint, never_shown bigint,
               min_shown integer, max_shown integer, total_shows bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*), count(s.highlight_id), count(*) - count(s.highlight_id),
         min(COALESCE(s.times_shown, 0)), max(COALESCE(s.times_shown, 0)),
         COALESCE(sum(s.times_shown), 0)
  FROM public.highlights h
  LEFT JOIN public.highlight_inspire_stats s ON s.highlight_id = h.id
  WHERE h.visibility = 'public' AND public.has_role('admin');
$$;

-- 4. Grants
REVOKE EXECUTE ON FUNCTION public.pick_inspire_highlight(uuid, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.pick_inspire_highlight(uuid, boolean) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.inspire_stats_summary() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.inspire_stats_summary() TO authenticated;
