/*
  # EMERGENCY: Restore Correct match_memories Function

  ## Crisis
  An incorrect script was run that:
  1. Deleted the working match_memories function
  2. Created a broken version with wrong parameter types and table reference
  3. The new version queries ai_memory_artifacts (empty) instead of memories (12,199 rows)
  4. Uses vector type instead of text (breaks Edge Function calls)

  ## This Migration
  1. Drop the broken function
  2. Restore the correct working function that uses the memories table
  3. Verify it works with the memory-lanes Edge Function

  ## Critical Requirements
  - Must accept query_embedding as TEXT (JSON string), not vector
  - Must query the memories table, not ai_memory_artifacts
  - Must use filter_space_id and filter_user_id parameter names (what memory-lanes sends)
*/

-- ============================================================================
-- 1. DROP THE BROKEN FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS public.match_memories(
  vector,
  double precision,
  integer,
  uuid,
  uuid,
  uuid
) CASCADE;

-- ============================================================================
-- 2. RESTORE THE CORRECT WORKING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.match_memories(
  query_embedding text,  -- TEXT (JSON string), not vector!
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_space_id uuid DEFAULT NULL,  -- filter_* names used by memory-lanes
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  space_id uuid,
  user_id uuid,
  content text,
  kind text,
  metadata jsonb,
  similarity float,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  query_vector vector(1536);
BEGIN
  -- Parse the JSON string into a vector
  query_vector := query_embedding::vector(1536);

  RETURN QUERY
  SELECT
    m.id,
    m.space_id,
    m.user_id,
    m.content,
    m.kind,
    m.metadata,
    1 - (m.embedding <=> query_vector) AS similarity,
    m.created_at
  FROM memories m  -- CORRECT TABLE: memories (12,199 rows)
  WHERE
    (filter_user_id IS NULL OR m.user_id = filter_user_id)
    AND (filter_space_id IS NULL OR m.space_id = filter_space_id)
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> query_vector)) > match_threshold
  ORDER BY m.embedding <=> query_vector
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 3. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.match_memories TO service_role;
GRANT EXECUTE ON FUNCTION public.match_memories TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_memories TO anon;

-- ============================================================================
-- 4. ADD COMMENT
-- ============================================================================

COMMENT ON FUNCTION public.match_memories(text, float, int, uuid, uuid) IS 
'PRODUCTION FUNCTION: Semantic similarity search for memories table (12,199 rows).
Accepts query_embedding as TEXT (JSON string), converts to vector internally.
Used by memory-lanes Edge Function. Emergency restore 2025-11-18.';

-- ============================================================================
-- 5. NOTIFY POSTGREST
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 6. VERIFY
-- ============================================================================

DO $$
DECLARE
  func_count INTEGER;
  func_args TEXT;
  table_count INTEGER;
BEGIN
  -- Verify only ONE match_memories function exists
  SELECT COUNT(*) INTO func_count
  FROM pg_proc p
  WHERE p.proname = 'match_memories'
    AND p.pronamespace = 'public'::regnamespace;
  
  IF func_count != 1 THEN
    RAISE EXCEPTION 'Expected 1 match_memories function, found %', func_count;
  END IF;
  
  -- Get arguments
  SELECT pg_get_function_arguments(oid) INTO func_args
  FROM pg_proc
  WHERE proname = 'match_memories'
    AND pronamespace = 'public'::regnamespace;
  
  -- Verify it accepts TEXT not VECTOR
  IF func_args NOT LIKE 'query_embedding text%' THEN
    RAISE EXCEPTION 'Function has wrong signature: %', func_args;
  END IF;
  
  -- Verify memories table exists with data
  SELECT COUNT(*) INTO table_count FROM memories;
  
  RAISE NOTICE '✓ RESTORED: match_memories function with correct signature';
  RAISE NOTICE '✓ Arguments: %', func_args;
  RAISE NOTICE '✓ Memories table has % rows', table_count;
END $$;
