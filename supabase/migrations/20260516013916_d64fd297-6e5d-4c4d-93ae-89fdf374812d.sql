CREATE OR REPLACE FUNCTION public.increment_think_usage(_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.think_usage (user_id, date, ai_calls_used)
  VALUES (_user_id, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (user_id, date)
  DO UPDATE SET ai_calls_used = public.think_usage.ai_calls_used + 1;
$$;