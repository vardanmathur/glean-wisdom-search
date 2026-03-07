CREATE POLICY "Authenticated users can insert books"
ON public.books
FOR INSERT
TO authenticated
WITH CHECK (true);