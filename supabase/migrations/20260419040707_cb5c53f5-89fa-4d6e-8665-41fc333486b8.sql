CREATE TABLE public.kindle_import_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  quote text NOT NULL,
  book_title text NOT NULL,
  author text,
  kindle_location text,
  kindle_timestamp timestamptz,
  my_notes text,
  status text NOT NULL DEFAULT 'pending',
  duplicate_of uuid REFERENCES public.highlights(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kindle_import_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own staging" ON public.kindle_import_staging
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_kindle_staging_session ON public.kindle_import_staging(user_id, session_id);
CREATE INDEX idx_kindle_staging_user_created ON public.kindle_import_staging(user_id, created_at DESC);