-- Allow the admin to delete any feature_interest row
CREATE POLICY "Admin can delete any interest"
ON public.feature_interest
FOR DELETE
USING ((auth.jwt() ->> 'email'::text) = 'vardan@gmail.com'::text);