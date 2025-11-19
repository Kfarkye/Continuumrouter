/*
  # Add Mode Columns to Existing Tables

  1. Modifications to Existing Tables
    - `projects` table
      - Add `type` (project_type, nullable initially for dual-writing phase)
    - `memories` table
      - Add `mode` (interaction_mode, nullable initially for dual-writing phase)
    - `ai_conversations` table
      - Add `mode` (interaction_mode, nullable initially for dual-writing phase)

  2. Indexes
    - Composite indexes for efficient mode-based filtering
    - Support for context resolution queries

  3. Migration Strategy
    - Add columns as NULLABLE to enable dual-writing
    - Backfill will happen in separate process
    - NOT NULL constraints will be applied in follow-up migration after verification

  4. Notes
    - Projects do NOT get a mode column - they are orthogonal to mode
    - Projects get a type column to categorize them (vertical, clinician, general)
    - Conversations and memories get mode to track context at creation time
*/

-- ============================================================================
-- 1. Add Type Column to Projects Table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'type'
  ) THEN
    ALTER TABLE projects ADD COLUMN type project_type;
  END IF;
END $$;

COMMENT ON COLUMN projects.type IS 'Categorizes the project: vertical (domain-specific), clinician (individual clinician workspace), or general (general purpose).';

-- ============================================================================
-- 2. Add Mode Column to Memories Table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memories' AND column_name = 'mode'
  ) THEN
    ALTER TABLE memories ADD COLUMN mode interaction_mode;
  END IF;
END $$;

COMMENT ON COLUMN memories.mode IS 'The interaction mode when this memory was created. Used for context isolation during retrieval.';

-- ============================================================================
-- 3. Add Mode Column to AI Conversations Table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_conversations' AND column_name = 'mode'
  ) THEN
    ALTER TABLE ai_conversations ADD COLUMN mode interaction_mode;
  END IF;
END $$;

COMMENT ON COLUMN ai_conversations.mode IS 'The interaction mode for this conversation. Prevents mixing chat and recruiting contexts in the same thread.';

-- ============================================================================
-- 4. Create Indexes for Mode-Based Filtering
-- ============================================================================

-- Projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_type
  ON projects (user_id, type);

CREATE INDEX IF NOT EXISTS idx_projects_type_clinician
  ON projects (type, clinician_id)
  WHERE clinician_id IS NOT NULL;

-- Memories indexes
CREATE INDEX IF NOT EXISTS idx_memories_user_mode
  ON memories (user_id, mode);

CREATE INDEX IF NOT EXISTS idx_memories_retrieval
  ON memories (user_id, mode, space_id);

CREATE INDEX IF NOT EXISTS idx_memories_clinician_mode
  ON memories (user_id, mode, clinician_id)
  WHERE clinician_id IS NOT NULL;

-- AI Conversations indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_mode
  ON ai_conversations (user_id, mode);

CREATE INDEX IF NOT EXISTS idx_conversations_lookup
  ON ai_conversations (user_id, mode, space_id);

CREATE INDEX IF NOT EXISTS idx_conversations_mode_space
  ON ai_conversations (mode, space_id)
  WHERE space_id IS NOT NULL;

-- ============================================================================
-- 5. Helper Function for Default Backfill Values
-- ============================================================================

-- This function will be used by backfill scripts to set sensible defaults
CREATE OR REPLACE FUNCTION get_default_mode_for_backfill()
RETURNS interaction_mode AS $$
BEGIN
  -- Default all existing data to 'chat' mode
  -- This can be overridden by more sophisticated backfill logic if needed
  RETURN 'chat'::interaction_mode;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION get_default_project_type_for_backfill()
RETURNS project_type AS $$
BEGIN
  -- Default all existing projects to 'general' type
  -- Projects with clinician_id will be updated to 'clinician' by backfill
  RETURN 'general'::project_type;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION get_default_mode_for_backfill IS 'Returns default interaction_mode for backfilling existing records. Defaults to chat.';
COMMENT ON FUNCTION get_default_project_type_for_backfill IS 'Returns default project_type for backfilling existing projects. Defaults to general.';
