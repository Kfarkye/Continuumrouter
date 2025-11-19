/*
  # Add Project Support to Saved Schemas

  1. Changes
    - Add `project_id` column to `saved_schemas` table
    - Create index on project_id for performance
    - Migrate existing schemas to use project_id from their session

  2. Benefits
    - Schemas can be filtered by project
    - Direct relationship between schemas and projects
    - Better organization of saved schemas

  3. Migration Strategy
    - For existing schemas, look up project_id from the session's conversation
    - If no session found, assign to user's first project
*/

-- Add project_id column to saved_schemas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'saved_schemas' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE saved_schemas ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_saved_schemas_project_id ON saved_schemas(project_id);
  END IF;
END $$;

-- Migrate existing schemas to have project_id
DO $$
DECLARE
  schema_record RECORD;
  conversation_project_id uuid;
  default_project_id uuid;
BEGIN
  -- Loop through all schemas without project_id
  FOR schema_record IN
    SELECT id, user_id, session_id
    FROM saved_schemas
    WHERE project_id IS NULL
  LOOP
    -- Try to find project_id from the conversation
    SELECT project_id INTO conversation_project_id
    FROM ai_conversations
    WHERE id = schema_record.session_id::uuid
    LIMIT 1;

    -- If found, use it
    IF conversation_project_id IS NOT NULL THEN
      UPDATE saved_schemas
      SET project_id = conversation_project_id
      WHERE id = schema_record.id;
    ELSE
      -- Otherwise, get user's first project
      SELECT id INTO default_project_id
      FROM projects
      WHERE user_id = schema_record.user_id
      ORDER BY created_at ASC
      LIMIT 1;

      -- If user has a project, assign it
      IF default_project_id IS NOT NULL THEN
        UPDATE saved_schemas
        SET project_id = default_project_id
        WHERE id = schema_record.id;
      END IF;
    END IF;
  END LOOP;
END $$;
