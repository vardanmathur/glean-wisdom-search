CREATE TABLE public.backlog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  notes text,
  area text NOT NULL DEFAULT 'General',
  priority text NOT NULL DEFAULT 'later' CHECK (priority IN ('next','later','someday')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backlog_items TO authenticated;
GRANT ALL ON public.backlog_items TO service_role;

ALTER TABLE public.backlog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage backlog" ON public.backlog_items
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));