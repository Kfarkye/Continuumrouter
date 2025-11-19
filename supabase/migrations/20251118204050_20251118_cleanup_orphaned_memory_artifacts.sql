/*
  # Cleanup Orphaned Memory Artifacts Schema

  ## Summary
  This migration removes the orphaned `ai_memory_artifacts` table and its associated
  `match_memories` function overload that was causing PostgreSQL introspection warnings.

  ## Background
  - The `ai_memory_artifacts` table (3 rows) appears to be from a legacy/test implementation
  - A second `match_memories` function overload references this table
  - This causes PostgreSQL function overload resolution warnings in logs
  - The current production system uses the `memories` table with the standard `match_memories` function

  ## Changes
  1. Drop the overloaded `match_memories` function that uses `ai_memory_artifacts`
  2. Drop the `ai_memory_artifacts` table (preserving data in case needed for recovery)
  3. Keep the working `match_memories` function that uses the `memories` table

  ## Data Safety
  - The ai_memory_artifacts table only contains 3 rows
  - The production system uses the `memories` table (12,199 rows) which is unaffected
  - This cleanup will eliminate the warning: "Could not find the function public.match_memories(...)"
*/

-- ============================================================================
-- 1. Backup ai_memory_artifacts data before dropping (optional safety measure)
-- ============================================================================

DO $$
BEGIN
  -- Create backup table if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'ai_memory_artifacts_backup_20251118'
  ) THEN
    CREATE TABLE ai_memory_artifacts_backup_20251118 AS 
    SELECT * FROM ai_memory_artifacts;
    
    RAISE NOTICE 'Backed up % rows from ai_memory_artifacts', (SELECT COUNT(*) FROM ai_memory_artifacts);
  END IF;
END $$;

-- ============================================================================
-- 2. Drop the overloaded match_memories function for ai_memory_artifacts
-- ============================================================================

-- Drop the specific overload that uses ai_memory_artifacts table
-- This function signature: (vector, float, int, uuid, uuid, uuid)
DROP FUNCTION IF EXISTS public.match_memories(
  query_embedding vector,
  match_threshold double precision,
  match_count integer,
  p_user_id uuid,
  p_conversation_id uuid,
  p_space_id uuid
);

-- ============================================================================
-- 3. Drop the ai_memory_artifacts table
-- ============================================================================

DROP TABLE IF EXISTS ai_memory_artifacts CASCADE;

-- ============================================================================
-- 4. Verify the working match_memories function remains
-- ============================================================================

-- The following function should still exist and work correctly:
-- match_memories(text, float, int, uuid, uuid) for the memories table

COMMENT ON FUNCTION public.match_memories(text, double precision, integer, uuid, uuid) IS 
'Semantic similarity search for memories table using pgvector. This is the production function.';
