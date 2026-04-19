CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL,
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE(user_id, feature)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own permissions" ON public.user_permissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admin full access" ON public.user_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email = 'vardan@gmail.com'
    )
  );

INSERT INTO public.user_permissions (user_id, feature, granted_by)
SELECT
  u.id,
  f.feature,
  u.id
FROM auth.users u
CROSS JOIN (
  VALUES ('import'), ('think'), ('contribute')
) AS f(feature)
WHERE u.email = 'vardan@gmail.com'
ON CONFLICT (user_id, feature) DO NOTHING;