/*
  # Premium Chat Features Schema

  This migration adds support for premium chat features including:
  - Message ratings (thumbs up/down feedback)
  - Artifacts system (HTML, Mermaid, OpenAPI previews)
  - Citations and sources tracking
  - Enhanced message metadata

  ## New Tables
    - `artifacts`: Stores rendered artifacts separate from messages
    - `message_ratings`: Anonymous analytics for message feedback

  ## Modified Tables
    - `ai_messages`: Add rating column and enhance metadata structure

  ## Security
    - Enable RLS on all new tables
    - Policies ensure users can only access their own data
*/

-- ============================================================================
-- 1. ALTER ai_messages table to support ratings
-- ============================================================================

DO $$
BEGIN
  -- Add rating column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_messages' AND column_name = 'rating'
  ) THEN
    ALTER TABLE ai_messages
    ADD COLUMN rating text CHECK (rating IN ('good', 'bad'));

    CREATE INDEX IF NOT EXISTS idx_ai_messages_rating
    ON ai_messages(rating)
    WHERE rating IS NOT NULL;
  END IF;

  -- Add rated_at timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_messages' AND column_name = 'rated_at'
  ) THEN
    ALTER TABLE ai_messages
    ADD COLUMN rated_at timestamptz;
  END IF;
END $$;

-- ============================================================================
-- 2. CREATE artifacts table
-- ============================================================================

CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  message_id bigint REFERENCES ai_messages(id) ON DELETE CASCADE,

  -- Artifact metadata
  title text NOT NULL,
  artifact_type text NOT NULL CHECK (artifact_type IN ('html', 'mermaid', 'openapi', 'react', 'javascript')),

  -- Content storage
  content text NOT NULL,
  compiled_content text, -- For processed/compiled artifacts

  -- Display preferences
  display_mode text DEFAULT 'preview' CHECK (display_mode IN ('preview', 'code', 'split')),
  is_fullscreen boolean DEFAULT false,

  -- Versioning
  version integer DEFAULT 1,
  parent_artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,

  -- Metadata
  metadata jsonb DEFAULT '{}',

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for artifacts
CREATE INDEX IF NOT EXISTS idx_artifacts_user_id ON artifacts(user_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_conversation_id ON artifacts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_message_id ON artifacts(message_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at DESC);

-- RLS for artifacts
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own artifacts"
  ON artifacts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own artifacts"
  ON artifacts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own artifacts"
  ON artifacts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own artifacts"
  ON artifacts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3. CREATE message_ratings analytics table
-- ============================================================================

CREATE TABLE IF NOT EXISTS message_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id bigint NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,

  -- Rating info
  rating text NOT NULL CHECK (rating IN ('good', 'bad')),

  -- Context at time of rating
  model_used text,
  message_length integer,
  response_time_ms integer,

  -- Optional feedback
  feedback_text text,
  feedback_category text, -- 'accuracy', 'helpfulness', 'speed', 'formatting', 'other'

  -- Analytics metadata
  metadata jsonb DEFAULT '{}',

  -- Timestamps
  created_at timestamptz DEFAULT now(),

  -- Ensure one rating per user per message
  UNIQUE(message_id, user_id)
);

-- Indexes for message_ratings
CREATE INDEX IF NOT EXISTS idx_message_ratings_message_id ON message_ratings(message_id);
CREATE INDEX IF NOT EXISTS idx_message_ratings_user_id ON message_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_message_ratings_rating ON message_ratings(rating);
CREATE INDEX IF NOT EXISTS idx_message_ratings_created_at ON message_ratings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_ratings_model ON message_ratings(model_used);

-- RLS for message_ratings
ALTER TABLE message_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ratings"
  ON message_ratings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own ratings"
  ON message_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ratings"
  ON message_ratings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ratings"
  ON message_ratings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 4. CREATE citations tracking (stored in message metadata)
-- ============================================================================

-- Citations are stored in ai_messages.metadata as:
-- {
--   "citations": [
--     {
--       "id": "uuid",
--       "title": "Source Title",
--       "url": "https://...",
--       "excerpt": "Relevant text excerpt...",
--       "accessed_at": "2024-11-16T...",
--       "confidence": 0.95
--     }
--   ]
-- }

