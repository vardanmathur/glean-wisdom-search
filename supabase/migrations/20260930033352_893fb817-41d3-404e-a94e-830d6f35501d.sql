-- 1. Create tags table
CREATE TABLE public.tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX tags_name_ci_unique 
  ON public.tags (lower(name));

GRANT SELECT ON public.tags TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read tags"
  ON public.tags FOR SELECT
  USING (true);

CREATE POLICY "Admin can insert tags"
  ON public.tags FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role('admin'));

CREATE POLICY "Admin can delete tags"
  ON public.tags FOR DELETE
  TO authenticated
  USING (public.has_role('admin'));

CREATE POLICY "Admin can update tags"
  ON public.tags FOR UPDATE
  TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- 2. Seed 66 canonical tags
INSERT INTO public.tags (name) VALUES
  ('Adaptability'),('Ambition'),('Anger Management'),
  ('Anxiety'),('Art'),('Career'),('Change Management'),
  ('Children'),('Communication'),('Death'),
  ('Decision Making'),('Desires'),('Discipline'),
  ('Envy'),('Equanimity'),('Expectations'),
  ('Family'),('Forgiveness'),('Friends'),('Frugality'),
  ('Funny'),('Habits'),('Happiness'),('Health'),
  ('Hiring'),('Honesty'),('Humility'),('Influence'),
  ('Investing'),('Leadership'),('Learning'),('Life'),
  ('Living With Others'),('Love'),('Luck'),('Marriage'),
  ('Mental Health'),('Mistakes'),('Money'),
  ('Moral Compass'),('Motivation'),('Negotiation'),
  ('Networking'),('Outcomes'),('Overwhelmed'),
  ('People'),('Perseverance'),('Personal Safety'),
  ('Positivity'),('Priorities'),('Procrastination'),
  ('Productivity'),('Purpose'),('Quality'),
  ('Rational Thinking'),('Reading'),('Relationships'),
  ('Religion & Spirituality'),('Resilience'),('Success'),
  ('Teaching'),('Thinking'),('Time Management'),
  ('Trust'),('Willpower'),('Work')
ON CONFLICT (lower(name)) DO NOTHING;

-- 3. Preview RPC (authenticated only, public highlights only)
CREATE OR REPLACE FUNCTION public.preview_tag_merge(
  source_tag text,
  target_tag text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_with_source integer;
  only_source integer;
  both_tags integer;
BEGIN
  SELECT COUNT(*) INTO total_with_source
  FROM public.highlights
  WHERE highlights.tags @> ARRAY[trim(source_tag)]
    AND highlights.visibility = 'public';

  SELECT COUNT(*) INTO both_tags
  FROM public.highlights
  WHERE highlights.tags @> ARRAY[trim(source_tag)]
    AND highlights.tags @> ARRAY[trim(target_tag)]
    AND highlights.visibility = 'public';

  only_source := total_with_source - both_tags;

  RETURN jsonb_build_object(
    'total_affected', total_with_source,
    'only_source', only_source,
    'both_tags', both_tags
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.preview_tag_merge(text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_tag_merge(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_tag_merge(text, text)
  TO service_role;

-- 4. Merge RPC (admin only, transactional)
CREATE OR REPLACE FUNCTION public.merge_tags(
  source_tag text,
  target_tag text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count integer := 0;
  deleted_count integer := 0;
BEGIN
  -- Admin check
  IF NOT public.has_role('admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Admin access required'
    );
  END IF;

  -- Reject blank source
  IF trim(source_tag) = '' OR source_tag IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Source tag cannot be blank'
    );
  END IF;

  -- Reject identical tags
  IF lower(trim(source_tag)) = lower(trim(target_tag)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Source and target tags must be different'
    );
  END IF;

  -- Verify target exists in taxonomy
  IF NOT EXISTS (
    SELECT 1 FROM public.tags
    WHERE lower(name) = lower(trim(target_tag))
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Target tag not found: ' || trim(target_tag)
    );
  END IF;

  BEGIN
    -- Replace source with target on all highlights,
    -- deduplicate tags array, trim source consistently
    WITH updated AS (
      UPDATE public.highlights
      SET tags = ARRAY(
        SELECT DISTINCT elem
        FROM unnest(
          array_replace(
            highlights.tags,
            trim(source_tag),
            trim(target_tag)
          )
        ) AS elem
        ORDER BY elem
      )
      WHERE highlights.tags @> ARRAY[trim(source_tag)]
      RETURNING highlights.id
    )
    SELECT COUNT(*) INTO affected_count FROM updated;

    -- Delete source tag from taxonomy
    DELETE FROM public.tags
    WHERE lower(name) = lower(trim(source_tag));

    -- Capture delete row count (valid GET DIAGNOSTICS syntax)
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'affected_count', affected_count,
    'source_deleted', deleted_count > 0
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_tags(text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_tags(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_tags(text, text)
  TO service_role;