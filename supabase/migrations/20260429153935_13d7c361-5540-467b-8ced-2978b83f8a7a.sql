-- Feedback table for thumbs up / thumbs down on highlights
CREATE TABLE public.feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  highlight_id uuid NOT NULL REFERENCES public.highlights(id) ON DELETE CASCADE,
  feedback_type text NOT NULL CHECK (feedback_type IN ('thumbs_up', 'thumbs_down')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, highlight_id)
);

CREATE INDEX idx_feedback_highlight_id ON public.feedback(highlight_id);
CREATE INDEX idx_feedback_user_id ON public.feedback(user_id);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Admin full access via has_role RPC
CREATE POLICY "Admin full access on feedback"
  ON public.feedback
  FOR ALL
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- Users can read their own feedback
CREATE POLICY "Users can read their own feedback"
  ON public.feedback
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own feedback
CREATE POLICY "Users can insert their own feedback"
  ON public.feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own feedback
CREATE POLICY "Users can delete their own feedback"
  ON public.feedback
  FOR DELETE
  USING (auth.uid() = user_id);
