
-- Add unique constraint on books title + author for upsert
ALTER TABLE public.books ADD CONSTRAINT books_title_author_unique UNIQUE (title, author);
