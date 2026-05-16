REVOKE EXECUTE ON FUNCTION public.increment_think_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_think_usage(uuid) TO service_role;