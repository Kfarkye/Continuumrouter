/*
  # Create Projects Table

  1. New Tables
    - `projects`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users) - owner of the project
      - `name` (text) - project name
      - `description` (text) - optional description
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes to Existing Tables
    - Add `project_id` to `ai_conversations` table
    - Add `project_id` to `memory_spaces` table
    - Add `project_id` to `memories` table

  3. Security
    - Enable RLS on projects table
    - Users can only access their own projects
    - Conversations and memories are scoped to projects

  4. Indexes
    - Index on user_id for performance
    - Index on project_id in related tables
*/

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- Add project_id to ai_conversations if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_conversations' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE ai_conversations ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_project_id ON ai_conversations(project_id);
  END IF;
END $$;

-- Add project_id to memory_spaces if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memory_spaces' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE memory_spaces ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_memory_spaces_project_id ON memory_spaces(project_id);
  END IF;
END $$;

-- Add project_id to memories if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memories' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE memories ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
  END IF;
END $$;

-- Create function to automatically create default project for new users
CREATE OR REPLACE FUNCTION create_default_project()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO projects (user_id, name, description)
  VALUES (NEW.id, 'Default Project', 'Your default workspace');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default project on user signup
DROP TRIGGER IF EXISTS on_auth_user_created_project ON auth.users;
CREATE TRIGGER on_auth_user_created_project
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_project();