/*
  # Spaces MVP - Minimal Schema Changes

  1. Changes to Existing Tables
    - Add `system_prompt` column to `projects` table (text, nullable)
    - Add `space_id` column to `ai_conversations` table (references projects.id, nullable)

  2. Performance Indexes
    - Add index on `memories.project_id` for fast space-scoped retrieval
    - Add index on `memories.created_at` for recency sorting

  3. Purpose
    - Enable project-scoped AI context via system prompts
    - Link conversations to spaces (projects)
    - Optimize memory retrieval for space context injection
*/

-- Add system_prompt to projects table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'system_prompt'
  ) THEN
    ALTER TABLE projects ADD COLUMN system_prompt TEXT;
  END IF;
END $$;

-- Add space_id to ai_conversations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_conversations' AND column_name = 'space_id'
  ) THEN
    ALTER TABLE ai_conversations ADD COLUMN space_id UUID REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add performance indexes for memory retrieval
CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_space_id ON ai_conversations(space_id);
