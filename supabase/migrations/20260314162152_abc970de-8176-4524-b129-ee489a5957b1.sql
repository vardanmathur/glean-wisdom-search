DROP POLICY "Authenticated users can insert highlights" ON public.highlights;

CREATE POLICY "Users can insert their own highlights"
ON public.highlights
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);