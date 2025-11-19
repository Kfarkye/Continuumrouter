/*
  # Fix Orphaned Conversations

  1. Problem
    - Old conversations created before projects feature have NULL project_id
    - These conversations are not visible when filtered by project_id

  2. Solution
    - For each user with NULL project_id conversations:
      - Find or create a default project for that user
      - Assign all their NULL project_id conversations to that project

  3. Changes
    - Updates ai_conversations.project_id for orphaned records
    - Ensures all conversations are associated with a project
*/

-- Function to migrate orphaned conversations
DO $$
DECLARE
  user_record RECORD;
  default_project_id uuid;
BEGIN
  -- Loop through all users who have conversations with NULL project_id
  FOR user_record IN
    SELECT DISTINCT user_id
    FROM ai_conversations
    WHERE project_id IS NULL
  LOOP
    -- Try to find an existing project for this user
    SELECT id INTO default_project_id
    FROM projects
    WHERE user_id = user_record.user_id
    ORDER BY created_at ASC
    LIMIT 1;

    -- If no project exists, create a default one
    IF default_project_id IS NULL THEN
      INSERT INTO projects (user_id, name, description)
      VALUES (user_record.user_id, 'Default Project', 'Migrated conversations')
      RETURNING id INTO default_project_id;

      RAISE NOTICE 'Created default project % for user %', default_project_id, user_record.user_id;
    END IF;

    -- Update all orphaned conversations for this user
    UPDATE ai_conversations
    SET project_id = default_project_id
    WHERE user_id = user_record.user_id
      AND project_id IS NULL;

    RAISE NOTICE 'Migrated conversations for user % to project %', user_record.user_id, default_project_id;
  END LOOP;
END $$;
