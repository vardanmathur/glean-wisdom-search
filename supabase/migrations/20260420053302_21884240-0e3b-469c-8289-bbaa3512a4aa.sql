CREATE TABLE public.feature_interest (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  feature text NOT NULL CHECK (feature IN ('think', 'import')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, feature)
);

ALTER TABLE public.feature_interest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own interest"
  ON public.feature_interest
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own interest"
  ON public.feature_interest
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admin can read all interest"
  ON public.feature_interest
  FOR SELECT
  USING ((auth.jwt() ->> 'email') = 'vardan@gmail.com');

CREATE INDEX idx_feature_interest_feature ON public.feature_interest(feature);
CREATE INDEX idx_feature_interest_user_id ON public.feature_interest(user_id);