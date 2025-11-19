/*
  # Optimize Code Snippets Schema with Advanced Features

  ## Overview
  Comprehensive upgrade to the code snippets system with advanced PostgreSQL features
  including hierarchical folders (ltree), full-text search, content hashing, and flexible tagging.

  ## Changes to Existing Tables

  ### code_snippets
  - Change `message_id` from text to uuid for better performance
  - Add `content_hash` (bytea, SHA-256) for deduplication and integrity
  - Add `fts_vector` (tsvector) for weighted full-text search
  - Add `updated_at` column for tracking modifications
  - Add CHECK constraints on `line_count`, `order_index`, and `content`
  - Add trigger for automatic `updated_at` timestamp management

  ### snippet_bookmarks
  - Change `folder_path` from text to ltree for hierarchical queries
  - Add `updated_at` column for tracking modifications
  - Add CHECK constraint to prevent duplicate bookmarks per user
  - Add depth limit constraint (max 10 levels)
  - Add trigger for automatic `updated_at` timestamp management

  ## New Tables

  ### tags
  - Stores unique user-defined tags for flexible categorization
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to auth.users)
  - `name` (text, required)
  - `color_hex` (text, optional) - for UI display
  - `created_at` (timestamptz)
  - UNIQUE constraint on (user_id, name)

  ### snippet_tags
  - Junction table linking snippets to tags (Many-to-Many)
  - `snippet_id` (uuid, FK to code_snippets)
  - `tag_id` (uuid, FK to tags)
  - `user_id` (uuid, FK to auth.users) - denormalized for RLS performance
  - PRIMARY KEY on (snippet_id, tag_id)

  ## Performance Enhancements

  ### Indexes
  - GIN index on `fts_vector` for fast full-text search
  - GiST index on ltree `folder_path` for hierarchical queries
  - BTREE indexes for user-specific and exact path lookups
  - Index on `content_hash` for duplicate detection
  - Composite indexes for user-specific queries with date sorting
  - Optimized indexes on junction table for tag filtering

  ### Full-Text Search
  - Weighted tsvector: Name matches (weight 'A') prioritized over content (weight 'C')
  - Uses 'english' config for names, 'simple' config for code content

  ## Security
  - RLS enabled on all tables with consolidated FOR ALL policies
  - All policies use auth.uid() for user isolation
  - Junction table includes user_id for optimized policy checks

  ## Data Integrity
  - CHECK constraints ensure data quality
  - UNIQUE constraints prevent duplicates
  - Content hashing ensures integrity
  - Hierarchical folder depth limited to 10 levels
*/

-- ============================================================================
-- STEP 1: Setup Extensions and Helper Functions
-- ============================================================================

-- Enable ltree extension for hierarchical folder paths
CREATE EXTENSION IF NOT EXISTS "ltree";

-- Enable pgcrypto for SHA-256 hashing (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create trigger function for automatic updated_at column updates
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- ============================================================================
-- STEP 2: Upgrade Existing code_snippets Table
-- ============================================================================

-- Drop existing policies (will recreate optimized versions)
DROP POLICY IF EXISTS "Users can view own code snippets" ON code_snippets;
DROP POLICY IF EXISTS "Users can insert own code snippets" ON code_snippets;
DROP POLICY IF EXISTS "Users can update own code snippets" ON code_snippets;
DROP POLICY IF EXISTS "Users can delete own code snippets" ON code_snippets;

-- Add updated_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'code_snippets' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE code_snippets ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Convert message_id from text to uuid (existing data is already UUID format)
DO $$
BEGIN
  -- Check if conversion is needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'code_snippets' 
    AND column_name = 'message_id' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE code_snippets
      ALTER COLUMN message_id TYPE uuid USING message_id::uuid;
  END IF;
END $$;

-- Add content_hash column (SHA-256 hash for deduplication)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'code_snippets' AND column_name = 'content_hash'
  ) THEN
    ALTER TABLE code_snippets 
      ADD COLUMN content_hash bytea GENERATED ALWAYS AS (sha256(content::bytea)) STORED;
  END IF;
END $$;

-- Add weighted Full-Text Search vector
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'code_snippets' AND column_name = 'fts_vector'
  ) THEN
    ALTER TABLE code_snippets 
      ADD COLUMN fts_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(user_defined_name, '')), 'A') ||
        setweight(to_tsvector('simple', content), 'C')
      ) STORED;
  END IF;
END $$;

-- Add CHECK constraints for data integrity
DO $$
BEGIN
  -- Check constraint for positive line_count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'code_snippets' AND constraint_name = 'code_snippets_line_count_check'
  ) THEN
    ALTER TABLE code_snippets ADD CONSTRAINT code_snippets_line_count_check CHECK (line_count >= 0);
  END IF;

  -- Check constraint for positive order_index
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'code_snippets' AND constraint_name = 'code_snippets_order_index_check'
  ) THEN
    ALTER TABLE code_snippets ADD CONSTRAINT code_snippets_order_index_check CHECK (order_index >= 0);
  END IF;

  -- Check constraint for non-empty content
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'code_snippets' AND constraint_name = 'code_snippets_content_check'
  ) THEN
    ALTER TABLE code_snippets ADD CONSTRAINT code_snippets_content_check CHECK (length(content) > 0);
  END IF;
