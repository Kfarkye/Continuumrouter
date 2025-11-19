/*
  # Add preferred_provider column to ai_conversations

  1. Changes
    - Add `preferred_provider` column to `ai_conversations` table
    - Set default value to 'system'
    - Allow null values for flexibility

  2. Purpose
    - Stores the user's preferred AI provider for the conversation
    - Used by the AI router to respect user preferences
    - Works alongside the existing `preferred_model` column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_conversations' AND column_name = 'preferred_provider'
  ) THEN
    ALTER TABLE ai_conversations ADD COLUMN preferred_provider text DEFAULT 'system';
  END IF;
END $$;
