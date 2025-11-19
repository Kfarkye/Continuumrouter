/*
  # Mode Architecture Foundation - Orthogonal Mode and Space System

  1. New ENUM Types
    - `interaction_mode` - Defines the effective context for data retrieval
      - 'chat' - Normal chat interactions
      - 'recruiting_general' - General recruiting knowledge and strategies
      - 'recruiting_clinician' - Clinician-specific recruiting context
    - `project_type` - Categorizes spaces/projects
      - 'vertical' - Domain-specific spaces (sports betting, life, etc.)
      - 'clinician' - Individual clinician workspaces
      - 'general' - General purpose projects
    - `document_scope` - Visibility level of documents and knowledge
      - 'global' - Available across all contexts for the user
      - 'space' - Scoped to a specific space/project
      - 'clinician' - Scoped to a specific clinician

  2. New Tables
    - `ai_documents` - Unified document storage with vector embeddings
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `space_id` (uuid, nullable, foreign key to projects)
      - `clinician_id` (uuid, nullable)
      - `mode` (interaction_mode) - Tagged mode at upload time
      - `scope` (document_scope) - Visibility scope
      - `filename` (text) - Original filename
      - `content` (text) - Document content
      - `embedding` (vector) - Semantic embedding for RAG
      - `metadata` (jsonb) - Flexible metadata (knowledge_type, document_type, etc.)
      - `created_at` (timestamptz)

  3. Indexes
    - HNSW vector index for similarity search
    - B-Tree composite indexes for efficient pre-filtering
    - Optimized for multi-tenant RAG queries with mode and scope filtering

  4. Security
    - Enable RLS on ai_documents
    - Users can only access their own documents
    - Authorization enforced at query time
*/

-- ============================================================================
-- 1. Create ENUM Types
-- ============================================================================

-- Interaction mode for context resolution
CREATE TYPE interaction_mode AS ENUM ('chat', 'recruiting_general', 'recruiting_clinician');

-- Project categorization
CREATE TYPE project_type AS ENUM ('vertical', 'clinician', 'general');

-- Document visibility scope
CREATE TYPE document_scope AS ENUM ('global', 'space', 'clinician');

-- ============================================================================
-- 2. Create Unified Document Storage Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  space_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  clinician_id UUID REFERENCES clinician_profiles(id) ON DELETE SET NULL,

  -- Promoted metadata for fast filtering
  mode interaction_mode NOT NULL,
  scope document_scope NOT NULL,

  -- Content and metadata
  filename TEXT,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI ada-002 dimensions

  -- Flexible metadata for knowledge_type, document_type, etc.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own documents"
  ON ai_documents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON ai_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON ai_documents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON ai_documents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3. Create Optimized Indexes
-- ============================================================================

-- Vector index for similarity search (HNSW for approximate nearest neighbor)
CREATE INDEX IF NOT EXISTS idx_documents_embedding
  ON ai_documents
  USING hnsw (embedding vector_cosine_ops);

-- B-Tree indexes for pre-filtering before vector search
CREATE INDEX IF NOT EXISTS idx_documents_user_mode_space
  ON ai_documents (user_id, mode, space_id);

CREATE INDEX IF NOT EXISTS idx_documents_user_mode_clinician
  ON ai_documents (user_id, mode, clinician_id);

CREATE INDEX IF NOT EXISTS idx_documents_user_mode_scope
  ON ai_documents (user_id, mode, scope);

-- Lookup by space and mode
CREATE INDEX IF NOT EXISTS idx_documents_space_mode
  ON ai_documents (space_id, mode)
  WHERE space_id IS NOT NULL;

-- Lookup by clinician and mode
CREATE INDEX IF NOT EXISTS idx_documents_clinician_mode
  ON ai_documents (clinician_id, mode)
  WHERE clinician_id IS NOT NULL;

-- ============================================================================
-- 4. Add Timestamp Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_ai_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ai_documents_updated_at
  BEFORE UPDATE ON ai_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_documents_updated_at();

-- ============================================================================
-- 5. Add helpful comments
-- ============================================================================

COMMENT ON TABLE ai_documents IS 'Unified document storage with vector embeddings for RAG retrieval. Supports mode-based context isolation and scope-based visibility control.';
COMMENT ON COLUMN ai_documents.mode IS 'The interaction mode this document was uploaded in, used for context filtering during retrieval.';
COMMENT ON COLUMN ai_documents.scope IS 'Visibility scope: global (user-wide), space (project-specific), or clinician (clinician-specific).';
COMMENT ON COLUMN ai_documents.embedding IS 'Vector embedding for semantic similarity search (1536 dimensions for OpenAI ada-002).';
COMMENT ON COLUMN ai_documents.metadata IS 'Flexible JSONB field for knowledge_type, document_type, tags, and other custom metadata.';
