/*
  # Validate ai_messages.content column data type

  1. Purpose
    - Ensure the `content` column in `ai_messages` table is of type TEXT
    - TEXT type allows virtually unlimited character storage (up to 1GB in PostgreSQL)
    - This prevents truncation of long AI responses

  2. Validation
    - Query information_schema to check current data type
    - If column is VARCHAR with character limit, convert to TEXT

  3. Migration Safety
    - Uses IF EXISTS checks to prevent errors
    - Conversion from VARCHAR to TEXT is a safe operation in PostgreSQL
    - No data loss occurs during type widening

  4. Notes
    - This is an idempotent migration
    - Can be run multiple times without side effects
    - Critical for supporting long-form AI responses and code generation
*/

-- Check if the table exists first
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'ai_messages'
  ) THEN

    -- Check if content column exists and is not already TEXT
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'ai_messages'
      AND column_name = 'content'
      AND data_type != 'text'
    ) THEN

      -- Convert column to TEXT type
      ALTER TABLE public.ai_messages
      ALTER COLUMN content TYPE TEXT;

      RAISE NOTICE 'Column ai_messages.content converted to TEXT type';

    ELSE
      RAISE NOTICE 'Column ai_messages.content is already TEXT type or does not exist';
    END IF;

  ELSE
    RAISE NOTICE 'Table ai_messages does not exist';
  END IF;
END $$;

-- Verify the final state (for logging/validation purposes)
SELECT
    table_schema,
    table_name,
    column_name,
    data_type,
    character_maximum_length,
    CASE
      WHEN data_type = 'text' THEN '✓ Unlimited capacity'
      WHEN data_type = 'character varying' AND character_maximum_length IS NOT NULL
        THEN '⚠ Limited to ' || character_maximum_length || ' characters'
      ELSE '⚠ Unexpected type: ' || data_type
    END as status
FROM
    information_schema.columns
WHERE
    table_schema = 'public'
    AND table_name = 'ai_messages'
    AND column_name = 'content';
