REVOKE EXECUTE ON FUNCTION public.preview_tag_merge(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.merge_tags(text, text) FROM anon;
ALTER FUNCTION public.preview_tag_merge(text, text) SECURITY INVOKER;