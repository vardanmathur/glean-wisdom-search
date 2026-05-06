DROP POLICY IF EXISTS "Only admin can insert books" ON public.books;

CREATE POLICY "Authenticated users can insert books"
ON public.books
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);