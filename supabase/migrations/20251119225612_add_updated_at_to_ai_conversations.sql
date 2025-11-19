/*
  # Add updated_at column to ai_conversations

  1. Changes
    - Add `updated_at` column to `ai_conversations` table
    - Set default to `now()` for new records
    - Backfill existing records with `created_at` value
    - Add trigger to automatically update `updated_at` on row changes

  2. Security
    - No changes to RLS policies
*/

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_conversations' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE ai_conversations ADD COLUMN updated_at timestamptz DEFAULT now();
    
    -- Backfill existing records
    UPDATE ai_conversations SET updated_at = created_at WHERE updated_at IS NULL;
  END IF;
END $$;

-- Create or replace function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS update_ai_conversations_updated_at ON ai_conversations;

CREATE TRIGGER update_ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();