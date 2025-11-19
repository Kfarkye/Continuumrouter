/*
  # Create AI Code Chunks Table for Code-Specific Memory (RAG)

  ## Overview
  Implements code-specific memory storage and semantic retrieval using pgvector embeddings.
  Stores chunked code snippets from attached files with embeddings for semantic similarity search.

  ## New Tables

  ### ai_code_chunks
  Stores code chunks with embeddings for semantic retrieval
  - `id` (uuid, primary key) - Unique chunk identifier
  - `session_id` (uuid, FK) - Links to ai_conversations for conversation scoping
  - `user_id` (uuid, FK) - User who owns this chunk
  - `filename` (text) - Source filename for context
  - `chunk_text` (text) - Actual code content of the chunk
  - `embedding` (vector(1536)) - OpenAI text-embedding-3-small vector for semantic search
  - `language` (text) - Programming language detected from file extension
  - `created_at` (timestamptz) - When chunk was stored

  ## New Functions

  ### match_code_chunks
  Performs semantic similarity search on code chunks
  - Parameters:
    - `query_embedding` (text) - JSON stringified embedding vector
    - `match_threshold` (float) - Minimum similarity score (0-1), default 0.7
    - `match_count` (int) - Maximum results to return, default 5
    - `filter_session_id` (uuid) - Scope to specific conversation
    - `filter_user_id` (uuid) - Scope to specific user
  - Returns: Ordered list of chunks with similarity scores

  ## Security
  - RLS enabled on ai_code_chunks table
  - Users can only access their own code chunks
  - Chunks are scoped by both user_id and session_id for isolation

  ## Performance
  - IVFFlat index on embedding column for fast similarity searches
  - Composite indexes for user and session filtering
  - Index on filename for quick file-based lookups

  ## Notes
  - Uses OpenAI text-embedding-3-small (1536 dimensions)
  - Chunks are created with 50-line sliding window with 5-line overlap
  - Embeddings include filename metadata for improved retrieval relevance
*/

-- Ensure pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create ai_code_chunks table
CREATE TABLE IF NOT EXISTS ai_code_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES ai_conversations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  filename text NOT NULL,
  chunk_text text NOT NULL CHECK (length(chunk_text) > 0),
  embedding vector(1536),
  language text DEFAULT 'text',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai_code_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only manage their own code chunks
CREATE POLICY "Users can manage their own code chunks"
  ON ai_code_chunks FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Performance indexes
-- User-specific queries
CREATE INDEX IF NOT EXISTS idx_ai_code_chunks_user_id ON ai_code_chunks(user_id);

-- Session-specific queries (conversation scoping)
CREATE INDEX IF NOT EXISTS idx_ai_code_chunks_session_id ON ai_code_chunks(session_id);

-- Composite index for filtered queries
CREATE INDEX IF NOT EXISTS idx_ai_code_chunks_user_session ON ai_code_chunks(user_id, session_id);

-- Filename lookups
CREATE INDEX IF NOT EXISTS idx_ai_code_chunks_filename ON ai_code_chunks(filename);

-- Language filtering
CREATE INDEX IF NOT EXISTS idx_ai_code_chunks_language ON ai_code_chunks(language);

-- IVFFlat vector similarity search index
-- lists=100 is appropriate for datasets up to ~1M vectors
CREATE INDEX IF NOT EXISTS idx_ai_code_chunks_embedding
  ON ai_code_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Create semantic search function for code chunks
CREATE OR REPLACE FUNCTION match_code_chunks(
  query_embedding text,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_session_id uuid DEFAULT NULL,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  session_id uuid,
  user_id uuid,
  filename text,
  chunk_text text,
  language text,
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
    c.id,
    c.session_id,
    c.user_id,
    c.filename,
    c.chunk_text,
    c.language,
    1 - (c.embedding <=> query_vector) AS similarity,
    c.created_at
  FROM ai_code_chunks c
  WHERE
    (filter_user_id IS NULL OR c.user_id = filter_user_id)
    AND (filter_session_id IS NULL OR c.session_id = filter_session_id)
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_vector)) > match_threshold
  ORDER BY c.embedding <=> query_vector
  LIMIT match_count;
END;
$$;

-- Add table comment for documentation
COMMENT ON TABLE ai_code_chunks IS 'Code chunks with embeddings for semantic code retrieval within conversation context';
COMMENT ON COLUMN ai_code_chunks.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions) for semantic search';
COMMENT ON COLUMN ai_code_chunks.chunk_text IS 'Code content chunk (typically 50 lines with 5-line overlap)';
COMMENT ON FUNCTION match_code_chunks IS 'Semantic similarity search for code chunks using cosine distance';
