
-- #1 think_usage: remove client INSERT/UPDATE
DROP POLICY IF EXISTS "Users insert own think_usage" ON public.think_usage;
DROP POLICY IF EXISTS "Users update own think_usage" ON public.think_usage;

-- #2 think_config: prevent users changing daily_limit
DROP POLICY IF EXISTS "Users update own think_config" ON public.think_config;
CREATE POLICY "Users update own think_config"
  ON public.think_config FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND daily_limit = (SELECT tc.daily_limit FROM public.think_config tc WHERE tc.user_id = auth.uid())
  );

-- #3 books: admin-only insert
DROP POLICY IF EXISTS "Authenticated users can insert books" ON public.books;
CREATE POLICY "Only admin can insert books"
  ON public.books FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role('admin'));

-- #5 user_profiles: authenticated-only read
DROP POLICY IF EXISTS "Users can view all profiles" ON public.user_profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);
