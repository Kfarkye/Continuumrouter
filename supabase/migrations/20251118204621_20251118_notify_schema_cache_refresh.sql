/*
  # Notify PostgREST Schema Cache Refresh

  ## Issue
  Supabase PostgREST layer is showing cached reference to old match_memories function
  signature that no longer exists, causing warnings in logs.

  ## Solution
  1. Update function comment to trigger schema change detection
  2. Notify PostgREST to reload schema cache
  3. Verify only one match_memories function exists

  ## Note
  The actual function is correct and working. This migration forces
  Supabase's API layer to refresh its cached schema information.
*/

-- ============================================================================
-- 1. Update function comment to trigger schema change detection
-- ============================================================================

COMMENT ON FUNCTION public.match_memories(text, double precision, integer, uuid, uuid) IS 
'Semantic similarity search for memories using pgvector embeddings. 
Parameters: query_embedding (text/json), match_threshold (float 0-1), 
match_count (int), filter_space_id (uuid), filter_user_id (uuid).
Returns memories ranked by cosine similarity. Schema refreshed 2025-11-18.';

-- ============================================================================
-- 2. Notify PostgREST to reload schema cache
-- ============================================================================

-- PostgREST listens for NOTIFY pgrst on the pgrst channel
-- This forces an immediate schema cache reload
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 3. Verify function signature is correct
-- ============================================================================

DO $$
DECLARE
  func_count INTEGER;
  func_args TEXT;
BEGIN
  -- Count how many match_memories functions exist
  SELECT COUNT(*) INTO func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.proname = 'match_memories'
    AND n.nspname = 'public';
  
  IF func_count = 0 THEN
    RAISE EXCEPTION 'match_memories function not found!';
  ELSIF func_count > 1 THEN
    RAISE EXCEPTION 'Multiple match_memories functions found: %. Expected only 1.', func_count;
  END IF;
  
  -- Get the function arguments
  SELECT pg_catalog.pg_get_function_arguments(p.oid) INTO func_args
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.proname = 'match_memories'
    AND n.nspname = 'public';
  
  RAISE NOTICE 'Schema cache refresh complete. Function signature: match_memories(%)', func_args;
END $$;
