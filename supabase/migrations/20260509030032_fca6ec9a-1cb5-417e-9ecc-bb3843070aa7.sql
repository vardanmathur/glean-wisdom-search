-- Storage RLS for worksheets bucket
CREATE POLICY "Users can upload own worksheets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'worksheets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read own worksheets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'worksheets' AND auth.uid()::text = (storage.foldername(name))[1]);