/*
  # Add Missing Columns to AI Tables

  ## Changes Made
  
  1. **ai_messages table**
    - Add `user_id` column (uuid, references auth.users)
    - This allows tracking which user created each message
    - Nullable to support existing records
  
  2. **ai_conversations table**
    - Add `preferred_model` column (text)
    - Stores the preferred AI model for the conversation
    - Nullable with default to support existing records
  
  ## Security
    - Maintains existing RLS policies
    - No changes to access controls
*/

-- Add user_id column to ai_messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_messages' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE ai_messages ADD COLUMN user_id uuid REFERENCES auth.users(id);
    CREATE INDEX IF NOT EXISTS idx_ai_messages_user_id ON ai_messages(user_id);
  END IF;
END $$;

-- Add preferred_model column to ai_conversations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_conversations' AND column_name = 'preferred_model'
  ) THEN
    ALTER TABLE ai_conversations ADD COLUMN preferred_model text DEFAULT 'system';
  END IF;
END $$;