END $$;

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_code_snippets_modtime ON code_snippets;
CREATE TRIGGER update_code_snippets_modtime
  BEFORE UPDATE ON code_snippets
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Add new performance indexes
CREATE INDEX IF NOT EXISTS idx_code_snippets_user_hash ON code_snippets(user_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_code_snippets_fts ON code_snippets USING GIN (fts_vector);
CREATE INDEX IF NOT EXISTS idx_code_snippets_language_user ON code_snippets(user_id, language);

-- ============================================================================
-- STEP 3: Upgrade Existing snippet_bookmarks Table
-- ============================================================================

-- Drop existing policies (will recreate optimized versions)
DROP POLICY IF EXISTS "Users can view own bookmarks" ON snippet_bookmarks;
DROP POLICY IF EXISTS "Users can create own bookmarks" ON snippet_bookmarks;
DROP POLICY IF EXISTS "Users can update own bookmarks" ON snippet_bookmarks;
DROP POLICY IF EXISTS "Users can delete own bookmarks" ON snippet_bookmarks;

-- Add updated_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'snippet_bookmarks' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE snippet_bookmarks ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Convert folder_path from text to ltree
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'snippet_bookmarks' 
    AND column_name = 'folder_path' 
    AND data_type = 'text'
  ) THEN
    -- For existing NULL or empty values, set to NULL ltree
    -- For existing paths like "React/Hooks", convert to "React.Hooks" (ltree format)
    ALTER TABLE snippet_bookmarks
      ALTER COLUMN folder_path TYPE ltree 
      USING CASE 
        WHEN folder_path IS NULL OR folder_path = '' THEN NULL
        ELSE replace(folder_path, '/', '.')::ltree
      END;
  END IF;
END $$;

-- Add unique constraint to prevent duplicate bookmarks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'snippet_bookmarks' AND constraint_name = 'unique_user_snippet_bookmark'
  ) THEN
    ALTER TABLE snippet_bookmarks 
      ADD CONSTRAINT unique_user_snippet_bookmark UNIQUE (user_id, snippet_id);
  END IF;
END $$;

-- Add depth limit constraint (max 10 levels)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'snippet_bookmarks' AND constraint_name = 'check_folder_depth'
  ) THEN
    ALTER TABLE snippet_bookmarks 
      ADD CONSTRAINT check_folder_depth CHECK (folder_path IS NULL OR nlevel(folder_path) <= 10);
  END IF;
END $$;

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_snippet_bookmarks_modtime ON snippet_bookmarks;
CREATE TRIGGER update_snippet_bookmarks_modtime
  BEFORE UPDATE ON snippet_bookmarks
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Drop old indexes and add optimized indexes
DROP INDEX IF EXISTS idx_snippet_bookmarks_snippet;
DROP INDEX IF EXISTS idx_snippet_bookmarks_user;

-- User-specific queries with date sorting
CREATE INDEX IF NOT EXISTS idx_snippet_bookmarks_user_date ON snippet_bookmarks(user_id, created_at DESC);

-- ltree hierarchical queries (GiST for pattern matching like 'Programming.*')
CREATE INDEX IF NOT EXISTS idx_snippet_bookmarks_folder_gist ON snippet_bookmarks USING GIST (folder_path);

-- Exact path lookups (BTREE)
CREATE INDEX IF NOT EXISTS idx_snippet_bookmarks_folder_btree ON snippet_bookmarks(folder_path);

-- User + folder path composite for filtered queries
CREATE INDEX IF NOT EXISTS idx_snippet_bookmarks_user_folder ON snippet_bookmarks(user_id, folder_path);

-- ============================================================================
-- STEP 4: Create New tags Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL CHECK (length(name) > 0),
  color_hex text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_user_tag_name UNIQUE (user_id, name)
);

-- Enable RLS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_tags_user_name ON tags(user_id, name);

-- ============================================================================
-- STEP 5: Create New snippet_tags Junction Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS snippet_tags (
  snippet_id uuid REFERENCES code_snippets(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (snippet_id, tag_id)
);

-- Enable RLS
ALTER TABLE snippet_tags ENABLE ROW LEVEL SECURITY;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_snippet_tags_tag_id ON snippet_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_snippet_tags_user_id ON snippet_tags(user_id);

-- ============================================================================
-- STEP 6: Create Consolidated RLS Policies
-- ============================================================================

-- Policies for code_snippets (consolidated FOR ALL)
CREATE POLICY "Users can manage their own code snippets"
  ON code_snippets FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies for snippet_bookmarks (consolidated FOR ALL)
CREATE POLICY "Users can manage their own bookmarks"
  ON snippet_bookmarks FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies for tags (consolidated FOR ALL)
CREATE POLICY "Users can manage their own tags"
  ON tags FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies for snippet_tags (consolidated FOR ALL)
CREATE POLICY "Users can manage their own snippet tag links"
  ON snippet_tags FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- STEP 7: Add Documentation Comments
-- ============================================================================

COMMENT ON TABLE code_snippets IS 'Extracted code blocks with metadata, weighted FTS vectors, and SHA-256 content hashes.';
COMMENT ON COLUMN code_snippets.message_id IS 'Reference (UUID) to the chat message containing this snippet.';
COMMENT ON COLUMN code_snippets.content_hash IS 'SHA-256 hash (bytea) of content for duplicate detection and integrity verification.';
COMMENT ON COLUMN code_snippets.fts_vector IS 'Weighted (Name=A, Content=C) Full-Text Search vector for efficient searching.';

COMMENT ON TABLE snippet_bookmarks IS 'User bookmarks and organization using ltree hierarchical paths.';
COMMENT ON COLUMN snippet_bookmarks.folder_path IS 'Hierarchical path (ltree), e.g., "Programming.React.Hooks". Max depth: 10 levels.';

COMMENT ON TABLE tags IS 'Unique tags defined by users for flexible categorization.';
COMMENT ON COLUMN tags.color_hex IS 'Optional hex color code for UI display (e.g., #FF5733).';

COMMENT ON TABLE snippet_tags IS 'Junction table linking snippets to tags. Includes user_id for RLS efficiency.';
