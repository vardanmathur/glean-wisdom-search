-- think_usage: per-user per-day AI call count
CREATE TABLE public.think_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  ai_calls_used integer NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);
ALTER TABLE public.think_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own think_usage" ON public.think_usage
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own think_usage" ON public.think_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own think_usage" ON public.think_usage
  FOR UPDATE USING (auth.uid() = user_id);

-- think_sessions: completed Forge/Opponent sessions
CREATE TABLE public.think_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL,
  highlight_ids uuid[],
  user_input text,
  ai_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  promoted boolean NOT NULL DEFAULT false
);
ALTER TABLE public.think_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own think_sessions" ON public.think_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own think_sessions" ON public.think_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- think_config: per-user daily limit
CREATE TABLE public.think_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_limit integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.think_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own think_config" ON public.think_config
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own think_config" ON public.think_config
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own think_config" ON public.think_config
  FOR UPDATE USING (auth.uid() = user_id);