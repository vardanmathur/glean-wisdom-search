
-- Create books table
CREATE TABLE public.books (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  description TEXT,
  isbn TEXT,
  cover_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create highlights table
CREATE TABLE public.highlights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id TEXT UNIQUE,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  location TEXT,
  stars BOOLEAN DEFAULT false,
  highlight_date TIMESTAMP WITH TIME ZONE,
  char_length INTEGER,
  blogged BOOLEAN DEFAULT false,
  my_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create saved_highlights table (user bookmarks)
CREATE TABLE public.saved_highlights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  highlight_id UUID NOT NULL REFERENCES public.highlights(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, highlight_id)
);

-- Enable RLS on all tables
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_highlights ENABLE ROW LEVEL SECURITY;

-- Books and highlights are publicly readable
CREATE POLICY "Books are publicly readable" ON public.books FOR SELECT USING (true);
CREATE POLICY "Highlights are publicly readable" ON public.highlights FOR SELECT USING (true);

-- Saved highlights: users can only manage their own
CREATE POLICY "Users can view their own saved highlights" ON public.saved_highlights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can save highlights" ON public.saved_highlights FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unsave highlights" ON public.saved_highlights FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_highlights_book_id ON public.highlights(book_id);
CREATE INDEX idx_highlights_tags ON public.highlights USING GIN(tags);
CREATE INDEX idx_saved_highlights_user_id ON public.saved_highlights(user_id);
CREATE INDEX idx_highlights_record_id ON public.highlights(record_id);
