/*
  # Add Memory Match Function

  1. New Functions
    - `match_memories` - Performs semantic similarity search on memories using pgvector
      - Parameters:
        - query_embedding (text) - JSON stringified embedding vector
        - match_threshold (float) - Minimum similarity score (0-1)
        - match_count (int) - Maximum number of results
        - filter_space_id (uuid) - Filter by memory space
        - filter_user_id (uuid) - Filter by user
      - Returns ordered list of memories with similarity scores

  2. Purpose
    - Enables semantic search for relevant memories
    - Uses cosine similarity for vector comparison
    - Applies user and space filters for security
*/

-- Create function for semantic memory search
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding text,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_space_id uuid DEFAULT NULL,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  space_id uuid,
  user_id uuid,
  content text,
  kind text,
  metadata jsonb,
  similarity float,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  query_vector vector(1536);
BEGIN
  -- Parse the JSON string into a vector
  query_vector := query_embedding::vector(1536);

  RETURN QUERY
  SELECT
    m.id,
    m.space_id,
    m.user_id,
    m.content,
    m.kind,
    m.metadata,
    1 - (m.embedding <=> query_vector) AS similarity,
    m.created_at
  FROM memories m
  WHERE
    (filter_user_id IS NULL OR m.user_id = filter_user_id)
    AND (filter_space_id IS NULL OR m.space_id = filter_space_id)
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> query_vector)) > match_threshold
  ORDER BY m.embedding <=> query_vector
  LIMIT match_count;
END;
$$;