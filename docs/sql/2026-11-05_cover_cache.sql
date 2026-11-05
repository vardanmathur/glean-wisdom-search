-- Record only. Run by hand by Vardan on 2026-11-05 (outside Lovable credits).
-- NOT a migration; not picked up by supabase/migrations.
-- The two parts below were run separately.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('covers', 'covers', true, 2097152,
        ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS cover_cached_url  text,
  ADD COLUMN IF NOT EXISTS cover_cached_from text,
  ADD COLUMN IF NOT EXISTS cover_cached_at   timestamptz;
