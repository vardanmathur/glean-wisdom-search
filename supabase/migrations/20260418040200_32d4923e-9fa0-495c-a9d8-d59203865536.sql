-- One-time L2-normalize all stored highlight embeddings to unit length
UPDATE public.highlights
SET embedding = l2_normalize(embedding)
WHERE embedding IS NOT NULL;

-- Rebuild the IVFFlat index so centroids reflect the new (unit-norm) distribution
REINDEX INDEX public.highlights_embedding_idx;