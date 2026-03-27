-- Create topic_summaries table for caching AI-generated topic summaries
CREATE TABLE topic_summaries (
  topic TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE topic_summaries ENABLE ROW LEVEL SECURITY;

-- Public read — anyone can read cached summaries
CREATE POLICY "Public read topic_summaries"
  ON topic_summaries
  FOR SELECT
  USING (true);

-- Only service role can insert/update (edge function uses service role key)