-- Create a helper function to extract citations from messages
CREATE OR REPLACE FUNCTION get_message_citations(message_metadata jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN COALESCE(message_metadata->'citations', '[]'::jsonb);
END;
$$;

-- ============================================================================
-- 5. CREATE artifact_versions table for version history
-- ============================================================================

CREATE TABLE IF NOT EXISTS artifact_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  version_number integer NOT NULL,

  -- Snapshot of content at this version
  content text NOT NULL,
  compiled_content text,

  -- Change metadata
  change_description text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at timestamptz DEFAULT now(),

  UNIQUE(artifact_id, version_number)
);

-- Indexes for artifact_versions
CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact_id ON artifact_versions(artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_created_at ON artifact_versions(created_at DESC);

-- RLS for artifact_versions
ALTER TABLE artifact_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view versions of their artifacts"
  ON artifact_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM artifacts
      WHERE artifacts.id = artifact_versions.artifact_id
      AND artifacts.user_id = auth.uid()
    )
  );

CREATE POLICY "System can create artifact versions"
  ON artifact_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM artifacts
      WHERE artifacts.id = artifact_versions.artifact_id
      AND artifacts.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. CREATE trigger to auto-version artifacts
-- ============================================================================

CREATE OR REPLACE FUNCTION create_artifact_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only create version if content actually changed
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    INSERT INTO artifact_versions (
      artifact_id,
      version_number,
      content,
      compiled_content,
      changed_by,
      created_at
    ) VALUES (
      NEW.id,
      NEW.version,
      NEW.content,
      NEW.compiled_content,
      NEW.user_id,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for auto-versioning
DROP TRIGGER IF EXISTS trigger_create_artifact_version ON artifacts;
CREATE TRIGGER trigger_create_artifact_version
  AFTER UPDATE ON artifacts
  FOR EACH ROW
  EXECUTE FUNCTION create_artifact_version();

-- ============================================================================
-- 7. CREATE updated_at trigger for artifacts
-- ============================================================================

CREATE OR REPLACE FUNCTION update_artifact_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_artifact_timestamp ON artifacts;
CREATE TRIGGER trigger_update_artifact_timestamp
  BEFORE UPDATE ON artifacts
  FOR EACH ROW
  EXECUTE FUNCTION update_artifact_timestamp();

-- ============================================================================
-- 8. CREATE indexes for enhanced message metadata queries
-- ============================================================================

-- Index for messages with citations
CREATE INDEX IF NOT EXISTS idx_ai_messages_has_citations
ON ai_messages((metadata->'citations'))
WHERE metadata ? 'citations';

-- Index for messages with artifacts
CREATE INDEX IF NOT EXISTS idx_ai_messages_has_artifacts
ON ai_messages((metadata->'artifact_id'))
WHERE metadata ? 'artifact_id';

-- ============================================================================
-- 9. CREATE analytics views for message ratings
-- ============================================================================

CREATE OR REPLACE VIEW message_rating_analytics AS
SELECT
  model_used,
  rating,
  COUNT(*) as rating_count,
  AVG(message_length) as avg_message_length,
  AVG(response_time_ms) as avg_response_time,
  DATE_TRUNC('day', created_at) as rating_date
FROM message_ratings
GROUP BY model_used, rating, DATE_TRUNC('day', created_at);

-- ============================================================================
-- 10. CREATE helper functions for artifact management
-- ============================================================================

-- Function to get latest artifact version
CREATE OR REPLACE FUNCTION get_latest_artifact_version(p_artifact_id uuid)
RETURNS artifact_versions
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_version artifact_versions;
BEGIN
  SELECT * INTO v_version
  FROM artifact_versions
  WHERE artifact_id = p_artifact_id
  ORDER BY version_number DESC
  LIMIT 1;

  RETURN v_version;
END;
$$;

-- Function to count artifacts by type for a user
CREATE OR REPLACE FUNCTION count_user_artifacts_by_type(p_user_id uuid)
RETURNS TABLE(artifact_type text, count bigint)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT a.artifact_type, COUNT(*)
  FROM artifacts a
  WHERE a.user_id = p_user_id
  GROUP BY a.artifact_type;
END;
$$;
