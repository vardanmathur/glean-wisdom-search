ALTER TABLE highlights 
ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS highlights_embedding_idx 
ON highlights 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);