/*
  # Add model column to ai_messages table

  1. Changes
    - Add `model` column to `ai_messages` table to track which AI model was used
    - Column is nullable to support existing messages
    - Default value is 'system' for compatibility

  2. Notes
    - Existing messages will have NULL model values
    - Future messages will track the specific model used (claude, gemini, openai, etc.)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_messages' AND column_name = 'model'
  ) THEN
    ALTER TABLE ai_messages ADD COLUMN model text DEFAULT 'system';
  END IF;
END $$;