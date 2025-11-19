/*
  # Document Retrieval Functions for RAG Pipeline

  1. Functions
    - `match_documents_chat` - Retrieves documents for chat mode
    - `match_documents_recruiting_general` - Retrieves documents for recruiting general mode
    - `match_documents_recruiting_clinician` - Retrieves documents for recruiting clinician mode (layered)

  2. Features
    - Vector similarity search using cosine distance
    - Pre-filtering by mode and scope for efficiency
    - Threshold-based filtering for relevance
    - Ordered by similarity (ascending distance = higher similarity)

  3. Performance
    - Uses B-Tree indexes for pre-filtering before vector search
    - HNSW index for approximate nearest neighbor search
    - Returns only relevant results above threshold
*/

-- ============================================================================
-- 1. Chat Mode Retrieval Function
-- ============================================================================

CREATE OR REPLACE FUNCTION match_documents_chat(
  query_embedding vector(1536),
  user_id_param uuid,
  space_id_param uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 15
)
RETURNS TABLE (
  id uuid,
  content text,
  filename text,
  metadata jsonb,
  similarity float,
  mode interaction_mode,
  scope document_scope
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ai_documents.id,
    ai_documents.content,
    ai_documents.filename,
    ai_documents.metadata,
    1 - (ai_documents.embedding <=> query_embedding) AS similarity,
    ai_documents.mode,
    ai_documents.scope
  FROM ai_documents
  WHERE ai_documents.user_id = user_id_param
    AND ai_documents.mode = 'chat'::interaction_mode
    AND (
      ai_documents.space_id = space_id_param
      OR ai_documents.scope = 'global'::document_scope
    )
    AND ai_documents.embedding IS NOT NULL
    AND 1 - (ai_documents.embedding <=> query_embedding) > match_threshold
  ORDER BY ai_documents.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_documents_chat IS 'Retrieves documents for chat mode: global chat knowledge OR space-specific knowledge.';

-- ============================================================================
-- 2. Recruiting General Mode Retrieval Function
-- ============================================================================

CREATE OR REPLACE FUNCTION match_documents_recruiting_general(
  query_embedding vector(1536),
  user_id_param uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 15
)
RETURNS TABLE (
  id uuid,
  content text,
  filename text,
  metadata jsonb,
  similarity float,
  mode interaction_mode,
  scope document_scope
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ai_documents.id,
    ai_documents.content,
    ai_documents.filename,
    ai_documents.metadata,
    1 - (ai_documents.embedding <=> query_embedding) AS similarity,
    ai_documents.mode,
    ai_documents.scope
  FROM ai_documents
  WHERE ai_documents.user_id = user_id_param
    AND ai_documents.mode = 'recruiting_general'::interaction_mode
    AND ai_documents.scope = 'global'::document_scope
    AND ai_documents.embedding IS NOT NULL
    AND 1 - (ai_documents.embedding <=> query_embedding) > match_threshold
  ORDER BY ai_documents.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_documents_recruiting_general IS 'Retrieves documents for recruiting general mode: only global recruiting knowledge.';

-- ============================================================================
-- 3. Recruiting Clinician Mode Retrieval Function (Layered)
-- ============================================================================

CREATE OR REPLACE FUNCTION match_documents_recruiting_clinician(
  query_embedding vector(1536),
  user_id_param uuid,
  clinician_id_param uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 15
)
RETURNS TABLE (
  id uuid,
  content text,
  filename text,
  metadata jsonb,
  similarity float,
  mode interaction_mode,
  scope document_scope
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ai_documents.id,
    ai_documents.content,
    ai_documents.filename,
    ai_documents.metadata,
    1 - (ai_documents.embedding <=> query_embedding) AS similarity,
    ai_documents.mode,
    ai_documents.scope
  FROM ai_documents
  WHERE ai_documents.user_id = user_id_param
    AND (
      -- Layer 1: Clinician-specific knowledge
      (
        ai_documents.mode = 'recruiting_clinician'::interaction_mode
        AND ai_documents.clinician_id = clinician_id_param
      )
      OR
      -- Layer 2: Global general recruiting knowledge (base layer)
      (
        ai_documents.mode = 'recruiting_general'::interaction_mode
        AND ai_documents.scope = 'global'::document_scope
      )
    )
    AND ai_documents.embedding IS NOT NULL
    AND 1 - (ai_documents.embedding <=> query_embedding) > match_threshold
  ORDER BY ai_documents.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_documents_recruiting_clinician IS 'Retrieves documents for recruiting clinician mode: clinician-specific knowledge + general recruiting knowledge (layered).';

-- ============================================================================
-- 4. Helper Function: Get Document Count by Mode and Scope
-- ============================================================================

CREATE OR REPLACE FUNCTION get_document_stats(
  user_id_param uuid,
  mode_param interaction_mode
)
RETURNS TABLE (
  scope document_scope,
  count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ai_documents.scope,
    COUNT(*) AS count
  FROM ai_documents
  WHERE ai_documents.user_id = user_id_param
    AND ai_documents.mode = mode_param
  GROUP BY ai_documents.scope
  ORDER BY ai_documents.scope;
$$;

COMMENT ON FUNCTION get_document_stats IS 'Returns document count statistics grouped by scope for a given user and mode.';
